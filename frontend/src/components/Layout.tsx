import { useState, type ReactNode } from "react";
import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  Boxes,
  Download,
  BookOpen,
  ArrowLeftRight,
  ShieldCheck,
  Activity,
  Wallet,
  LogOut,
  Menu,
  FlaskConical,
  Radio,
} from "lucide-react";
import { CONTRACT_ADDRESS, NETWORK } from "../config";
import { useLedger } from "../hooks/useLedger";
import { useWallet } from "../hooks/useWallet";
import { ethLabel, shortAddr } from "../utils/format";
import { Notice, Spinner } from "./ui";
import { Particles } from "./reactbits/Particles";
import { ClickSpark } from "./reactbits/ClickSpark";
import { DecryptedText } from "./reactbits/DecryptedText";
import { StarBorder } from "./reactbits/StarBorder";

const NAV = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/inventory", label: "Equipment Inventory", icon: Boxes },
  { to: "/borrow", label: "Borrow Equipment", icon: Download },
  { to: "/my-loans", label: "My Loans", icon: BookOpen },
  { to: "/returns", label: "Return Management", icon: ArrowLeftRight },
  { to: "/admin", label: "Admin Panel", icon: ShieldCheck },
  { to: "/activity", label: "Blockchain Activity", icon: Activity },
];

function RoleBadge() {
  const { account } = useWallet();
  const { snapshot } = useLedger();
  if (!account) return <span className="badge border-white/10 bg-white/5 text-slate-400">Not connected</span>;
  if (!snapshot) return <span className="badge border-white/10 bg-white/5 text-slate-400">Checking role…</span>;
  if (snapshot.isAdmin) {
    return (
      <span className="badge border-emerald-500/40 bg-emerald-500/20 text-emerald-300">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
        Administrator
      </span>
    );
  }
  if (snapshot.isAuthorized) {
    return (
      <span className="badge border-cyan-500/40 bg-cyan-500/20 text-cyan-300">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-cyan-400" />
        Authorized Student
      </span>
    );
  }
  return (
    <span className="badge border-amber-500/40 bg-amber-500/20 text-amber-300">
      <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
      Unauthorized Wallet
    </span>
  );
}

function WalletPanel() {
  const { account, balance, connect, disconnect, connecting, hasWallet } = useWallet();
  return (
    <div className="space-y-3 rounded-2xl border border-white/10 bg-space-950/70 p-4 shadow-inner backdrop-blur-xl">
      {account ? (
        <>
          <div className="flex items-center justify-between gap-2">
            <RoleBadge />
            <button
              onClick={disconnect}
              title="Disconnect wallet"
              className="inline-flex items-center gap-1 text-xs text-slate-400 transition hover:text-rose-400"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span>Disconnect</span>
            </button>
          </div>
          <div>
            <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              <Wallet className="h-3 w-3 text-cyan-400" />
              <span>Connected Wallet</span>
            </div>
            <p className="mt-1 break-all font-mono text-xs text-slate-200" title={account}>
              {account}
            </p>
          </div>
          <div className="rounded-xl border border-white/5 bg-white/5 p-2.5">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Balance</p>
            <p className="mt-0.5 text-base font-bold text-white">
              {balance !== undefined ? ethLabel(balance) : "…"}
            </p>
          </div>
        </>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <RoleBadge />
          </div>
          <StarBorder
            onClick={connect}
            disabled={connecting}
            className="w-full !rounded-xl"
            color="#10b981"
          >
            {connecting ? <Spinner /> : <Wallet className="h-4 w-4 text-emerald-400" />}
            <span>{hasWallet ? "Connect MetaMask" : "Install MetaMask"}</span>
          </StarBorder>
        </div>
      )}
    </div>
  );
}

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <div className="flex h-full flex-col gap-6 p-5">
      {/* Brand logo */}
      <div className="flex items-center gap-3 px-1 pt-1">
        <div className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-emerald-600 via-teal-500 to-cyan-400 shadow-lg shadow-emerald-500/25">
          <FlaskConical className="h-5 w-5 text-white" />
          <span className="absolute -top-1 -right-1 flex h-3 w-3">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-3 w-3 rounded-full bg-emerald-500" />
          </span>
        </div>
        <div>
          <p className="text-lg font-bold tracking-tight text-white">
            <DecryptedText text="LabLedger" speed={30} />
          </p>
          <p className="text-[11px] tracking-wide text-slate-400">Accountable Lab Access</p>
        </div>
      </div>

      {/* Main navigation */}
      <nav className="flex-1 space-y-1.5" aria-label="Main">
        {NAV.map((n) => {
          const Icon = n.icon;
          return (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              onClick={onNavigate}
              className={({ isActive }) =>
                `group flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition-all duration-200 ${
                  isActive
                    ? "border border-emerald-500/30 bg-gradient-to-r from-emerald-500/20 to-teal-500/10 text-emerald-300 shadow-md shadow-emerald-950/40"
                    : "text-slate-400 hover:border-white/5 hover:bg-white/5 hover:text-white"
                }`
              }
            >
              <Icon className="h-4 w-4 transition-transform duration-200 group-hover:scale-110" />
              <span>{n.label}</span>
            </NavLink>
          );
        })}
      </nav>

      {/* Wallet section */}
      <WalletPanel />

      {/* Network metadata footer */}
      <div className="rounded-xl border border-white/5 bg-space-950/40 p-3 text-[11px] leading-relaxed text-slate-400">
        <div className="flex items-center gap-1.5 font-medium text-slate-300">
          <Radio className="h-3 w-3 text-emerald-400 animate-pulse" />
          <span>{NETWORK.name}</span>
          <span className="text-slate-500">·</span>
          <span className="font-mono text-slate-400">ID {NETWORK.chainId}</span>
        </div>
        <p className="mt-1 font-mono text-[10px] text-slate-400" title={CONTRACT_ADDRESS}>
          Contract: {shortAddr(CONTRACT_ADDRESS)}
        </p>
        <p className="mt-1.5 text-[10px] text-slate-500">Test ETH only. Cryptographic state is enforced on-chain.</p>
      </div>
    </div>
  );
}

