import { Fragment, useCallback, useEffect, useState } from "react";
import { ChevronDown, ChevronUp, ExternalLink } from "lucide-react";
import { EXPLORER_URL, POLL_INTERVAL_MS } from "../config";
import { Card, CopyButton, EmptyState, Notice, PageHeader, TableWrap } from "../components/ui";
import { useTx } from "../hooks/useTx";
import { fetchActivity, fetchTxDetails } from "../services/labledger";
import { explainError } from "../services/errors";
import type { ActivityEvent } from "../types";
import { formatTime, shortHash } from "../utils/format";

const TONE: Record<string, { badge: string; dot: string }> = {
  EquipmentBorrowed: {
    badge: "border-sky-500/30 bg-sky-500/15 text-sky-300",
    dot: "bg-sky-400",
  },
  ReturnRequested: {
    badge: "border-amber-500/30 bg-amber-500/15 text-amber-300",
    dot: "bg-amber-400",
  },
  EquipmentReturned: {
    badge: "border-emerald-500/30 bg-emerald-500/15 text-emerald-300",
    dot: "bg-emerald-400",
  },
  RefundClaimed: {
    badge: "border-emerald-500/30 bg-emerald-500/15 text-emerald-300",
    dot: "bg-emerald-400",
  },
  RefundCredited: {
    badge: "border-teal-500/30 bg-teal-500/15 text-teal-300",
    dot: "bg-teal-400",
  },
  OverdueEscalated: {
    badge: "border-rose-500/30 bg-rose-500/15 text-rose-300",
    dot: "bg-rose-400 animate-ping",
  },
  EscalationResolved: {
    badge: "border-emerald-500/30 bg-emerald-500/15 text-emerald-300",
    dot: "bg-emerald-400",
  },
  ReturnRejected: {
    badge: "border-rose-500/30 bg-rose-500/15 text-rose-300",
    dot: "bg-rose-400",
  },
  TreasuryWithdrawn: {
    badge: "border-violet-500/30 bg-violet-500/15 text-violet-300",
    dot: "bg-violet-400",
  },
};

