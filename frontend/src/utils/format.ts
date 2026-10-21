import { formatEther } from "ethers";
import { EquipmentStatus, LoanStatus, type Loan } from "../types";

export const shortAddr = (a?: string) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "—");
export const shortHash = (h?: string) => (h ? `${h.slice(0, 10)}…${h.slice(-6)}` : "—");

/** wei -> "0.05" (trims trailing zeros, keeps small values readable) */
export function eth(wei: bigint, maxDecimals = 6): string {
  const s = formatEther(wei);
  const [i, d = ""] = s.split(".");
  const dec = d.slice(0, maxDecimals).replace(/0+$/, "");
  return dec ? `${i}.${dec}` : i;
}
export const ethLabel = (wei: bigint) => `${eth(wei)} ETH`;

export function formatTime(ts: number): string {
  if (!ts) return "—";
  return new Date(ts * 1000).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function formatDuration(seconds: number): string {
  seconds = Math.max(0, Math.floor(seconds));
  if (seconds < 60) return `${seconds}s`;
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const parts: string[] = [];
  if (d) parts.push(`${d}d`);
  if (h) parts.push(`${h}h`);
  if (m) parts.push(`${m}m`);
  if (!d && !h && s) parts.push(`${s}s`);
  return parts.slice(0, 3).join(" ");
}

export const equipmentStatusLabel = (s: EquipmentStatus) => EquipmentStatus[s] ?? "Unknown";
export const loanStatusLabel = (s: LoanStatus) =>
  s === LoanStatus.ReturnRequested ? "Return requested" : (LoanStatus[s] ?? "Unknown");

/**
 * Overdue test that mirrors the contract's rule: the deadline is compared with the student's
 * return-request time if there is one, otherwise with the current blockchain time.
 */
export function isLoanOverdue(loan: Loan, chainNow: number): boolean {
  if (loan.status === LoanStatus.Completed) return false;
  const effective = loan.returnRequestedAt || chainNow;
  return effective > loan.dueAt;
}

export function lateSecondsOf(loan: Loan, chainNow: number): number {
  const effective = loan.returnRequestedAt || chainNow;
  return Math.max(0, effective - loan.dueAt);
}

/** next escalation level the admin may record right now (0 = none possible) */
export function nextEscalationLevel(loan: Loan, chainNow: number): { level: number; reason?: string } {
  if (loan.status === LoanStatus.Completed) return { level: 0, reason: "Loan is completed" };
  if (!isLoanOverdue(loan, chainNow)) return { level: 0, reason: "Not overdue" };
  const next = loan.escalationLevel + 1;
  if (next > 3) return { level: 0, reason: "Maximum level reached" };
  const needed = (next - 1) * loan.penaltyPeriod;
  const late = lateSecondsOf(loan, chainNow);
  if (late < needed) return { level: 0, reason: `Level ${next} unlocks after ${formatDuration(needed)} overdue` };
  return { level: next };
}

export const escalationLabel = (level: number) =>
  level === 0 ? "None" : level === 1 ? "L1 · Reminder" : level === 2 ? "L2 · Escalated" : "L3 · Severe";