function Banners() {
  const { wrongNetwork, switchNetwork, error: walletError, hasWallet } = useWallet();
  const { error, contractMissing, loading, snapshot } = useLedger();
  return (
    <div className="space-y-3">
      {!hasWallet && (
        <Notice tone="warn" title="MetaMask not detected">
          You can browse the dashboard, but you need the MetaMask extension to borrow equipment or administer the lab.
        </Notice>
      )}
      {walletError && <Notice tone="error">{walletError}</Notice>}
      {wrongNetwork && (
        <Notice tone="warn" title={`Wrong network - switch to ${NETWORK.name} (chain ${NETWORK.chainId})`}>
          <button className="btn-primary btn-sm mt-2" onClick={switchNetwork}>
            Switch network in MetaMask
          </button>
        </Notice>
      )}
      {contractMissing && (
        <Notice tone="error" title="LabLedger is not deployed on this node">
          Start the node (<code>npm run node</code>), then run <code>npm run deploy</code> and <code>npm run seed</code> in the project folder. If you restarted the node, deploy again.
        </Notice>
      )}
      {error && !contractMissing && (
        <Notice tone="error" title="Could not load blockchain data">
          {error}
        </Notice>
      )}
      {loading && !snapshot && !error && !contractMissing && (
        <p className="flex items-center gap-2 text-sm text-slate-400">
          <Spinner /> Loading data from the blockchain…
        </p>
      )}
    </div>
  );
}

export function Layout({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <ClickSpark sparkColor="#10b981" sparkCount={8} sparkRadius={28}>
      <div className="relative flex min-h-screen bg-space-950 text-slate-100">
        {/* Interactive background particles */}
        <Particles particleCount={35} speed={0.4} />

        {/* Desktop sidebar */}
        <aside className="sticky top-0 hidden h-screen w-72 shrink-0 overflow-y-auto border-r border-white/10 bg-space-900/90 backdrop-blur-2xl lg:block">
          <SidebarContent />
        </aside>

        {/* Mobile drawer */}
        {open && (
          <div className="fixed inset-0 z-40 lg:hidden">
            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setOpen(false)} />
            <aside className="absolute inset-y-0 left-0 w-72 overflow-y-auto border-r border-white/10 bg-space-900 shadow-2xl">
              <SidebarContent onNavigate={() => setOpen(false)} />
            </aside>
          </div>
        )}

        {/* Main layout container */}
        <div className="relative z-10 flex min-w-0 flex-1 flex-col">
          {/* Mobile top navigation */}
          <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-white/10 bg-space-900/80 px-4 py-3 backdrop-blur-xl lg:hidden">
            <button
              className="btn-secondary btn-sm !p-2"
              onClick={() => setOpen(true)}
              aria-label="Open menu"
            >
              <Menu className="h-4 w-4" />
            </button>
            <div className="flex items-center gap-2">
              <FlaskConical className="h-5 w-5 text-emerald-400" />
              <span className="font-bold text-white">LabLedger</span>
            </div>
            <span className="ml-auto">
              <MobileWalletChip />
            </span>
          </header>

          {/* Primary page view */}
          <main className="mx-auto w-full max-w-7xl flex-1 space-y-6 px-4 py-6 sm:px-6 lg:px-8">
            <Banners />
            {children}
          </main>
        </div>
      </div>
    </ClickSpark>
  );
}

function MobileWalletChip() {
  const { account, connect, connecting } = useWallet();
  if (account) {
    return (
      <span className="badge border-emerald-500/30 bg-emerald-500/15 font-mono text-emerald-300">
        {shortAddr(account)}
      </span>
    );
  }
  return (
    <button className="btn-primary btn-sm" onClick={connect} disabled={connecting}>
      Connect
    </button>
  );
}

