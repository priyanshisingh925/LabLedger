import { Link } from "react-router-dom";
import { ArrowRight, Boxes, Download, ArrowLeftRight, Shield } from "lucide-react";
import { Card, EmptyState, PageHeader, StatCard, TableWrap, Address } from "../components/ui";
import { LoanBadges } from "../components/StatusBadge";
import { useChainNow, useLedger } from "../hooks/useLedger";
import { useWallet } from "../hooks/useWallet";
import { ethLabel, formatTime, isLoanOverdue } from "../utils/format";
import { SpotlightCard } from "../components/reactbits/SpotlightCard";

export default function Dashboard() {
  const { snapshot } = useLedger();
  const { account } = useWallet();
  const chainNow = useChainNow();

  if (!snapshot) return <PageHeader title="Dashboard" subtitle="Live overview of the laboratory, read directly from the smart contract." />;

  const { stats, loans, equipment } = snapshot;
  const nameOf = (id: bigint) => equipment.find((e) => e.id === id)?.name ?? `#${id}`;
  const overdue = loans.filter((l) => isLoanOverdue(l, chainNow)).length;
  const recent = loans.slice(-6).reverse();

  return (
    <>
      <PageHeader
        title="Lab Overview"
        subtitle="Real-time cryptographic state of laboratory equipment, active borrower escrows, and audit records."
        actions={
          <div className="flex items-center gap-2">
            <Link to="/borrow" className="btn-primary btn-sm">
              <Download className="h-3.5 w-3.5" />
              <span>Borrow Equipment</span>
            </Link>
            <Link to="/inventory" className="btn-secondary btn-sm">
              <Boxes className="h-3.5 w-3.5" />
              <span>View Inventory</span>
            </Link>
          </div>
        }
      />

      {/* Primary KPI Grid */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total Equipment" value={stats.totalEquipment} hint={`${stats.unavailable} unavailable · ${stats.retired} retired`} />
        <StatCard label="Available Items" value={stats.available} tone="green" hint="Ready to borrow now" />
        <StatCard label="Active Loans" value={stats.borrowed} tone="blue" hint="Checked out to students" />
        <StatCard label="Overdue Items" value={overdue} tone={overdue ? "red" : "default"} hint="Past scheduled deadline" />
        <StatCard label="Pending Confirmations" value={stats.pendingReturns} tone={stats.pendingReturns ? "amber" : "default"} hint="Awaiting physical check-in" />
        <StatCard label="Borrower Escrow Held" value={ethLabel(stats.totalActiveDeposits)} tone="blue" hint="Protected locked ETH" />
        <StatCard label="Claimable Refunds" value={ethLabel(stats.totalPendingRefunds)} hint="Credited to student wallets" />
        <StatCard label="Treasury Balance" value={ethLabel(stats.treasuryBalance)} tone="green" hint="Accrued late penalty fees" />
      </div>

      {/* Quick Access Action Hub */}
      <div className="grid gap-4 md:grid-cols-3">
        <SpotlightCard spotlightColor="rgba(16, 185, 129, 0.12)" borderColor="rgba(16, 185, 129, 0.3)">
          <div className="flex h-full flex-col justify-between">
            <div>
              <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-400">
                <Download className="h-5 w-5" />
              </div>
              <h3 className="mt-3 text-base font-bold text-white">Borrow Instruments</h3>
              <p className="mt-1 text-xs text-slate-400">Lock required ETH escrow on-chain to borrow verified lab hardware.</p>
            </div>
            <Link to="/borrow" className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-400 hover:text-emerald-300">
              <span>Go to Checkout</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </SpotlightCard>

        <SpotlightCard spotlightColor="rgba(6, 182, 212, 0.12)" borderColor="rgba(6, 182, 212, 0.3)">
          <div className="flex h-full flex-col justify-between">
            <div>
              <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-cyan-500/30 bg-cyan-500/10 text-cyan-400">
                <ArrowLeftRight className="h-5 w-5" />
              </div>
              <h3 className="mt-3 text-base font-bold text-white">Manage Returns</h3>
              <p className="mt-1 text-xs text-slate-400">Submit return requests or verify physical handovers at the desk.</p>
            </div>
            <Link to="/returns" className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-cyan-400 hover:text-cyan-300">
              <span>Return Management</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </SpotlightCard>

        <SpotlightCard spotlightColor="rgba(139, 92, 246, 0.12)" borderColor="rgba(139, 92, 246, 0.3)">
          <div className="flex h-full flex-col justify-between">
            <div>
              <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-violet-500/30 bg-violet-500/10 text-violet-400">
                <Shield className="h-5 w-5" />
              </div>
              <h3 className="mt-3 text-base font-bold text-white">Immutable Audit Trail</h3>
              <p className="mt-1 text-xs text-slate-400">Inspect raw cryptographic events emitted directly by the contract.</p>
            </div>
            <Link to="/activity" className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-violet-400 hover:text-violet-300">
              <span>View Activity Log</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </SpotlightCard>
      </div>

      {/* Recent Loans */}
      <Card
        title="Recent Activity & Loans"
        padded={false}
        actions={
          <Link className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-400 transition hover:text-emerald-300" to="/activity">
            <span>Full audit log</span>
            <ArrowRight className="h-3 w-3" />
          </Link>
        }
      >
        {recent.length === 0 ? (
          <EmptyState title="No active loans yet">Borrow equipment from the “Borrow Equipment” page to see activity here.</EmptyState>
        ) : (
          <TableWrap>
            <table className="min-w-full divide-y divide-white/5">
              <thead className="bg-white/[0.02]">
                <tr>
                  <th className="th">Loan</th>
                  <th className="th">Equipment</th>
                  <th className="th">Borrower</th>
                  <th className="th">Due Date</th>
                  <th className="th">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {recent.map((l) => (
                  <tr
                    key={l.id.toString()}
                    className={`transition-colors hover:bg-white/[0.03] ${
                      isLoanOverdue(l, chainNow) ? "bg-rose-950/20" : ""
                    }`}
                  >
                    <td className="td font-mono font-semibold text-slate-300">#{l.id.toString()}</td>
                    <td className="td font-medium text-white">{nameOf(l.equipmentId)}</td>
                    <td className="td">
                      <Address value={l.borrower} you={l.borrower.toLowerCase() === account?.toLowerCase()} />
                    </td>
                    <td className="td whitespace-nowrap text-slate-300">{formatTime(l.dueAt)}</td>
                    <td className="td">
                      <LoanBadges loan={l} chainNow={chainNow} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
      </Card>

      {/* How accountability works */}
      <Card title="Accountability Architecture">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/20 text-xs font-bold text-emerald-400">1</div>
            <h4 className="mt-2 text-sm font-semibold text-white">Whitelisted Borrowing</h4>
            <p className="mt-1 text-xs leading-relaxed text-slate-400">Only authorized wallets can borrow. Each checkout locks an exact ETH deposit into escrow.</p>
          </div>
          <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-cyan-500/20 text-xs font-bold text-cyan-400">2</div>
            <h4 className="mt-2 text-sm font-semibold text-white">Immutable Event Log</h4>
            <p className="mt-1 text-xs leading-relaxed text-slate-400">Every borrow, return request, confirmation, and penalty is an on-chain event impossible to delete.</p>
          </div>
          <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-500/20 text-xs font-bold text-amber-400">3</div>
            <h4 className="mt-2 text-sm font-semibold text-white">Two-Step Handover</h4>
            <p className="mt-1 text-xs leading-relaxed text-slate-400">Borrowers request return; lab admins inspect and confirm physical handover before refund credit.</p>
          </div>
          <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-500/20 text-xs font-bold text-violet-400">4</div>
            <h4 className="mt-2 text-sm font-semibold text-white">Protected Escrow</h4>
            <p className="mt-1 text-xs leading-relaxed text-slate-400">Late penalties are capped at the deposit. Admin can only withdraw late fees, never student deposits.</p>
          </div>
        </div>
      </Card>
    </>
  );
}

