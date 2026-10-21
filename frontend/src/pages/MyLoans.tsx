import { RotateCcw, Coins } from "lucide-react";
import { Address, Card, EmptyState, Notice, PageHeader, StatCard, TableWrap } from "../components/ui";
import { LoanBadges } from "../components/StatusBadge";
import { useActions } from "../hooks/useActions";
import { useChainNow, useLedger } from "../hooks/useLedger";
import { useTx } from "../hooks/useTx";
import { useWallet } from "../hooks/useWallet";
import { LoanStatus, type Loan } from "../types";
import { ethLabel, formatDuration, formatTime, isLoanOverdue } from "../utils/format";
import { StarBorder } from "../components/reactbits/StarBorder";

export default function MyLoans() {
  const { snapshot } = useLedger();
  const { account, connect, wrongNetwork } = useWallet();
  const actions = useActions();
  const { busy } = useTx();
  const chainNow = useChainNow();

  if (!account) {
    return (
      <>
        <PageHeader title="My Loans" subtitle="Active and historic loans associated with your wallet address." />
        <Notice tone="info" title="Wallet connection required">
          Connect MetaMask to inspect current item custody, return deadlines, and claimable refunds.
          <div className="mt-2.5">
            <button className="btn-primary btn-sm" onClick={connect}>
              Connect MetaMask
            </button>
          </div>
        </Notice>
      </>
    );
  }
  if (!snapshot) return <PageHeader title="My Loans" subtitle="Active and historic loans associated with your wallet address." />;

  const mine = snapshot.loans.filter((l) => l.borrower.toLowerCase() === account.toLowerCase()).reverse();
  const nameOf = (id: bigint) => snapshot.equipment.find((e) => e.id === id)?.name ?? `#${id}`;
  const active = mine.filter((l) => l.status !== LoanStatus.Completed);
  const history = mine.filter((l) => l.status === LoanStatus.Completed);
  const pending = snapshot.pendingRefund;

  const when = (l: Loan) => {
    if (l.status === LoanStatus.Completed) return <span className="text-slate-400">Returned {formatTime(l.returnedAt)}</span>;
    if (l.status === LoanStatus.ReturnRequested) {
      return isLoanOverdue(l, chainNow) ? (
        <span className="font-semibold text-rose-400">Requested after scheduled deadline</span>
      ) : (
        <span className="text-amber-400">Awaiting laboratory staff confirmation</span>
      );
    }
    const left = l.dueAt - chainNow;
    return left >= 0 ? (
      <span className="text-slate-300">Due in {formatDuration(left)}</span>
    ) : (
      <span className="font-semibold text-rose-400">Overdue by {formatDuration(-left)}</span>
    );
  };

  return (
    <>
      <PageHeader
        title="My Loans"
        subtitle="Track active instrument custody, deadline timers, and physical check-in status."
      />

      {wrongNetwork && <Notice tone="warn">Switch MetaMask to the local network to execute transactions.</Notice>}

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Active Items Held" value={active.length} tone="blue" />
        <StatCard label="Completed Records" value={history.length} tone="green" />
        <StatCard
          label="Refund Waiting to Claim"
          value={ethLabel(pending)}
          tone={pending > 0n ? "amber" : "default"}
          hint="Credited to your wallet once returned"
        />
      </div>

      {pending > 0n && (
        <div className="rounded-2xl border border-emerald-500/40 bg-gradient-to-r from-emerald-950/40 via-space-900 to-teal-950/40 p-5 shadow-xl backdrop-blur-xl">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <Coins className="h-5 w-5 text-emerald-400" />
                <h3 className="text-base font-bold text-white">Escrow Refund Ready for Withdrawal</h3>
              </div>
              <p className="mt-1 text-xs text-slate-300">
                You have <strong className="font-mono text-emerald-400">{ethLabel(pending)}</strong> credited from your completed return. Withdraw directly to your connected wallet.
              </p>
            </div>
            <StarBorder
              onClick={() => actions.claimRefund()}
              disabled={busy || wrongNetwork}
              color="#10b981"
            >
              <Coins className="h-4 w-4 text-emerald-400" />
              <span>Claim {ethLabel(pending)} to Wallet</span>
            </StarBorder>
          </div>
        </div>
      )}

      {/* Active Loans */}
      <Card title={`Active Loans in Custody (${active.length})`} padded={false}>
        {active.length === 0 ? (
          <EmptyState title="No active equipment loans">
            Borrow verified hardware from the “Borrow Equipment” catalog.
          </EmptyState>
        ) : (
          <TableWrap>
            <table className="min-w-full divide-y divide-white/5">
              <thead className="bg-white/[0.02]">
                <tr>
                  <th className="th">Loan ID</th>
                  <th className="th">Equipment</th>
                  <th className="th">Checked Out</th>
                  <th className="th">Scheduled Due</th>
                  <th className="th">Escrow Deposit</th>
                  <th className="th">Status</th>
                  <th className="th">Return Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {active.map((l) => {
                  const overdue = isLoanOverdue(l, chainNow);
                  return (
                    <tr
                      key={l.id.toString()}
                      className={`transition-colors hover:bg-white/[0.02] ${overdue ? "bg-rose-950/20" : ""}`}
                    >
                      <td className="td font-mono font-semibold text-slate-300">#{l.id.toString()}</td>
                      <td className="td font-medium text-white">{nameOf(l.equipmentId)}</td>
                      <td className="td whitespace-nowrap text-slate-400">{formatTime(l.checkedOutAt)}</td>
                      <td className="td whitespace-nowrap">
                        <div className="text-slate-200">{formatTime(l.dueAt)}</div>
                        <div className="mt-0.5 text-[11px]">{when(l)}</div>
                      </td>
                      <td className="td whitespace-nowrap font-mono text-emerald-400">{ethLabel(l.deposit)}</td>
                      <td className="td">
                        <LoanBadges loan={l} chainNow={chainNow} />
                      </td>
                      <td className="td">
                        {l.status === LoanStatus.Active ? (
                          <button
                            className="btn-primary btn-sm"
                            disabled={busy || wrongNetwork}
                            onClick={() => actions.requestReturn(l.id)}
                          >
                            <RotateCcw className="h-3 w-3" />
                            <span>Request Return</span>
                          </button>
                        ) : (
                          <span className="badge border-amber-500/30 bg-amber-500/10 text-amber-300">
                            Bring to Lab Desk
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </TableWrap>
        )}
      </Card>

      {/* Completed History */}
      <Card title={`Completed Loan History (${history.length})`} padded={false}>
        {history.length === 0 ? (
          <EmptyState title="No completed loan history yet" />
        ) : (
          <TableWrap>
            <table className="min-w-full divide-y divide-white/5">
              <thead className="bg-white/[0.02]">
                <tr>
                  <th className="th">Loan ID</th>
                  <th className="th">Equipment</th>
                  <th className="th">Checked Out</th>
                  <th className="th">Scheduled Due</th>
                  <th className="th">Returned At</th>
                  <th className="th">Refund Credited</th>
                  <th className="th">Late Penalty</th>
                  <th className="th">Final Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {history.map((l) => (
                  <tr key={l.id.toString()} className="transition-colors hover:bg-white/[0.02]">
                    <td className="td font-mono font-semibold text-slate-300">#{l.id.toString()}</td>
                    <td className="td font-medium text-white">{nameOf(l.equipmentId)}</td>
                    <td className="td whitespace-nowrap text-slate-400">{formatTime(l.checkedOutAt)}</td>
                    <td className="td whitespace-nowrap text-slate-400">{formatTime(l.dueAt)}</td>
                    <td className="td whitespace-nowrap text-slate-400">{formatTime(l.returnedAt)}</td>
                    <td className="td whitespace-nowrap font-mono font-bold text-emerald-400">{ethLabel(l.refund)}</td>
                    <td className="td whitespace-nowrap font-mono">
                      {l.penalty > 0n ? (
                        <span className="font-bold text-rose-400">{ethLabel(l.penalty)}</span>
                      ) : (
                        <span className="text-slate-500">—</span>
                      )}
                    </td>
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

      <div className="flex items-center gap-2 text-xs text-slate-400">
        <span>Connected account:</span>
        <Address value={account} you />
      </div>
    </>
  );
}

