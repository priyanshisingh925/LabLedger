import { useMemo } from "react";
import { ledger } from "../services/labledger";
import type { EquipmentStatus } from "../types";
import { useTx } from "./useTx";
import { useWallet } from "./useWallet";

/** One method per contract write. Each resolves `true` when the transaction was confirmed. */
export function useActions() {
  const { run } = useTx();
  const { getSigner } = useWallet();

  return useMemo(
    () => ({
      borrow: (equipmentId: bigint, deposit: bigint, name: string) =>
        run(`Borrow "${name}"`, async () => ledger.borrow(await getSigner(), equipmentId, deposit)),
      requestReturn: (loanId: bigint) =>
        run(`Request return of loan #${loanId}`, async () => ledger.requestReturn(await getSigner(), loanId)),
      claimRefund: () => run("Claim refund", async () => ledger.claimRefund(await getSigner())),
      confirmReturn: (loanId: bigint) =>
        run(`Confirm physical receipt (loan #${loanId})`, async () => ledger.confirmReturn(await getSigner(), loanId)),
      rejectReturn: (loanId: bigint) =>
        run(`Reject return request (loan #${loanId})`, async () => ledger.rejectReturn(await getSigner(), loanId)),
      registerEquipment: (id: bigint, name: string, category: string, description: string, deposit: bigint) =>
        run(`Register "${name}"`, async () =>
          ledger.registerEquipment(await getSigner(), id, name, category, description, deposit)
        ),
      setEquipmentStatus: (id: bigint, status: EquipmentStatus, label: string) =>
        run(label, async () => ledger.setEquipmentStatus(await getSigner(), id, status)),
      authorize: (account: string) =>
        run("Authorize student wallet", async () => ledger.authorizeBorrower(await getSigner(), account)),
      revoke: (account: string) =>
        run("Revoke student wallet", async () => ledger.revokeBorrower(await getSigner(), account)),
      escalate: (loanId: bigint, level: number) =>
        run(`Escalate loan #${loanId} to level ${level}`, async () => ledger.escalateOverdue(await getSigner(), loanId, level)),
      withdrawTreasury: (to: string, amount: bigint) =>
        run("Withdraw treasury", async () => ledger.withdrawTreasury(await getSigner(), to, amount)),
      setPolicy: (duration: number, period: number, bps: number) =>
        run("Update loan policy", async () => ledger.setPolicy(await getSigner(), duration, period, bps)),
    }),
    [run, getSigner]
  );
}
