import { useMemo, useState } from "react";
import { Search, Filter, Plus, X, Ban, CheckCircle2, AlertOctagon } from "lucide-react";
import { Address, Card, EmptyState, PageHeader, TableWrap } from "../components/ui";
import { EquipmentBadge } from "../components/StatusBadge";
import { EquipmentForm } from "../components/EquipmentForm";
import { useActions } from "../hooks/useActions";
import { useLedger } from "../hooks/useLedger";
import { useTx } from "../hooks/useTx";
import { useWallet } from "../hooks/useWallet";
import { EquipmentStatus, LoanStatus } from "../types";
import { ethLabel } from "../utils/format";

export default function Inventory() {
  const { snapshot } = useLedger();
  const { account } = useWallet();
  const actions = useActions();
  const { busy } = useTx();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [status, setStatus] = useState("all");
  const [showForm, setShowForm] = useState(false);

  const isAdmin = !!snapshot?.isAdmin;
  const categories = useMemo(() => Array.from(new Set((snapshot?.equipment ?? []).map((e) => e.category))).sort(), [snapshot]);

  if (!snapshot) return <PageHeader title="Equipment Inventory" subtitle="Everything registered in the laboratory." />;

  const holderOf = (id: bigint) => snapshot.loans.find((l) => l.equipmentId === id && l.status !== LoanStatus.Completed)?.borrower;

  const q = query.trim().toLowerCase();
  const rows = snapshot.equipment.filter((e) => {
    if (q && !(e.name.toLowerCase().includes(q) || e.id.toString() === q || e.description.toLowerCase().includes(q))) return false;
    if (category !== "all" && e.category !== category) return false;
    if (status !== "all" && String(e.status) !== status) return false;
    return true;
  });

  const change = (id: bigint, name: string, to: EquipmentStatus, verb: string) => {
    if (to === EquipmentStatus.Retired && !window.confirm(`Retire "${name}"? Retired equipment can never be borrowed again.`)) return;
    void actions.setEquipmentStatus(id, to, `${verb} "${name}"`);
  };

  return (
    <>
      <PageHeader
        title="Equipment Inventory"
        subtitle="Search and filter verified instruments registered on-chain. Records are never deleted, ensuring continuous traceability."
        actions={
          isAdmin ? (
            <button className="btn-primary" onClick={() => setShowForm((s) => !s)}>
              {showForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
              <span>{showForm ? "Close Form" : "Register Equipment"}</span>
            </button>
          ) : undefined
        }
      />

      {isAdmin && showForm && (
        <Card title="Register New Equipment on Ledger">
          <EquipmentForm />
        </Card>
      )}

      <Card padded={false}>
        {/* Search & Filter Toolbar */}
        <div className="grid gap-3 border-b border-white/10 p-4 sm:grid-cols-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <input
              className="input pl-10"
              placeholder="Search by name, ID or specs…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search equipment"
            />
          </div>
          <div className="relative">
            <Filter className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <select
              className="input pl-10"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              aria-label="Filter by category"
            >
              <option value="all">All Categories</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c || "(General)"}
                </option>
              ))}
            </select>
          </div>
          <select
            className="input"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            aria-label="Filter by availability"
          >
            <option value="all">All Statuses</option>
            <option value={EquipmentStatus.Available}>Available Only</option>
            <option value={EquipmentStatus.Borrowed}>Currently Borrowed</option>
            <option value={EquipmentStatus.Unavailable}>Unavailable</option>
            <option value={EquipmentStatus.Retired}>Retired (Archived)</option>
          </select>
        </div>

        {rows.length === 0 ? (
          <EmptyState title="No equipment matches your filters">
            Adjust the search criteria{snapshot.equipment.length === 0 ? " or run `npm run seed` to add sample instruments" : ""}.
          </EmptyState>
        ) : (
          <TableWrap>
            <table className="min-w-full divide-y divide-white/5">
              <thead className="bg-white/[0.02]">
                <tr>
                  <th className="th">ID</th>
                  <th className="th">Equipment Details</th>
                  <th className="th">Category</th>
                  <th className="th">Required Escrow</th>
                  <th className="th">Availability</th>
                  <th className="th">Current Holder</th>
                  {isAdmin && <th className="th">Admin Controls</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {rows.map((e) => {
                  const holder = holderOf(e.id);
                  const mine = !!holder && holder.toLowerCase() === account?.toLowerCase();
                  return (
                    <tr key={e.id.toString()} className="transition-colors hover:bg-white/[0.02]">
                      <td className="td font-mono font-semibold text-slate-300">#{e.id.toString()}</td>
                      <td className="td">
                        <p className="font-semibold text-white">{e.name}</p>
                        <p className="mt-0.5 max-w-md text-xs text-slate-400">{e.description}</p>
                      </td>
                      <td className="td">
                        <span className="rounded-md border border-white/10 bg-white/5 px-2 py-0.5 text-xs text-slate-300">
                          {e.category || "General"}
                        </span>
                      </td>
                      <td className="td whitespace-nowrap font-mono font-bold text-emerald-400">
                        {ethLabel(e.deposit)}
                      </td>
                      <td className="td">
                        <EquipmentBadge status={e.status} />
                      </td>
                      <td className="td">
                        {holder ? (
                          isAdmin || mine ? (
                            <Address value={holder} you={mine} />
                          ) : (
                            <span className="badge border-white/10 bg-white/5 text-slate-400">Checked Out</span>
                          )
                        ) : (
                          <span className="text-slate-500">—</span>
                        )}
                      </td>
                      {isAdmin && (
                        <td className="td">
                          <div className="flex flex-wrap items-center gap-1.5">
                            {e.status === EquipmentStatus.Available && (
                              <button
                                className="btn-secondary btn-sm"
                                disabled={busy}
                                onClick={() => change(e.id, e.name, EquipmentStatus.Unavailable, "Mark unavailable")}
                              >
                                <Ban className="h-3 w-3 text-amber-400" />
                                <span>Disable</span>
                              </button>
                            )}
                            {e.status === EquipmentStatus.Unavailable && (
                              <button
                                className="btn-secondary btn-sm"
                                disabled={busy}
                                onClick={() => change(e.id, e.name, EquipmentStatus.Available, "Make available")}
                              >
                                <CheckCircle2 className="h-3 w-3 text-emerald-400" />
                                <span>Enable</span>
                              </button>
                            )}
                            {(e.status === EquipmentStatus.Available || e.status === EquipmentStatus.Unavailable) && (
                              <button
                                className="btn-danger btn-sm"
                                disabled={busy}
                                onClick={() => change(e.id, e.name, EquipmentStatus.Retired, "Retire")}
                              >
                                <AlertOctagon className="h-3 w-3" />
                                <span>Retire</span>
                              </button>
                            )}
                            {e.status === EquipmentStatus.Borrowed && (
                              <span className="text-xs text-slate-400">Return First</span>
                            )}
                            {e.status === EquipmentStatus.Retired && (
                              <span className="text-xs text-slate-500">Archived</span>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </TableWrap>
        )}
      </Card>
    </>
  );
}