function Details({ ev }: { ev: ActivityEvent }) {
  const [info, setInfo] = useState<Awaited<ReturnType<typeof fetchTxDetails>>>();
  const [err, setErr] = useState<string>();
  useEffect(() => {
    fetchTxDetails(ev.txHash).then(setInfo).catch((e) => setErr(explainError(e)));
  }, [ev.txHash]);

  return (
    <div className="grid gap-6 border-y border-white/10 bg-space-950/80 p-5 text-xs md:grid-cols-2">
      <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
        <p className="mb-2 font-semibold uppercase tracking-wider text-slate-400">On-Chain Transaction Parameters</p>
        {err && <p className="text-rose-400">{err}</p>}
        {!info && !err && <p className="text-slate-400">Querying RPC block receipt…</p>}
        {info && (
          <dl className="space-y-1.5 font-mono">
            <div className="flex gap-2">
              <dt className="w-24 text-slate-400">Status</dt>
              <dd className="font-semibold text-emerald-400">{info.status}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-24 text-slate-400">Block</dt>
              <dd className="text-slate-200">{info.blockNumber}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-24 text-slate-400">Timestamp</dt>
              <dd className="text-slate-200">{formatTime(ev.timestamp)}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-24 text-slate-400">From</dt>
              <dd className="break-all text-slate-300">{info.from}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-24 text-slate-400">To</dt>
              <dd className="break-all text-slate-300">{info.to}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-24 text-slate-400">Value</dt>
              <dd className="text-slate-200">{info.valueEth} ETH</dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-24 text-slate-400">Gas Used</dt>
              <dd className="text-slate-200">{info.gasUsed}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-24 text-slate-400">Tx Hash</dt>
              <dd className="break-all text-emerald-400">{ev.txHash}</dd>
            </div>
          </dl>
        )}
      </div>

      <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
        <p className="mb-2 font-semibold uppercase tracking-wider text-slate-400">Event Decoded Arguments</p>
        <dl className="space-y-1.5 font-mono">
          {Object.entries(ev.args).map(([k, v]) => (
            <div key={k} className="flex gap-2">
              <dt className="w-32 shrink-0 text-slate-400">{k}</dt>
              <dd className="break-all text-slate-200">{v}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}

export default function Activity() {
  const { history } = useTx();
  const [events, setEvents] = useState<ActivityEvent[]>();
  const [error, setError] = useState<string>();
  const [filter, setFilter] = useState("all");
  const [open, setOpen] = useState<string>();

  const load = useCallback(async () => {
    try {
      setEvents(await fetchActivity());
      setError(undefined);
    } catch (e) {
      setError(explainError(e));
    }
  }, []);

  useEffect(() => {
    void load();
    const t = setInterval(load, POLL_INTERVAL_MS);
    return () => clearInterval(t);
  }, [load]);

  const names = Array.from(new Set((events ?? []).map((e) => e.name))).sort();
  const rows = (events ?? []).filter((e) => filter === "all" || e.name === filter);

  return (
    <>
      <PageHeader
        title="Blockchain Audit Trail"
        subtitle="Permanent, cryptographically signed ledger record of every action emitted by the smart contract. Click any event row to inspect block proofs."
      />

      {!EXPLORER_URL && (
        <Notice tone="info">
          No external block explorer URL is configured (standard for local node). Raw RPC block parameters are decoded and rendered directly below.
        </Notice>
      )}
      {error && <Notice tone="error">{error}</Notice>}

      {/* Browser session transactions */}
      {history.length > 0 && (
        <Card title="Transactions Sent from this Browser Session" padded={false}>
          <TableWrap>
            <table className="min-w-full divide-y divide-white/5">
              <thead className="bg-white/[0.02]">
                <tr>
                  <th className="th">Timestamp</th>
                  <th className="th">Action Description</th>
                  <th className="th">Status</th>
                  <th className="th">Transaction Hash</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {history.map((h) => (
                  <tr key={h.id} className="transition-colors hover:bg-white/[0.02]">
                    <td className="td whitespace-nowrap text-xs text-slate-400">
                      {new Date(h.at).toLocaleTimeString()}
                    </td>
                    <td className="td font-medium text-white">{h.label}</td>
                    <td className="td">
                      <span
                        className={`badge ${
                          h.status === "success"
                            ? "border-emerald-500/30 bg-emerald-500/15 text-emerald-300"
                            : h.status === "error"
                              ? "border-rose-500/30 bg-rose-500/15 text-rose-300"
                              : "border-sky-500/30 bg-sky-500/15 text-sky-300"
                        }`}
                      >
                        {h.status === "awaiting-wallet"
                          ? "Awaiting Wallet Signature"
                          : h.status === "pending"
                            ? "Pending Confirmation"
                            : h.status === "success"
                              ? "Confirmed on-chain"
                              : "Execution Failed"}
                      </span>
                      {h.status === "error" && (
                        <p className="mt-1 max-w-md text-xs text-rose-400">{h.message}</p>
                      )}
                    </td>
                    <td className="td">
                      {h.hash ? (
                        <span className="inline-flex items-center gap-2">
                          <code className="font-mono text-xs text-slate-300">{shortHash(h.hash)}</code>
                          <CopyButton text={h.hash} />
                        </span>
                      ) : (
                        <span className="text-slate-500">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        </Card>
      )}

      {/* Contract Events */}
      <Card
        title={`On-Chain Event Log (${rows.length})`}
        padded={false}
        actions={
          <select
            className="input !w-auto !py-1.5"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            aria-label="Filter by event"
          >
            <option value="all">All Events</option>
            {names.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        }
      >
        {!events ? (
          <EmptyState title="Synchronizing contract events from blockchain…" />
        ) : rows.length === 0 ? (
          <EmptyState title="No on-chain events found for this filter" />
        ) : (
          <TableWrap>
            <table className="min-w-full divide-y divide-white/5">
              <thead className="bg-white/[0.02]">
                <tr>
                  <th className="th">Block Time</th>
                  <th className="th">Event Type</th>
                  <th className="th">Action Summary</th>
                  <th className="th">Block #</th>
                  <th className="th">Tx Hash</th>
                  <th className="th text-right">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {rows.map((ev) => {
                  const toneConfig = TONE[ev.name] || {
                    badge: "border-white/10 bg-white/5 text-slate-300",
                    dot: "bg-slate-400",
                  };
                  const isOpen = open === ev.key;

                  return (
                    <Fragment key={ev.key}>
                      <tr
                        className={`cursor-pointer transition-colors ${
                          isOpen ? "bg-white/[0.04]" : "hover:bg-white/[0.02]"
                        }`}
                        onClick={() => setOpen(isOpen ? undefined : ev.key)}
                      >
                        <td className="td whitespace-nowrap text-xs text-slate-400 font-mono">
                          {formatTime(ev.timestamp)}
                        </td>
                        <td className="td">
                          <span className={`badge ${toneConfig.badge}`}>
                            <span className={`h-1.5 w-1.5 rounded-full ${toneConfig.dot}`} />
                            {ev.name}
                          </span>
                        </td>
                        <td className="td font-medium text-slate-200">{ev.summary}</td>
                        <td className="td font-mono text-xs text-slate-400">#{ev.blockNumber}</td>
                        <td className="td whitespace-nowrap">
                          <span className="inline-flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                            <code className="font-mono text-xs text-slate-300">{shortHash(ev.txHash)}</code>
                            <CopyButton text={ev.txHash} />
                            {EXPLORER_URL && (
                              <a
                                className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-400 hover:underline"
                                href={`${EXPLORER_URL}/tx/${ev.txHash}`}
                                target="_blank"
                                rel="noreferrer"
                              >
                                <span>Explorer</span>
                                <ExternalLink className="h-3 w-3" />
                              </a>
                            )}
                          </span>
                        </td>
                        <td className="td text-right">
                          <button
                            type="button"
                            className="rounded-md p-1 text-slate-400 transition hover:bg-white/10 hover:text-white"
                            aria-label={isOpen ? "Collapse event details" : "Expand event details"}
                          >
                            {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                          </button>
                        </td>
                      </tr>
                      {isOpen && (
                        <tr>
                          <td colSpan={6} className="p-0">
                            <Details ev={ev} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </TableWrap>
        )}
      </Card>
    </>
  );
}

