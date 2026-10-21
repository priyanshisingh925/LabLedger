import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { POLL_INTERVAL_MS } from "../config";
import { fetchSnapshot, isContractDeployed } from "../services/labledger";
import { explainError } from "../services/errors";
import type { LedgerSnapshot } from "../types";
import { useWallet } from "./useWallet";

interface LedgerContextValue {
  snapshot?: LedgerSnapshot;
  loading: boolean;
  error?: string;
  contractMissing: boolean;
  /** local time (ms) when the snapshot was fetched; used to keep the blockchain clock ticking between polls */
  fetchedAt: number;
  refresh: () => Promise<void>;
}

const LedgerContext = createContext<LedgerContextValue | null>(null);

export function LedgerProvider({ children }: { children: ReactNode }) {
  const { account } = useWallet();
  const [snapshot, setSnapshot] = useState<LedgerSnapshot>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [contractMissing, setContractMissing] = useState(false);
  const [fetchedAt, setFetchedAt] = useState(Date.now());
  const requestId = useRef(0);

  const refresh = useCallback(async () => {
    const id = ++requestId.current;
    try {
      if (!(await isContractDeployed())) {
        if (id === requestId.current) {
          setContractMissing(true);
          setSnapshot(undefined);
          setError(undefined);
        }
        return;
      }
      const snap = await fetchSnapshot(account);
      if (id !== requestId.current) return; // a newer request superseded this one
      setSnapshot(snap);
      setFetchedAt(Date.now());
      setContractMissing(false);
      setError(undefined);
    } catch (e) {
      if (id === requestId.current) setError(explainError(e));
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, [account]);

  useEffect(() => {
    setLoading(true);
    refresh();
    const t = setInterval(refresh, POLL_INTERVAL_MS);
    return () => clearInterval(t);
  }, [refresh]);

  const value = useMemo(
    () => ({ snapshot, loading, error, contractMissing, fetchedAt, refresh }),
    [snapshot, loading, error, contractMissing, fetchedAt, refresh]
  );
  return <LedgerContext.Provider value={value}>{children}</LedgerContext.Provider>;
}

export function useLedger(): LedgerContextValue {
  const ctx = useContext(LedgerContext);
  if (!ctx) throw new Error("useLedger must be used inside <LedgerProvider>");
  return ctx;
}

/** The blockchain's clock in seconds, ticking every second between polls (honours Hardhat time travel). */
export function useChainNow(): number {
  const { snapshot, fetchedAt } = useLedger();
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, []);
  if (!snapshot) return Math.floor(Date.now() / 1000);
  return snapshot.chainNow + Math.floor((Date.now() - fetchedAt) / 1000);
}
