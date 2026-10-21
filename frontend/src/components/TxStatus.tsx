import { CheckCircle2, AlertCircle, X, ExternalLink } from "lucide-react";
import { EXPLORER_URL } from "../config";
import { useTx } from "../hooks/useTx";
import { shortHash } from "../utils/format";
import { CopyButton, Spinner } from "./ui";

/** Floating status of the transaction currently being processed (pending / success / failed). */
export function TxStatus() {
  const { current, dismiss } = useTx();
  if (current.status === "idle") return null;

  const tone =
    current.status === "success"
      ? "border-emerald-500/40 bg-space-900/90 text-emerald-200 shadow-emerald-950/50"
      : current.status === "error"
        ? "border-rose-500/40 bg-space-900/90 text-rose-200 shadow-rose-950/50"
        : "border-sky-500/40 bg-space-900/90 text-sky-200 shadow-sky-950/50";

  const title =
    current.status === "success"
      ? "Transaction Confirmed"
      : current.status === "error"
        ? "Transaction Failed"
        : current.status === "awaiting-wallet"
          ? "Waiting for Signature…"
          : "Processing Transaction…";

  return (
    <div
      className={`fixed bottom-5 right-5 z-50 w-[calc(100%-2.5rem)] max-w-md rounded-2xl border p-5 shadow-2xl backdrop-blur-2xl transition-all duration-300 ${tone}`}
      role="status"
      aria-live="polite"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <div className="mt-0.5">
            {current.status === "success" && <CheckCircle2 className="h-5 w-5 text-emerald-400" />}
            {current.status === "error" && <AlertCircle className="h-5 w-5 text-rose-400" />}
            {(current.status === "pending" || current.status === "awaiting-wallet") && <Spinner />}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-white tracking-wide">{title}</p>
            <p className="mt-0.5 text-xs font-medium text-slate-300">{current.label}</p>
            {current.message && <p className="mt-1.5 text-xs leading-relaxed text-slate-400">{current.message}</p>}
            {current.hash && (
              <div className="mt-2.5 flex flex-wrap items-center gap-2 text-xs">
                <span className="text-slate-400">Hash:</span>
                <code className="font-mono text-slate-200">{shortHash(current.hash)}</code>
                <CopyButton text={current.hash} />
                {EXPLORER_URL && (
                  <a
                    className="inline-flex items-center gap-1 font-semibold text-emerald-400 hover:underline"
                    href={`${EXPLORER_URL}/tx/${current.hash}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <span>Explorer</span>
                    <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
            )}
          </div>
        </div>
        {(current.status === "success" || current.status === "error") && (
          <button
            onClick={dismiss}
            className="rounded-lg p-1 text-slate-400 transition hover:bg-white/10 hover:text-white"
            aria-label="Dismiss"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}

