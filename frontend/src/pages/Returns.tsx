import { useState } from "react";
import { CheckCircle2, XCircle, ShieldCheck } from "lucide-react";
import { Address, Card, EmptyState, Notice, PageHeader, TableWrap } from "../components/ui";
import { LoanBadges } from "../components/StatusBadge";
import { useActions } from "../hooks/useActions";
import { useChainNow, useLedger } from "../hooks/useLedger";
import { useTx } from "../hooks/useTx";
import { useWallet } from "../hooks/useWallet";
import { LoanStatus, type Loan } from "../types";
import { ethLabel, formatDuration, formatTime, isLoanOverdue } from "../utils/format";

export default function Returns() {
  const { snapshot } = useLedger();
  const { account, wrongNetwork } = useWallet();
  const actions = useActions();
  const { busy } = useTx();
  const chainNow = useChainNow();
  const [selectedId, setSelectedId] = useState<string>();

  if (!snapshot) return <PageHeader title="Return Management" subtitle="Confirm that equipment was physically received." />;

  const isAdmin = snapshot.isAdmin;
  const nameOf = (id: bigint) => snapshot.equipment.find((e) => e.id === id)?.name ?? `#${id}`;
  const requested = snapshot.loans.filter((l) => l.status === LoanStatus.ReturnRequested);
  const desk = snapshot.loans.filter((l) => l.status === LoanStatus.Active);
  const selected = [...requested, ...desk].find((l) => l.id.toString() === selectedId);
  const canAct = isAdmin && !wrongNetwork && !busy;

  const preview = (l: Loan) => snapshot.settlements[l.id.toString()];

  const renderRow = (l: Loan) => {
    const s = preview(l);
    const isSelected = selectedId === l.id.toString();
    const overdue = isLoanOverdue(l, chainNow);

    return (
      <tr
        key={l.id.toString()}
        className={`cursor-pointer transition-colors ${
          isSelected
            ? "border-l-4 border-l-emerald-400 bg-emerald-500/10"
            : overdue
              ? "bg-rose-950/20 hover:bg-rose-950/30"
              : "hover:bg-white/[0.02]"
        }`}
        onClick={() => setSelectedId(l.id.toString())}
      >
        <td className="td font-mono font-semibold text-slate-300">#{l.id.toString()}</td>
        <td className="td font-medium text-white">{nameOf(l.equipmentId)}</td>
        <td className="td">
          <Address value={l.borrower} you={l.borrower.toLowerCase() === account?.toLowerCase()} />
        </td>
        <td className="td whitespace-nowrap text-slate-400">
          {l.returnRequestedAt ? formatTime(l.returnRequestedAt) : "—"}
        </td>
        <td className="td whitespace-nowrap text-slate-400">{formatTime(l.dueAt)}</td>
        <td className="td">
          <LoanBadges loan={l} chainNow={chainNow} />
        </td>
        <td className="td whitespace-nowrap font-mono text-xs">
          {s ? (
            <span>
              <span className="font-bold text-emerald-400">{ethLabel(s.refund)}</span>
              <span className="text-slate-500"> / </span>
              <span className={s.penalty > 0n ? "font-bold text-rose-400" : "text-slate-500"}>
                {ethLabel(s.penalty)}
              </span>
            </span>
          ) : (
            <span className="text-slate-500">…</span>
          )}
        </td>
      </tr>
    );
  };

  const head = (
    <thead className="bg-white/[0.02]">
      <tr>
        <th className="th">Loan ID</th>
        <th className="th">Equipment</th>
        <th className="th">Borrower</th>
        <th className="th">Return Requested</th>
        <th className="th">Scheduled Due</th>
        <th className="th">Status</th>
        <th className="th">Refund / Late Fee</th>
      </tr>
    </thead>
  );

  const periods = (l: Loan, lateSeconds: number) => (lateSeconds === 0 ? 0 : Math.ceil(lateSeconds / l.penaltyPeriod));

  return (
    <>
      <PageHeader
        title="Return Verification"
        subtitle="Physical check-in gate. Students submit return requests; laboratory administrators verify physical condition and confirm handover before escrow refund is finalized."
      />

      {!isAdmin && (
        <Notice tone="warn" title="Administrator Signature Required">
          Only authorized lab administrators can confirm hardware receipt. You can inspect the verification queue, but confirm and reject actions require the admin key.
        </Notice>
      )}

      {/* Return Requests Queue */}
      <Card title={`Return Requests Awaiting Physical Inspection (${requested.length})`} padded={false}>
        {requested.length === 0 ? (
          <EmptyState title="No pending return requests">
            When a borrower initiates a return request in “My Loans”, it appears in this inspection queue.
          </EmptyState>
        ) : (
          <TableWrap>
            <table className="min-w-full divide-y divide-white/5">
              {head}
              <tbody className="divide-y divide-white/5">{requested.map(renderRow)}</tbody>
            </table>
          </TableWrap>
        )}
      </Card>

      {/* Inspection & Settlement Terminal */}
      {selected && preview(selected) && (() => {
        const s = preview(selected)!;
        return (
          <Card title={`Physical Inspection & Settlement Terminal · Loan #${selected.id}`}>
            <div className="grid gap-6 md:grid-cols-2">
              <dl className="space-y-2 rounded-xl border border-white/5 bg-space-950/60 p-4 text-xs">
                <div className="flex justify-between py-1 border-b border-white/5">
                  <dt className="text-slate-400">Equipment Item</dt>
                  <dd className="font-semibold text-white">{nameOf(selected.equipmentId)}</dd>
                </div>
                <div className="flex justify-between py-1 border-b border-white/5">
                  <dt className="text-slate-400">Borrower Account</dt>
                  <dd>
                    <Address value={selected.borrower} />
                  </dd>
                </div>
                <div className="flex justify-between py-1 border-b border-white/5">
                  <dt className="text-slate-400">Escrow Locked</dt>
                  <dd className="font-mono font-bold text-white">{ethLabel(selected.deposit)}</dd>
                </div>
                <div className="flex justify-between py-1 border-b border-white/5">
                  <dt className="text-slate-400">Evaluation Timestamp</dt>
                  <dd className="text-slate-300">
                    {selected.returnRequestedAt ? "Student Request Timestamp" : "Current Check-in Time"}
                  </dd>
                </div>
                <div className="flex justify-between py-1 border-b border-white/5">
                  <dt className="text-slate-400">Overdue Duration</dt>
                  <dd className={s.late ? "font-semibold text-rose-400" : "text-emerald-400"}>
                    {s.late ? formatDuration(s.lateSeconds) : "On Schedule"}
                  </dd>
                </div>
                <div className="flex justify-between py-1 border-b border-white/5">
                  <dt className="text-slate-400">Penalty Periods</dt>
                  <dd className="text-slate-300">
                    {periods(selected, s.lateSeconds)} × {selected.lateFeeBps / 100}% (unit {formatDuration(selected.penaltyPeriod)})
                  </dd>
                </div>
                <div className="flex justify-between pt-2 text-sm">
                  <dt className="font-semibold text-slate-300">Penalty → Lab Treasury</dt>
                  <dd className={s.penalty > 0n ? "font-mono font-bold text-rose-400" : "font-mono text-slate-400"}>
                    {ethLabel(s.penalty)}
                  </dd>
                </div>
                <div className="flex justify-between text-base">
                  <dt className="font-semibold text-white">Refund → Borrower</dt>
                  <dd className="font-mono font-bold text-emerald-400">{ethLabel(s.refund)}</dd>
                </div>
              </dl>

              <div className="flex flex-col justify-between space-y-4 rounded-xl border border-white/5 bg-white/[0.02] p-4 text-xs text-slate-400">
                <div className="space-y-2 leading-relaxed">
                  <p className="font-semibold text-white flex items-center gap-1.5">
                    <ShieldCheck className="h-4 w-4 text-emerald-400" />
                    <span>Cryptographic Settlement Safeguard</span>
                  </p>
                  <p>
                    Confirming records the return on-chain, credits the escrow refund to the borrower and penalty to the treasury. No ETH is forcefully pushed: borrowers claim refunds pull-style to prevent reentrancy or wallet lockups.
                  </p>
                  <p>
                    Verify physical hardware integrity before confirming. If hardware was not handed over or is severely damaged, reject the request to escalate.
                  </p>
                </div>

                <div className="flex flex-wrap gap-2.5 pt-2">
                  <button
                    className="btn-primary"
                    disabled={!canAct}
                    onClick={() => actions.confirmReturn(selected.id)}
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    <span>Confirm Physical Receipt</span>
                  </button>
                  {selected.status === LoanStatus.ReturnRequested && (
                    <button
                      className="btn-danger"
                      disabled={!canAct}
                      onClick={() => actions.rejectReturn(selected.id)}
                    >
                      <XCircle className="h-4 w-4" />
                      <span>Reject Return Request</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          </Card>
        );
      })()}

      {/* Direct Desk Handover */}
      <Card title={`Active Loans · Direct Desk Handover (${desk.length})`} padded={false}>
        {desk.length === 0 ? (
          <EmptyState title="No unrequested active loans" />
        ) : (
          <>
            <p className="px-5 pt-4 text-xs text-slate-400">
              For walk-in student handovers at the desk without an advance return request, select any loan below and confirm physical receipt directly.
            </p>
            <TableWrap>
              <table className="min-w-full divide-y divide-white/5">
                {head}
                <tbody className="divide-y divide-white/5">{desk.map(renderRow)}</tbody>
              </table>
            </TableWrap>
          </>
        )}
      </Card>
    </>
  );
}

