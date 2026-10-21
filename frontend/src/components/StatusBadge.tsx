import { EquipmentStatus, LoanStatus, type Loan } from "../types";
import { equipmentStatusLabel, escalationLabel, isLoanOverdue, loanStatusLabel } from "../utils/format";

export function EquipmentBadge({ status }: { status: EquipmentStatus }) {
  const config: Record<EquipmentStatus, { badge: string; dot: string }> = {
    [EquipmentStatus.Available]: {
      badge: "border-emerald-500/30 bg-emerald-500/15 text-emerald-300",
      dot: "bg-emerald-400 animate-pulse",
    },
    [EquipmentStatus.Borrowed]: {
      badge: "border-sky-500/30 bg-sky-500/15 text-sky-300",
      dot: "bg-sky-400",
    },
    [EquipmentStatus.Unavailable]: {
      badge: "border-amber-500/30 bg-amber-500/15 text-amber-300",
      dot: "bg-amber-400",
    },
    [EquipmentStatus.Retired]: {
      badge: "border-slate-500/30 bg-slate-800 text-slate-400",
      dot: "bg-slate-500",
    },
  };

  const item = config[status];

  return (
    <span className={`badge ${item.badge}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${item.dot}`} />
      {equipmentStatusLabel(status)}
    </span>
  );
}

export function LoanBadges({ loan, chainNow }: { loan: Loan; chainNow: number }) {
  const overdue = isLoanOverdue(loan, chainNow);
  const tone =
    loan.status === LoanStatus.Completed
      ? "border-emerald-500/30 bg-emerald-500/15 text-emerald-300"
      : loan.status === LoanStatus.ReturnRequested
        ? "border-amber-500/30 bg-amber-500/15 text-amber-300"
        : "border-cyan-500/30 bg-cyan-500/15 text-cyan-300";

  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <span className={`badge ${tone}`}>
        <span
          className={`h-1.5 w-1.5 rounded-full ${
            loan.status === LoanStatus.Completed
              ? "bg-emerald-400"
              : loan.status === LoanStatus.ReturnRequested
                ? "bg-amber-400 animate-pulse"
                : "bg-cyan-400 animate-pulse"
          }`}
        />
        {loanStatusLabel(loan.status)}
      </span>

      {overdue && (
        <span className="badge border-rose-500/40 bg-rose-500/20 text-rose-300">
          <span className="h-1.5 w-1.5 animate-ping rounded-full bg-rose-400" />
          Overdue
        </span>
      )}

      {loan.status === LoanStatus.Completed && loan.late && (
        <span className="badge border-rose-500/30 bg-rose-500/10 text-rose-300">Was late</span>
      )}

      {loan.escalationLevel > 0 && (
        <span
          className="badge border-rose-500/50 bg-rose-600/30 text-rose-200"
          title={loan.escalationResolved ? "Resolved after return" : "Open escalation"}
        >
          {escalationLabel(loan.escalationLevel)}
          {loan.escalationResolved ? " ✓" : ""}
        </span>
      )}
    </span>
  );
}

