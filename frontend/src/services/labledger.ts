// The single contract service layer: every blockchain read/write in the app goes through this file.
import {
  BrowserProvider,
  Contract,
  Interface,
  JsonRpcProvider,
  Network,
  formatEther,
  type ContractTransactionResponse,
  type Signer,
} from "ethers";
import { CHAIN_ID, CONTRACT_ABI, CONTRACT_ADDRESS, DEPLOY_BLOCK, RPC_URL } from "../config";
import {
  EquipmentStatus,
  LoanStatus,
  type ActivityEvent,
  type Equipment,
  type LedgerSnapshot,
  type Loan,
  type Policy,
  type Settlement,
  type Stats,
} from "../types";
import { eth, formatDuration, shortAddr } from "../utils/format";

export const iface = new Interface(CONTRACT_ABI);

/** Read-only connection straight to the configured RPC (works before a wallet is connected). */
export const readProvider = new JsonRpcProvider(RPC_URL, CHAIN_ID, { staticNetwork: Network.from(CHAIN_ID) });
const readContract = new Contract(CONTRACT_ADDRESS, iface, readProvider);

export const walletProvider = (eip1193: NonNullable<Window["ethereum"]>) => new BrowserProvider(eip1193 as any);

const writeContract = (signer: Signer) => new Contract(CONTRACT_ADDRESS, iface, signer);

// ───────────────────────── parsing helpers ─────────────────────────

const toEquipment = (r: any): Equipment => ({
  id: r.id,
  name: r.name,
  category: r.category,
  description: r.description,
  deposit: r.deposit,
  status: Number(r.status) as EquipmentStatus,
});

const toLoan = (r: any): Loan => ({
  id: r.id,
  equipmentId: r.equipmentId,
  borrower: r.borrower,
  checkedOutAt: Number(r.checkedOutAt),
  dueAt: Number(r.dueAt),
  returnRequestedAt: Number(r.returnRequestedAt),
  returnedAt: Number(r.returnedAt),
  deposit: r.deposit,
  refund: r.refund,
  penalty: r.penalty,
  penaltyPeriod: Number(r.penaltyPeriod),
  lateFeeBps: Number(r.lateFeeBps),
  status: Number(r.status) as LoanStatus,
  escalationLevel: Number(r.escalationLevel),
  escalationResolved: r.escalationResolved,
  late: r.late,
});

const toStats = (r: any): Stats => ({
  totalEquipment: Number(r.totalEquipment),
  available: Number(r.available),
  borrowed: Number(r.borrowed),
  unavailable: Number(r.unavailable),
  retired: Number(r.retired),
  overdueLoans: Number(r.overdueLoans),
  pendingReturns: Number(r.pendingReturns),
  totalLoans: Number(r.totalLoans),
  totalActiveDeposits: r.totalActiveDeposits,
  totalPendingRefunds: r.totalPendingRefunds,
  treasuryBalance: r.treasuryBalance,
});

/**
 * The blockchain's own clock. Hardhat's "pending" block carries the current (time-travel-adjusted) time,
 * which matters for the demo when the clock is advanced. Falls back to the latest block.
 */
export async function fetchChainNow(): Promise<number> {
  try {
    const pending = await readProvider.getBlock("pending");
    if (pending) return pending.timestamp;
  } catch {
    /* some nodes do not support the pending block */
  }
  const latest = await readProvider.getBlock("latest");
  return latest ? latest.timestamp : Math.floor(Date.now() / 1000);
}

export async function isContractDeployed(): Promise<boolean> {
  const code = await readProvider.getCode(CONTRACT_ADDRESS);
  return code !== "0x";
}

// ───────────────────────── reads ─────────────────────────

