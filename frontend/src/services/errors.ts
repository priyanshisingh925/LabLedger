import { formatEther } from "ethers";
import { iface } from "./labledger";
import { EquipmentStatus } from "../types";

const statusName = (n: bigint | number) => EquipmentStatus[Number(n)] ?? String(n);

/** Turns any ethers / MetaMask / contract error into a message a student can understand. */
export function explainError(err: unknown): string {
  const e = err as any;

  // User pressed "Reject" in MetaMask
  if (e?.code === "ACTION_REJECTED" || e?.code === 4001 || e?.info?.error?.code === 4001) {
    return "You rejected the request in MetaMask. Nothing was sent.";
  }

  // Custom contract errors (decoded from revert data)
  const data: string | undefined =
    (typeof e?.data === "string" && e.data) ||
    (typeof e?.error?.data === "string" && e.error.data) ||
    (typeof e?.info?.error?.data === "string" && e.info.error.data) ||
    e?.info?.error?.data?.data ||
    e?.error?.data?.data;
  if (data && data.startsWith("0x") && data.length >= 10) {
    try {
      const parsed = iface.parseError(data);
      if (parsed) return describeContractError(parsed.name, parsed.args);
    } catch {
      /* fall through */
    }
  }
  if (e?.revert?.name) return describeContractError(e.revert.name, e.revert.args ?? []);

  const msg: string = (e?.shortMessage || e?.reason || e?.message || String(err)) as string;
  const low = msg.toLowerCase();
  if (e?.code === "INSUFFICIENT_FUNDS" || low.includes("insufficient funds") || low.includes("doesn't have enough funds")) {
    return "Insufficient balance: this wallet does not hold enough test ETH for the deposit plus gas.";
  }
  if (low.includes("nonce too high") || low.includes("nonce")) {
    return "Wallet nonce mismatch. If you restarted the Hardhat node, reset the account in MetaMask: Settings → Advanced → Clear activity tab data.";
  }
  if (low.includes("network") && low.includes("changed")) return "The wallet network changed during the request. Please try again.";
  if (low.includes("failed to fetch") || low.includes("could not coalesce") || low.includes("econnrefused")) {
    return "Cannot reach the local blockchain at the configured RPC URL. Is `npm run node` still running?";
  }
  return msg.length > 220 ? msg.slice(0, 220) + "…" : msg;
}

function describeContractError(name: string, args: readonly any[]): string {
  switch (name) {
    case "NotAuthorizedBorrower":
      return "This wallet is not authorized to borrow equipment. Ask the lab administrator to authorize it.";
    case "EquipmentNotAvailable":
      return `This item is not available for checkout (status: ${statusName(args[1])}).`;
    case "EquipmentNotFound":
      return "That equipment ID does not exist.";
    case "IncorrectDeposit":
      return `Wrong deposit. This item needs exactly ${formatEther(args[0])} ETH (you sent ${formatEther(args[1])} ETH).`;
    case "AccessControlUnauthorizedAccount":
      return "Only the lab administrator wallet can do this.";
    case "EquipmentAlreadyExists":
      return `Equipment ID ${args[0]} is already registered. IDs must be unique.`;
    case "EmptyName":
      return "Equipment name can not be empty.";
    case "ZeroDeposit":
      return "Deposit must be greater than zero.";
    case "ZeroAddress":
      return "The address can not be empty / zero.";
    case "EquipmentCurrentlyBorrowed":
      return "This item is currently checked out. It must be returned before its status can change.";
    case "InvalidStatusChange":
      return `That status change is not allowed (${statusName(args[0])} → ${statusName(args[1])}). Retired items stay retired.`;
    case "AlreadyAuthorized":
      return "This wallet is already authorized.";
    case "NotCurrentlyAuthorized":
      return "This wallet is not currently authorized.";
    case "LoanNotFound":
      return "That loan does not exist.";
    case "NotLoanBorrower":
      return "Only the wallet that borrowed this item can request its return.";
    case "InvalidLoanState":
      return "This loan is not in a state that allows this action (for example it was already completed or requested).";
    case "NotOverdue":
      return "This loan is not overdue yet.";
    case "InvalidEscalationLevel":
      return `Escalation level ${args[0]} is not valid: the loan is already at level ${args[1]}. Levels only go up (1 → 3).`;
    case "EscalationTooEarly":
      return `The loan has not been overdue long enough for level ${args[1]}.`;
    case "NothingToClaim":
      return "There is no refund waiting for this wallet.";
    case "InsufficientTreasury":
      return `Only accrued late fees can be withdrawn. Requested ${formatEther(args[0])} ETH, available ${formatEther(args[1])} ETH.`;
    case "TransferFailed":
      return "The ETH transfer failed (the receiving address rejected it). Your refund stays safely recorded; try again or claim to another address.";
    case "InvalidPolicy":
      return "Invalid policy values (duration 1s–365d, period > 0, fee ≤ 10000 bps).";
    default:
      return `Contract rejected the transaction: ${name}`;
  }
}
