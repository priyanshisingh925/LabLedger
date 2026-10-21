import { useState } from "react";
import { Coins, Clock, ShieldCheck, Check, ArrowRight, Lock } from "lucide-react";
import { Address, Card, EmptyState, Notice, PageHeader } from "../components/ui";
import { EquipmentBadge } from "../components/StatusBadge";
import { useActions } from "../hooks/useActions";
import { useChainNow, useLedger } from "../hooks/useLedger";
import { useTx } from "../hooks/useTx";
import { useWallet } from "../hooks/useWallet";
import { EquipmentStatus, LoanStatus, type Equipment } from "../types";
import { ethLabel, formatDuration, formatTime } from "../utils/format";
import { StarBorder } from "../components/reactbits/StarBorder";

export default function Borrow() {
  const { snapshot } = useLedger();
  const { account, balance, connect, wrongNetwork, hasWallet } = useWallet();
  const actions = useActions();
  const { busy } = useTx();
  const chainNow = useChainNow();
  const [selectedId, setSelectedId] = useState<bigint>();
  const [lastBorrowed, setLastBorrowed] = useState<bigint>();

  if (!snapshot) return <PageHeader title="Borrow Equipment" subtitle="Choose an item and lock the required deposit." />;

  const { equipment, policy, isAuthorized, loans } = snapshot;
  const available = equipment.filter((e) => e.status === EquipmentStatus.Available);
  const unavailable = equipment.filter((e) => e.status !== EquipmentStatus.Available);
  const selected = equipment.find((e) => e.id === selectedId);

  const eligible = !!account && isAuthorized && !wrongNetwork;
  const ineligibleReason = !account
    ? "Connect your wallet to borrow equipment."
    : wrongNetwork
      ? "Switch MetaMask to the local Hardhat network first."
      : !isAuthorized
        ? "This wallet is not authorized to borrow. Ask the lab administrator to authorize it in the Admin Panel."
        : undefined;

  const confirm = async (e: Equipment) => {
    const ok = await actions.borrow(e.id, e.deposit, e.name);
    if (ok) {
      setLastBorrowed(e.id);
      setSelectedId(undefined);
    }
  };

  const myLoan =
    lastBorrowed !== undefined && account
      ? [...loans].reverse().find((l) => l.equipmentId === lastBorrowed && l.borrower.toLowerCase() === account.toLowerCase() && l.status !== LoanStatus.Completed)
      : undefined;

  const reasonFor = (e: Equipment) => {
    if (e.status === EquipmentStatus.Borrowed) return "Currently checked out by another student";
    if (e.status === EquipmentStatus.Unavailable) return "Temporarily disabled by laboratory administrator";
    return "Retired - permanently archived from lending pool";
  };

  return (
    <>
      <PageHeader
        title="Borrow Equipment"
        subtitle="Select certified hardware, review loan policies and deposit escrow, then confirm the cryptographic checkout."
      />

      {!account && (
        <Notice tone="info" title="Wallet connection required">
          Connect your authorized Web3 wallet to check out instruments from the lab.
          <div className="mt-2.5">
            <button className="btn-primary btn-sm" onClick={connect}>
              {hasWallet ? "Connect MetaMask" : "MetaMask is required"}
            </button>
          </div>
        </Notice>
      )}

      {ineligibleReason && account && (
        <Notice tone="warn" title="Checkout unavailable">
          {ineligibleReason}
        </Notice>
      )}

      {myLoan && (
        <Notice tone="success" title={`Loan #${myLoan.id} Successfully Initialized`}>
          “{equipment.find((e) => e.id === myLoan.equipmentId)?.name}” has been assigned to your wallet <Address value={account} you />.
          Escrow deposit locked: <strong className="font-mono text-white">{ethLabel(myLoan.deposit)}</strong>. Scheduled return deadline: <strong>{formatTime(myLoan.dueAt)}</strong>.
        </Notice>
      )}

      {/* Policy banner */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-cyan-500/30 bg-cyan-950/20 px-4 py-3 text-xs text-cyan-200 backdrop-blur-xl">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-cyan-400" />
          <span>
            Standard duration: <strong>{formatDuration(policy.loanDuration)}</strong>
          </span>
        </div>
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-emerald-400" />
          <span>Full deposit returned if received on time</span>
        </div>
        <div className="flex items-center gap-2">
          <Coins className="h-4 w-4 text-amber-400" />
          <span>Late penalty rate: {policy.lateFeeBps / 100}% per {formatDuration(policy.penaltyPeriod)}</span>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Available Equipment List */}
        <div className="lg:col-span-2">
          <Card title={`Available Instruments (${available.length})`} padded={false}>
            {available.length === 0 ? (
              <EmptyState title="No items currently available">
                Check back shortly once active loans are verified and returned to the inventory.
              </EmptyState>
            ) : (
              <ul className="divide-y divide-white/5">
                {available.map((e) => {
                  const isSelected = selectedId === e.id;
                  return (
                    <li
                      key={e.id.toString()}
                      onClick={() => eligible && setSelectedId(e.id)}
                      className={`flex flex-wrap items-center justify-between gap-4 p-5 transition-all duration-200 cursor-pointer ${
                        isSelected
                          ? "border-l-4 border-l-emerald-400 bg-emerald-500/10"
                          : "hover:bg-white/[0.02]"
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-white">{e.name}</p>
                          <span className="font-mono text-xs text-slate-400">#{e.id.toString()}</span>
                          <span className="rounded-md border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] text-slate-300">
                            {e.category}
                          </span>
                        </div>
                        <p className="mt-1 text-xs leading-relaxed text-slate-400">{e.description}</p>
                      </div>

                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <p className="text-[10px] uppercase tracking-wider text-slate-400">Required Deposit</p>
                          <p className="font-mono text-sm font-bold text-emerald-400">{ethLabel(e.deposit)}</p>
                        </div>
                        <button
                          className={isSelected ? "btn-primary btn-sm" : "btn-secondary btn-sm"}
                          onClick={(ev) => {
                            ev.stopPropagation();
                            setSelectedId(e.id);
                          }}
                          disabled={!eligible}
                        >
                          {isSelected ? (
                            <>
                              <Check className="h-3 w-3" />
                              <span>Selected</span>
                            </>
                          ) : (
                            "Select"
                          )}
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </div>

        {/* Checkout Terminal Panel */}
        <div>
          <Card title="Checkout Terminal">
            {selected ? (
              <div className="space-y-4">
                <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                  <span className="text-[11px] uppercase tracking-wider text-emerald-400 font-semibold">Ready for Escrow</span>
                  <p className="mt-1 text-lg font-bold text-white">{selected.name}</p>
                  <p className="font-mono text-xs text-slate-400">Item #{selected.id.toString()} · {selected.category}</p>
                </div>

                <dl className="space-y-2 rounded-xl border border-white/5 bg-space-950/60 p-4 text-xs">
                  <div className="flex justify-between py-1 border-b border-white/5">
                    <dt className="text-slate-400">Escrow Deposit</dt>
                    <dd className="font-mono font-bold text-emerald-400">{ethLabel(selected.deposit)}</dd>
                  </div>
                  <div className="flex justify-between py-1 border-b border-white/5">
                    <dt className="text-slate-400">Loan Duration</dt>
                    <dd className="font-medium text-slate-200">{formatDuration(policy.loanDuration)}</dd>
                  </div>
                  <div className="flex justify-between py-1 border-b border-white/5">
                    <dt className="text-slate-400">Deadline (If taken now)</dt>
                    <dd className="font-medium text-slate-200">{formatTime(chainNow + policy.loanDuration)}</dd>
                  </div>
                  <div className="flex justify-between py-1">
                    <dt className="text-slate-400">Your Wallet Balance</dt>
                    <dd className="font-mono font-medium text-slate-200">
                      {balance !== undefined ? ethLabel(balance) : "…"}
                    </dd>
                  </div>
                </dl>

                {balance !== undefined && balance < selected.deposit && (
                  <Notice tone="error" title="Insufficient Balance">
                    Your wallet balance is lower than the required escrow deposit.
                  </Notice>
                )}

                <StarBorder
                  onClick={() => confirm(selected)}
                  disabled={busy || !eligible || (balance !== undefined && balance < selected.deposit)}
                  className="w-full !rounded-xl"
                  color="#10b981"
                >
                  <Lock className="h-4 w-4 text-emerald-400" />
                  <span>Confirm Checkout &amp; Escrow</span>
                </StarBorder>

                <p className="text-[11px] leading-relaxed text-slate-400 text-center">
                  Deposit is securely locked in the smart contract escrow. Claim your 100% refund as soon as the item is checked back in.
                </p>
              </div>
            ) : (
              <div className="py-8 text-center">
                <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-slate-400">
                  <ArrowRight className="h-5 w-5" />
                </div>
                <p className="mt-3 text-sm font-semibold text-slate-300">Select an Instrument</p>
                <p className="mt-1 text-xs text-slate-400">Choose an available item on the left to initialize the checkout terminal.</p>
              </div>
            )}
          </Card>
        </div>
      </div>

      {/* Unavailable Items */}
      {unavailable.length > 0 && (
        <Card title={`Currently Unavailable (${unavailable.length})`} padded={false}>
          <ul className="divide-y divide-white/5">
            {unavailable.map((e) => (
              <li key={e.id.toString()} className="flex flex-wrap items-center justify-between gap-4 px-5 py-3.5">
                <div className="min-w-0">
                  <p className="font-medium text-slate-300">
                    {e.name} <span className="font-mono text-xs text-slate-500">#{e.id.toString()}</span>
                  </p>
                  <p className="text-xs text-slate-400">{reasonFor(e)}</p>
                </div>
                <div className="flex items-center gap-3">
                  <EquipmentBadge status={e.status} />
                  {account && !wrongNetwork && (
                    <button
                      className="btn-secondary btn-sm"
                      disabled={busy}
                      title="Contract rejects checkout: demonstrates revert reasoning"
                      onClick={() => actions.borrow(e.id, e.deposit, e.name)}
                    >
                      Test Revert
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}

