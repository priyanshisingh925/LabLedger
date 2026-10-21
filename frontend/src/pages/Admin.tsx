import { useState, type FormEvent } from "react";
import { getAddress, isAddress, parseEther } from "ethers";
import { UserCheck, ShieldAlert, Sliders, UserMinus, DollarSign } from "lucide-react";
import { Address, Card, EmptyState, Notice, PageHeader, StatCard, TableWrap } from "../components/ui";
import { EquipmentForm } from "../components/EquipmentForm";
import { LoanBadges } from "../components/StatusBadge";
import { useActions } from "../hooks/useActions";
import { useChainNow, useLedger } from "../hooks/useLedger";
import { useTx } from "../hooks/useTx";
import { useWallet } from "../hooks/useWallet";
import { LoanStatus } from "../types";
import { eth, ethLabel, formatDuration, formatTime, isLoanOverdue, nextEscalationLevel } from "../utils/format";

export default function Admin() {
  const { snapshot } = useLedger();
  const { account, wrongNetwork } = useWallet();
  const actions = useActions();
  const { busy } = useTx();
  const chainNow = useChainNow();

  const [student, setStudent] = useState("");
  const [studentErr, setStudentErr] = useState<string>();
  const [wTo, setWTo] = useState("");
  const [wAmount, setWAmount] = useState("");
  const [wErr, setWErr] = useState<string>();
  const [pDur, setPDur] = useState("");
  const [pPeriod, setPPeriod] = useState("");
  const [pBps, setPBps] = useState("");
  const [pErr, setPErr] = useState<string>();

  if (!snapshot) return <PageHeader title="Admin Panel" subtitle="Manage the laboratory." />;

  const { isAdmin, equipment, loans, stats, policy, authorizedBorrowers } = snapshot;
  const canAct = isAdmin && !wrongNetwork && !busy;
  const nameOf = (id: bigint) => equipment.find((e) => e.id === id)?.name ?? `#${id}`;
  const unfinished = loans.filter((l) => l.status !== LoanStatus.Completed).reverse();
  const completed = loans.filter((l) => l.status === LoanStatus.Completed).reverse();
  const owed = stats.totalActiveDeposits + stats.totalPendingRefunds;

  async function authorize(e: FormEvent) {
    e.preventDefault();
    setStudentErr(undefined);
    if (!isAddress(student.trim())) return setStudentErr("Enter a valid wallet address (0x…).");
    const ok = await actions.authorize(getAddress(student.trim()));
    if (ok) setStudent("");
  }

  async function withdraw(e: FormEvent) {
    e.preventDefault();
    setWErr(undefined);
    const to = wTo.trim() || account || "";
    if (!isAddress(to)) return setWErr("Enter a valid destination address.");
    let amount: bigint;
    try {
      amount = parseEther(wAmount.trim() || "0");
    } catch {
      return setWErr("Amount must be a number of ETH.");
    }
    if (amount <= 0n) return setWErr("Amount must be greater than zero.");
    if (amount > stats.treasuryBalance) return setWErr(`Only ${ethLabel(stats.treasuryBalance)} of accrued late fees can be withdrawn. Borrower deposits are protected.`);
    const ok = await actions.withdrawTreasury(getAddress(to), amount);
    if (ok) setWAmount("");
  }

  async function updatePolicy(e: FormEvent) {
    e.preventDefault();
    setPErr(undefined);
    const d = Number(pDur || policy.loanDuration);
    const p = Number(pPeriod || policy.penaltyPeriod);
    const b = Number(pBps || policy.lateFeeBps);
    if (![d, p, b].every((n) => Number.isInteger(n) && n >= 0)) return setPErr("Use whole numbers only.");
    if (d < 1 || p < 1 || b > 10000) return setPErr("Duration and period must be ≥ 1 second; fee must be ≤ 10000 bps (100%).");
    const ok = await actions.setPolicy(d, p, b);
    if (ok) { setPDur(""); setPPeriod(""); setPBps(""); }
  }

  return (
    <>
      <PageHeader
        title="Admin Control Room"
        subtitle="Cryptographic administration: whitelist student wallets, calibrate loan terms, escalate overdue items, and withdraw earned late fees."
      />

      {!isAdmin && (
        <Notice tone="warn" title="Administrator Key Required">
          {account
            ? "The connected wallet is not registered as the contract owner. Administrative buttons are disabled and any direct call will revert."
            : "Connect the administrator wallet (Hardhat account #0 on local development) to manage permissions and policies."}
        </Notice>
      )}

      {/* Equipment Registration */}
      <Card title="Register New Laboratory Instrument">
        <EquipmentForm disabled={!isAdmin} />
      </Card>

      {/* Whitelisted Students */}
      <Card title={`Authorized Borrowers Whitelist (${authorizedBorrowers.length})`}>
        <form onSubmit={authorize} className="flex flex-wrap items-start gap-3">
          <div className="min-w-[18rem] flex-1">
            <input
              className="input font-mono"
              placeholder="Student wallet address 0x…"
              value={student}
              onChange={(e) => setStudent(e.target.value)}
              disabled={!isAdmin}
              aria-label="Student wallet address"
            />
            {studentErr && <p className="mt-1 text-xs text-rose-400">{studentErr}</p>}
          </div>
          <button className="btn-primary" type="submit" disabled={!canAct}>
            <UserCheck className="h-4 w-4" />
            <span>Authorize Student</span>
          </button>
        </form>
        <p className="mt-2 text-xs text-slate-400">
          Revoking a student blocks <em>new</em> checkouts only. A revoked student can always return held items and claim their refund.
        </p>
        {authorizedBorrowers.length === 0 ? (
          <p className="mt-4 text-sm text-slate-400">No students authorized yet.</p>
        ) : (
          <ul className="mt-4 divide-y divide-white/5 rounded-xl border border-white/10 bg-space-950/60">
            {authorizedBorrowers.map((a) => (
              <li key={a} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <span className="break-all font-mono text-xs text-slate-200">{a}</span>
                <button
                  className="btn-secondary btn-sm text-rose-300 hover:text-rose-200"
                  disabled={!canAct}
                  onClick={() => actions.revoke(a)}
                >
                  <UserMinus className="h-3.5 w-3.5" />
                  <span>Revoke</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Overdue & Escalation Queue */}
      <Card title={`Active Loans & Escalation Monitor (${unfinished.length})`} padded={false}>
        {unfinished.length === 0 ? (
          <EmptyState title="No active loans in the lab" />
        ) : (
          <TableWrap>
            <table className="min-w-full divide-y divide-white/5">
              <thead className="bg-white/[0.02]">
                <tr>
                  <th className="th">Loan ID</th>
                  <th className="th">Equipment</th>
                  <th className="th">Borrower</th>
                  <th className="th">Scheduled Due</th>
                  <th className="th">Status</th>
                  <th className="th">Escalation Protocol</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {unfinished.map((l) => {
                  const next = nextEscalationLevel(l, chainNow);
                  const overdue = isLoanOverdue(l, chainNow);
                  return (
                    <tr
                      key={l.id.toString()}
                      className={`transition-colors hover:bg-white/[0.02] ${overdue ? "bg-rose-950/20" : ""}`}
                    >
                      <td className="td font-mono font-semibold text-slate-300">#{l.id.toString()}</td>
                      <td className="td font-medium text-white">{nameOf(l.equipmentId)}</td>
                      <td className="td">
                        <Address value={l.borrower} />
                      </td>
                      <td className="td whitespace-nowrap text-slate-400">{formatTime(l.dueAt)}</td>
                      <td className="td">
                        <LoanBadges loan={l} chainNow={chainNow} />
                      </td>
                      <td className="td">
                        {next.level > 0 ? (
                          <button
                            className="btn-danger btn-sm"
                            disabled={!canAct}
                            onClick={() => actions.escalate(l.id, next.level)}
                          >
                            <ShieldAlert className="h-3.5 w-3.5" />
                            <span>Escalate to Level {next.level}</span>
                          </button>
                        ) : (
                          <span className="text-xs text-slate-400">{next.reason}</span>
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

      {/* Completed Records */}
      <Card title={`Completed Loan Registry (${completed.length})`} padded={false}>
        {completed.length === 0 ? (
          <EmptyState title="No completed loan records yet" />
        ) : (
          <TableWrap>
            <table className="min-w-full divide-y divide-white/5">
              <thead className="bg-white/[0.02]">
                <tr>
                  <th className="th">Loan ID</th>
                  <th className="th">Equipment</th>
                  <th className="th">Borrower</th>
                  <th className="th">Checked Out</th>
                  <th className="th">Returned At</th>
                  <th className="th">Refund Credited</th>
                  <th className="th">Penalty Paid</th>
                  <th className="th">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {completed.map((l) => (
                  <tr key={l.id.toString()} className="transition-colors hover:bg-white/[0.02]">
                    <td className="td font-mono font-semibold text-slate-300">#{l.id.toString()}</td>
                    <td className="td font-medium text-white">{nameOf(l.equipmentId)}</td>
                    <td className="td">
                      <Address value={l.borrower} />
                    </td>
                    <td className="td whitespace-nowrap text-slate-400">{formatTime(l.checkedOutAt)}</td>
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

      {/* Treasury Management */}
      <Card title="Late-Fee Treasury & Escrow Protection">
        <div className="grid gap-4 sm:grid-cols-3">
          <StatCard
            label="Withdrawable Late Fees"
            value={ethLabel(stats.treasuryBalance)}
            tone="green"
            hint="Accrued penalties only"
          />
          <StatCard
            label="Protected Borrower Escrow"
            value={ethLabel(owed)}
            tone="blue"
            hint={`${eth(stats.totalActiveDeposits)} active + ${eth(stats.totalPendingRefunds)} pending`}
          />
          <StatCard label="Total Contract ETH" value={ethLabel(owed + stats.treasuryBalance)} />
        </div>

        <form onSubmit={withdraw} className="mt-6 grid gap-4 sm:grid-cols-[1fr_12rem_auto] sm:items-end">
          <div>
            <label className="label" htmlFor="w-to">Destination Wallet</label>
            <input
              id="w-to"
              className="input font-mono"
              placeholder={account ?? "0x…"}
              value={wTo}
              onChange={(e) => setWTo(e.target.value)}
              disabled={!isAdmin}
            />
          </div>
          <div>
            <label className="label" htmlFor="w-amt">Amount (ETH)</label>
            <div className="flex gap-2">
              <input
                id="w-amt"
                className="input font-mono"
                inputMode="decimal"
                placeholder="0.005"
                value={wAmount}
                onChange={(e) => setWAmount(e.target.value)}
                disabled={!isAdmin}
              />
              <button
                type="button"
                className="btn-secondary btn-sm"
                disabled={!isAdmin}
                onClick={() => setWAmount(eth(stats.treasuryBalance, 18))}
              >
                Max
              </button>
            </div>
          </div>
          <button className="btn-primary" type="submit" disabled={!canAct || stats.treasuryBalance === 0n}>
            <DollarSign className="h-4 w-4" />
            <span>Withdraw Treasury</span>
          </button>
        </form>
        {wErr && <p className="mt-2 text-sm text-rose-400">{wErr}</p>}
        <p className="mt-3 text-xs text-slate-400">
          The smart contract enforces that only accrued penalty fees can be withdrawn. Student escrow deposits and pending refunds cannot be moved.
        </p>
      </Card>

      {/* Policy Calibration */}
      <Card title="Loan Policy Calibration">
        <p className="text-xs leading-relaxed text-slate-400">
          Current terms: <strong>{formatDuration(policy.loanDuration)}</strong> base duration · late fee <strong>{policy.lateFeeBps / 100}%</strong> of deposit per started <strong>{formatDuration(policy.penaltyPeriod)}</strong> (capped at 100% of deposit). Changes apply to <em>new</em> checkouts only.
        </p>
        <form onSubmit={updatePolicy} className="mt-4 grid gap-4 sm:grid-cols-4 sm:items-end">
          <div>
            <label className="label" htmlFor="p-dur">Loan Duration (Seconds)</label>
            <input
              id="p-dur"
              className="input font-mono"
              inputMode="numeric"
              placeholder={String(policy.loanDuration)}
              value={pDur}
              onChange={(e) => setPDur(e.target.value)}
              disabled={!isAdmin}
            />
          </div>
          <div>
            <label className="label" htmlFor="p-per">Penalty Unit (Seconds)</label>
            <input
              id="p-per"
              className="input font-mono"
              inputMode="numeric"
              placeholder={String(policy.penaltyPeriod)}
              value={pPeriod}
              onChange={(e) => setPPeriod(e.target.value)}
              disabled={!isAdmin}
            />
          </div>
          <div>
            <label className="label" htmlFor="p-bps">Fee per Unit (bps: 100 = 1%)</label>
            <input
              id="p-bps"
              className="input font-mono"
              inputMode="numeric"
              placeholder={String(policy.lateFeeBps)}
              value={pBps}
              onChange={(e) => setPBps(e.target.value)}
              disabled={!isAdmin}
            />
          </div>
          <button className="btn-secondary" type="submit" disabled={!canAct}>
            <Sliders className="h-4 w-4" />
            <span>Update Policy</span>
          </button>
        </form>
        {pErr && <p className="mt-2 text-sm text-rose-400">{pErr}</p>}
      </Card>
    </>
  );
}