export async function fetchSnapshot(account?: string): Promise<LedgerSnapshot> {
  const [equipmentRaw, loansRaw, statsRaw, duration, period, bps, borrowers, chainNow] = await Promise.all([
    readContract.getAllEquipment(),
    readContract.getAllLoans(),
    readContract.getStats(),
    readContract.loanDuration(),
    readContract.penaltyPeriod(),
    readContract.lateFeeBps(),
    readContract.getAuthorizedBorrowers(),
    fetchChainNow(),
  ]);

  const equipment: Equipment[] = Array.from(equipmentRaw as any[]).map(toEquipment);
  const loans: Loan[] = Array.from(loansRaw as any[]).map(toLoan);
  const policy: Policy = { loanDuration: Number(duration), penaltyPeriod: Number(period), lateFeeBps: Number(bps) };

  // refund/penalty preview for every unfinished loan (shown BEFORE the admin confirms a return)
  const settlements: Record<string, Settlement> = {};
  await Promise.all(
    loans
      .filter((l) => l.status !== LoanStatus.Completed)
      .map(async (l) => {
        const r = await readContract.previewSettlement(l.id);
        settlements[l.id.toString()] = {
          late: r.late,
          lateSeconds: Number(r.lateSeconds),
          penalty: r.penalty,
          refund: r.refund,
        };
      })
  );

  let isAdmin = false;
  let isAuthorized = false;
  let pendingRefund = 0n;
  if (account) {
    [isAdmin, isAuthorized, pendingRefund] = await Promise.all([
      readContract.isAdmin(account),
      readContract.isAuthorizedBorrower(account),
      readContract.pendingRefunds(account),
    ]);
  }

  return {
    equipment,
    loans,
    stats: toStats(statsRaw),
    policy,
    authorizedBorrowers: Array.from(borrowers as string[]),
    settlements,
    chainNow,
    isAdmin,
    isAuthorized,
    pendingRefund,
  };
}

const blockTimeCache = new Map<number, number>();
async function blockTime(n: number): Promise<number> {
  const hit = blockTimeCache.get(n);
  if (hit) return hit;
  const b = await readProvider.getBlock(n);
  const ts = b?.timestamp ?? 0;
  blockTimeCache.set(n, ts);
  return ts;
}

/** Every event the contract has ever emitted, newest first. This is the audit trail. */
export async function fetchActivity(): Promise<ActivityEvent[]> {
  const logs = await readProvider.getLogs({ address: CONTRACT_ADDRESS, fromBlock: DEPLOY_BLOCK, toBlock: "latest" });
  const events = await Promise.all(
    logs.map(async (log): Promise<ActivityEvent | null> => {
      const parsed = iface.parseLog({ topics: [...log.topics], data: log.data });
      if (!parsed) return null;
      const args: Record<string, string> = {};
      parsed.fragment.inputs.forEach((input, i) => {
        args[input.name] = String(parsed.args[i]);
      });
      return {
        key: `${log.transactionHash}-${log.index}`,
        name: parsed.name,
        summary: summarize(parsed.name, parsed.args),
        blockNumber: log.blockNumber,
        logIndex: log.index,
        txHash: log.transactionHash,
        timestamp: await blockTime(log.blockNumber),
        args,
      };
    })
  );
  return (events.filter(Boolean) as ActivityEvent[]).sort((a, b) =>
    b.blockNumber !== a.blockNumber ? b.blockNumber - a.blockNumber : b.logIndex - a.logIndex
  );
}

