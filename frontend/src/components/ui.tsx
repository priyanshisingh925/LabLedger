import { useState, type ReactNode } from "react";
import { Copy, Check, Info, AlertTriangle, AlertCircle, CheckCircle2, Inbox } from "lucide-react";
import { shortAddr } from "../utils/format";
import { SpotlightCard } from "./reactbits/SpotlightCard";
import { CountUp } from "./reactbits/CountUp";
import { ShinyText } from "./reactbits/ShinyText";

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4 border-b border-white/5 pb-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
          <ShinyText speed={4}>{title}</ShinyText>
        </h1>
        {subtitle && <p className="mt-1.5 max-w-3xl text-sm leading-relaxed text-slate-400">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2.5">{actions}</div>}
    </div>
  );
}

export function Card({
  title,
  children,
  actions,
  className = "",
  padded = true,
}: {
  title?: string;
  children: ReactNode;
  actions?: ReactNode;
  className?: string;
  padded?: boolean;
}) {
  return (
    <section className={`card ${className}`}>
      {(title || actions) && (
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 px-5 py-4">
          {title && <h2 className="text-sm font-semibold tracking-wide text-slate-200">{title}</h2>}
          {actions}
        </header>
      )}
      <div className={padded ? "p-5" : ""}>{children}</div>
    </section>
  );
}

export function StatCard({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  tone?: "default" | "green" | "amber" | "red" | "blue";
}) {
  const config = {
    default: {
      bar: "bg-slate-500",
      spotlight: "rgba(148, 163, 184, 0.1)",
      border: "rgba(148, 163, 184, 0.25)",
      badge: "text-slate-400",
    },
    green: {
      bar: "bg-emerald-400",
      spotlight: "rgba(16, 185, 129, 0.15)",
      border: "rgba(16, 185, 129, 0.35)",
      badge: "text-emerald-400",
    },
    amber: {
      bar: "bg-amber-400",
      spotlight: "rgba(245, 158, 11, 0.15)",
      border: "rgba(245, 158, 11, 0.35)",
      badge: "text-amber-400",
    },
    red: {
      bar: "bg-rose-400",
      spotlight: "rgba(244, 63, 94, 0.15)",
      border: "rgba(244, 63, 94, 0.35)",
      badge: "text-rose-400",
    },
    blue: {
      bar: "bg-cyan-400",
      spotlight: "rgba(6, 182, 212, 0.15)",
      border: "rgba(6, 182, 212, 0.35)",
      badge: "text-cyan-400",
    },
  }[tone];

  const numericValue = typeof value === "number" ? value : null;

  return (
    <SpotlightCard
      spotlightColor={config.spotlight}
      borderColor={config.border}
      className="p-5"
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">{label}</p>
        <span className={`h-2 w-2 rounded-full ${config.bar} shadow-sm shadow-current`} />
      </div>

      <div className="mt-2.5 text-2xl font-bold tracking-tight text-white">
        {numericValue !== null ? <CountUp to={numericValue} /> : value}
      </div>

      {hint && <p className="mt-1.5 text-xs text-slate-400">{hint}</p>}
    </SpotlightCard>
  );
}

type NoticeTone = "info" | "warn" | "error" | "success";
export function Notice({ tone = "info", title, children }: { tone?: NoticeTone; title?: string; children?: ReactNode }) {
  const styles: Record<NoticeTone, { container: string; icon: ReactNode }> = {
    info: {
      container: "border-sky-500/30 bg-sky-950/40 text-sky-200",
      icon: <Info className="h-4 w-4 shrink-0 text-sky-400" />,
    },
    warn: {
      container: "border-amber-500/30 bg-amber-950/40 text-amber-200",
      icon: <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400" />,
    },
    error: {
      container: "border-rose-500/30 bg-rose-950/40 text-rose-200",
      icon: <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />,
    },
    success: {
      container: "border-emerald-500/30 bg-emerald-950/40 text-emerald-200",
      icon: <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />,
    },
  };

  const current = styles[tone];

  return (
    <div
      className={`flex items-start gap-3 rounded-xl border p-4 text-sm backdrop-blur-xl transition-all ${current.container}`}
      role={tone === "error" ? "alert" : "status"}
    >
      <div className="mt-0.5">{current.icon}</div>
      <div className="min-w-0 flex-1">
        {title && <p className="font-semibold text-white">{title}</p>}
        {children && <div className={title ? "mt-1 text-slate-300" : "text-slate-300"}>{children}</div>}
      </div>
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-white/10 px-6 py-12 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-slate-400">
        <Inbox className="h-6 w-6" />
      </div>
      <p className="mt-3 text-sm font-semibold text-slate-200">{title}</p>
      {children && <p className="mt-1 max-w-sm text-xs text-slate-400">{children}</p>}
    </div>
  );
}

export function Address({ value, you }: { value?: string; you?: boolean }) {
  const [copied, setCopied] = useState(false);
  if (!value) return <span className="text-slate-500">—</span>;

  const handleCopy = () => {
    navigator.clipboard?.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <span className="inline-flex items-center gap-1.5">
      <button
        type="button"
        onClick={handleCopy}
        title={`Click to copy: ${value}`}
        className="group inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2 py-0.5 font-mono text-xs text-slate-300 transition hover:border-emerald-500/40 hover:bg-emerald-500/10 hover:text-emerald-300"
      >
        <span>{shortAddr(value)}</span>
        {copied ? (
          <Check className="h-3 w-3 text-emerald-400" />
        ) : (
          <Copy className="h-3 w-3 text-slate-500 opacity-60 transition group-hover:opacity-100" />
        )}
      </button>
      {you && <span className="badge border-emerald-500/30 bg-emerald-500/15 text-emerald-300">you</span>}
    </span>
  );
}

export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <button
      type="button"
      className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] font-medium text-slate-300 transition hover:border-emerald-500/30 hover:bg-white/10 hover:text-white"
      onClick={handleCopy}
    >
      {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3 text-slate-400" />}
      {copied ? "Copied" : label}
    </button>
  );
}

export function TableWrap({ children }: { children: ReactNode }) {
  return <div className="overflow-x-auto">{children}</div>;
}

export function Spinner() {
  return (
    <span
      className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-emerald-400 border-t-transparent"
      aria-hidden
    />
  );
}

