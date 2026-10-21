export enum EquipmentStatus {
  Available = 0,
  Borrowed = 1,
  Unavailable = 2,
  Retired = 3,
}

export enum LoanStatus {
  Active = 0,
  ReturnRequested = 1,
  Completed = 2,
}

export interface Equipment {
  id: bigint;
  name: string;
  category: string;
  description: string;
  deposit: bigint; // wei
  status: EquipmentStatus;
}

export interface Loan {
  id: bigint;
  equipmentId: bigint;
  borrower: string;
  checkedOutAt: number;
  dueAt: number;
  returnRequestedAt: number;
  returnedAt: number;
  deposit: bigint;
  refund: bigint;
  penalty: bigint;
  penaltyPeriod: number;
  lateFeeBps: number;
  status: LoanStatus;
  escalationLevel: number;
  escalationResolved: boolean;
  late: boolean;
}

export interface Stats {
  totalEquipment: number;
  available: number;
  borrowed: number;
  unavailable: number;
  retired: number;
  overdueLoans: number;
  pendingReturns: number;
  totalLoans: number;
  totalActiveDeposits: bigint;
  totalPendingRefunds: bigint;
  treasuryBalance: bigint;
}

export interface Settlement {
  late: boolean;
  lateSeconds: number;
  penalty: bigint;
  refund: bigint;
}

export interface Policy {
  loanDuration: number;
  penaltyPeriod: number;
  lateFeeBps: number;
}

export interface ActivityEvent {
  key: string;
  name: string;
  summary: string;
  blockNumber: number;
  logIndex: number;
  txHash: string;
  timestamp: number;
  args: Record<string, string>;
}

export interface LedgerSnapshot {
  equipment: Equipment[];
  loans: Loan[];
  stats: Stats;
  policy: Policy;
  authorizedBorrowers: string[];
  settlements: Record<string, Settlement>; // key: loanId, only for unfinished loans
  chainNow: number; // seconds, blockchain clock
  isAdmin: boolean;
  isAuthorized: boolean;
  pendingRefund: bigint;
}

export type TxStatus = "idle" | "awaiting-wallet" | "pending" | "success" | "error";

export interface TxState {
  status: TxStatus;
  label: string;
  hash?: string;
  message?: string;
  blockNumber?: number;
}

export interface TxRecord extends TxState {
  id: number;
  at: number; // ms
}