function summarize(name: string, a: any): string {
  switch (name) {
    case "EquipmentRegistered":
      return `Equipment #${a.equipmentId} "${a.name}" registered (deposit ${eth(a.deposit)} ETH)`;
    case "EquipmentStatusChanged":
      return `Equipment #${a.equipmentId}: ${EquipmentStatus[Number(a.oldStatus)]} → ${EquipmentStatus[Number(a.newStatus)]}`;
    case "BorrowerAuthorized":
      return `${shortAddr(a.borrower)} authorized to borrow`;
    case "BorrowerRevoked":
      return `${shortAddr(a.borrower)} authorization revoked`;
    case "EquipmentBorrowed":
      return `Loan #${a.loanId}: equipment #${a.equipmentId} borrowed by ${shortAddr(a.borrower)} (deposit ${eth(a.deposit)} ETH)`;
    case "ReturnRequested":
      return `Loan #${a.loanId}: ${shortAddr(a.borrower)} requested return of equipment #${a.equipmentId}`;
    case "ReturnRejected":
      return `Loan #${a.loanId}: return request rejected by admin (item not received)`;
    case "EquipmentReturned":
      return `Loan #${a.loanId}: receipt confirmed${a.late ? " (LATE)" : ""} - refund ${eth(a.refund)} ETH, penalty ${eth(a.penalty)} ETH`;
    case "OverdueEscalated":
      return `Loan #${a.loanId}: overdue escalated to level ${a.level}`;
    case "EscalationResolved":
      return `Loan #${a.loanId}: escalation resolved after return (final level ${a.finalLevel})`;
    case "RefundCredited":
      return `Loan #${a.loanId}: ${eth(a.amount)} ETH refund credited to ${shortAddr(a.borrower)}`;
    case "RefundClaimed":
      return `${shortAddr(a.borrower)} claimed ${eth(a.amount)} ETH refund`;
    case "PolicyUpdated":
      return `Policy updated: ${formatDuration(Number(a.loanDuration))} loans, ${formatDuration(Number(a.penaltyPeriod))} fee period, ${Number(a.lateFeeBps) / 100}% per period`;
    case "TreasuryWithdrawn":
      return `Treasury withdrawal: ${eth(a.amount)} ETH to ${shortAddr(a.to)}`;
    case "RoleGranted":
      return `Administrator role granted to ${shortAddr(a.account)}`;
    case "RoleRevoked":
      return `Administrator role revoked from ${shortAddr(a.account)}`;
    default:
      return name;
  }
}

export async function fetchTxDetails(hash: string) {
  const [tx, receipt] = await Promise.all([readProvider.getTransaction(hash), readProvider.getTransactionReceipt(hash)]);
  return {
    from: tx?.from,
    to: tx?.to,
    valueEth: tx ? formatEther(tx.value) : undefined,
    blockNumber: receipt?.blockNumber,
    status: receipt ? (receipt.status === 1 ? "Success" : "Reverted") : "Unknown",
    gasUsed: receipt?.gasUsed.toString(),
  };
}

export async function walletBalance(account: string): Promise<bigint> {
  return readProvider.getBalance(account);
}

// ───────────────────────── writes ─────────────────────────
// Each write first simulates the call (staticCall) so a rule violation is explained in plain words
// WITHOUT opening a MetaMask popup; then the real transaction is sent.

type Send = Promise<ContractTransactionResponse>;

async function send(signer: Signer, method: string, args: unknown[], value?: bigint): Send {
  const c = writeContract(signer);
  const overrides = value !== undefined ? { value } : {};
  await c.getFunction(method).staticCall(...args, overrides);
  return c.getFunction(method)(...args, overrides);
}

export const ledger = {
  borrow: (s: Signer, equipmentId: bigint, deposit: bigint): Send => send(s, "borrowEquipment", [equipmentId], deposit),
  requestReturn: (s: Signer, loanId: bigint): Send => send(s, "requestReturn", [loanId]),
  claimRefund: (s: Signer): Send => send(s, "claimRefund", []),
  confirmReturn: (s: Signer, loanId: bigint): Send => send(s, "confirmReturn", [loanId]),
  rejectReturn: (s: Signer, loanId: bigint): Send => send(s, "rejectReturn", [loanId]),
  registerEquipment: (
    s: Signer,
    id: bigint,
    name: string,
    category: string,
    description: string,
    deposit: bigint
  ): Send => send(s, "registerEquipment", [id, name, category, description, deposit]),
  setEquipmentStatus: (s: Signer, id: bigint, status: EquipmentStatus): Send => send(s, "setEquipmentStatus", [id, status]),
  authorizeBorrower: (s: Signer, account: string): Send => send(s, "authorizeBorrower", [account]),
  revokeBorrower: (s: Signer, account: string): Send => send(s, "revokeBorrower", [account]),
  escalateOverdue: (s: Signer, loanId: bigint, level: number): Send => send(s, "escalateOverdue", [loanId, level]),
  withdrawTreasury: (s: Signer, to: string, amount: bigint): Send => send(s, "withdrawTreasury", [to, amount]),
  setPolicy: (s: Signer, duration: number, period: number, bps: number): Send =>
    send(s, "setPolicy", [duration, period, bps]),
};
