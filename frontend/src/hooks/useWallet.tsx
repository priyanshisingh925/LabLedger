import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Signer } from "ethers";
import { NETWORK } from "../config";
import { walletBalance, walletProvider } from "../services/labledger";
import { explainError } from "../services/errors";

const DISCONNECT_FLAG = "labledger.uiDisconnected";

interface WalletContextValue {
  hasWallet: boolean;
  account?: string;
  chainId?: number;
  balance?: bigint;
  connecting: boolean;
  error?: string;
  wrongNetwork: boolean;
  connect: () => Promise<void>;
  /** MetaMask has no real "disconnect" for websites: this clears the UI state and stops auto-connecting. */
  disconnect: () => Promise<void>;
  switchNetwork: () => Promise<void>;
  getSigner: () => Promise<Signer>;
  refreshBalance: () => Promise<void>;
}

const WalletContext = createContext<WalletContextValue | null>(null);

const readFlag = () => {
  try {
    return localStorage.getItem(DISCONNECT_FLAG) === "1";
  } catch {
    return false;
  }
};
const writeFlag = (v: boolean) => {
  try {
    if (v) localStorage.setItem(DISCONNECT_FLAG, "1");
    else localStorage.removeItem(DISCONNECT_FLAG);
  } catch {
    /* storage unavailable: nothing important is stored here (never keys) */
  }
};

const hexToNumber = (h: unknown) => parseInt(String(h), 16);

export function WalletProvider({ children }: { children: ReactNode }) {
  const eth = typeof window !== "undefined" ? window.ethereum : undefined;
  const [account, setAccount] = useState<string>();
  const [chainId, setChainId] = useState<number>();
  const [balance, setBalance] = useState<bigint>();
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string>();

  const reset = useCallback(() => {
    setAccount(undefined);
    setBalance(undefined);
    setError(undefined);
  }, []);

  // restore an already-approved connection (unless the user pressed Disconnect in this app)
  useEffect(() => {
    if (!eth) return;
    (async () => {
      try {
        const [accs, chain] = await Promise.all([
          eth.request({ method: "eth_accounts" }) as Promise<string[]>,
          eth.request({ method: "eth_chainId" }),
        ]);
        setChainId(hexToNumber(chain));
        if (accs.length && !readFlag()) setAccount(accs[0]);
      } catch {
        /* ignore */
      }
    })();
  }, [eth]);

  // detect account and network changes
  useEffect(() => {
    if (!eth) return;
    const onAccounts = (accs: string[]) => {
      if (readFlag()) return; // user disconnected in the UI: ignore wallet events until they reconnect
      if (!accs || accs.length === 0) reset();
      else {
        setAccount(accs[0]);
        setError(undefined);
      }
    };
    const onChain = (hex: string) => setChainId(hexToNumber(hex));
    eth.on("accountsChanged", onAccounts);
    eth.on("chainChanged", onChain);
    return () => {
      eth.removeListener("accountsChanged", onAccounts);
      eth.removeListener("chainChanged", onChain);
    };
  }, [eth, reset]);

  const refreshBalance = useCallback(async () => {
    if (!account) return;
    try {
      setBalance(await walletBalance(account));
    } catch {
      /* node offline: shown elsewhere */
    }
  }, [account]);

  useEffect(() => {
    if (!account) return;
    refreshBalance();
    const t = setInterval(refreshBalance, 5000);
    return () => clearInterval(t);
  }, [account, refreshBalance]);

  const connect = useCallback(async () => {
    if (!eth) {
      setError("MetaMask was not detected. Install the MetaMask browser extension and reload this page.");
      return;
    }
    setConnecting(true);
    setError(undefined);
    try {
      writeFlag(false);
      const accs = (await eth.request({ method: "eth_requestAccounts" })) as string[];
      const chain = await eth.request({ method: "eth_chainId" });
      setChainId(hexToNumber(chain));
      if (accs.length) setAccount(accs[0]);
    } catch (e) {
      setError(explainError(e));
    } finally {
      setConnecting(false);
    }
  }, [eth]);

  const disconnect = useCallback(async () => {
    writeFlag(true);
    reset();
    try {
      // best effort: ask MetaMask to revoke this site's permission (not supported by every wallet)
      await eth?.request({ method: "wallet_revokePermissions", params: [{ eth_accounts: {} }] });
    } catch {
      /* fine: the UI state is already reset */
    }
  }, [eth, reset]);

  const switchNetwork = useCallback(async () => {
    if (!eth) return;
    try {
      await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: NETWORK.chainIdHex }] });
    } catch (e: any) {
      if (e?.code === 4902 || String(e?.message).toLowerCase().includes("unrecognized chain")) {
        try {
          await eth.request({
            method: "wallet_addEthereumChain",
            params: [
              {
                chainId: NETWORK.chainIdHex,
                chainName: NETWORK.name,
                rpcUrls: [NETWORK.rpcUrl],
                nativeCurrency: NETWORK.currency,
              },
            ],
          });
        } catch (e2) {
          setError(explainError(e2));
        }
      } else {
        setError(explainError(e));
      }
    }
  }, [eth]);

  const getSigner = useCallback(async () => {
    if (!eth || !account) throw new Error("Connect your wallet first.");
    if (chainId !== NETWORK.chainId) {
      throw new Error(`Wrong network. Switch MetaMask to "${NETWORK.name}" (chain ID ${NETWORK.chainId}).`);
    }
    return walletProvider(eth).getSigner(account);
  }, [eth, account, chainId]);

  const value = useMemo<WalletContextValue>(
    () => ({
      hasWallet: !!eth,
      account,
      chainId,
      balance,
      connecting,
      error,
      wrongNetwork: !!account && chainId !== undefined && chainId !== NETWORK.chainId,
      connect,
      disconnect,
      switchNetwork,
      getSigner,
      refreshBalance,
    }),
    [eth, account, chainId, balance, connecting, error, connect, disconnect, switchNetwork, getSigner, refreshBalance]
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet(): WalletContextValue {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet must be used inside <WalletProvider>");
  return ctx;
}
