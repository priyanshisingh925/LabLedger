import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import type { ContractTransactionResponse } from "ethers";
import { explainError } from "../services/errors";
import type { TxRecord, TxState } from "../types";
import { useLedger } from "./useLedger";
import { useWallet } from "./useWallet";

interface TxContextValue {
  current: TxState;
  history: TxRecord[];
  busy: boolean;
  /** Runs one blockchain write with full status tracking. Resolves true on success. */
  run: (label: string, action: () => Promise<ContractTransactionResponse>) => Promise<boolean>;
  dismiss: () => void;
}

const TxContext = createContext<TxContextValue | null>(null);
const IDLE: TxState = { status: "idle", label: "" };

export function TxProvider({ children }: { children: ReactNode }) {
  const { refresh } = useLedger();
  const { refreshBalance } = useWallet();
  const [current, setCurrent] = useState<TxState>(IDLE);
  const [history, setHistory] = useState<TxRecord[]>([]);
  const counter = useRef(0);

  const record = useCallback((state: TxState, id: number) => {
    setHistory((h) => {
      const rec: TxRecord = { ...state, id, at: Date.now() };
      const i = h.findIndex((x) => x.id === id);
      if (i === -1) return [rec, ...h].slice(0, 25);
      const copy = h.slice();
      copy[i] = rec;
      return copy;
    });
  }, []);

  const run = useCallback<TxContextValue["run"]>(
    async (label, action) => {
      const id = ++counter.current;
      const set = (s: TxState) => {
        setCurrent(s);
        record(s, id);
      };
      set({ status: "awaiting-wallet", label, message: "Checking the rules and waiting for your wallet…" });
      try {
        const tx = await action();
        set({ status: "pending", label, hash: tx.hash, message: "Transaction sent, waiting for confirmation…" });
        const receipt = await tx.wait();
        if (!receipt || receipt.status !== 1) throw new Error("Transaction reverted on-chain.");
        set({
          status: "success",
          label,
          hash: tx.hash,
          blockNumber: receipt.blockNumber,
          message: `Confirmed in block ${receipt.blockNumber}.`,
        });
        await Promise.all([refresh(), refreshBalance()]);
        return true;
      } catch (e) {
        set({ status: "error", label, message: explainError(e) });
        return false;
      }
    },
    [record, refresh, refreshBalance]
  );

  const dismiss = useCallback(() => setCurrent(IDLE), []);
  const busy = current.status === "awaiting-wallet" || current.status === "pending";

  const value = useMemo(() => ({ current, history, busy, run, dismiss }), [current, history, busy, run, dismiss]);
  return <TxContext.Provider value={value}>{children}</TxContext.Provider>;
}

export function useTx(): TxContextValue {
  const ctx = useContext(TxContext);
  if (!ctx) throw new Error("useTx must be used inside <TxProvider>");
  return ctx;
}
