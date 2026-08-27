import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { AlertTriangle, ChevronLeft, ChevronRight, Loader2, Search } from "lucide-react";

/**
 * Shared building blocks for the admin panel.
 *
 * The panel is dense and data-heavy, so it uses a tighter, more tabular styling
 * than the rest of the app while keeping the same palette.
 */

export const adminInput =
  "rounded border border-[#1e1e1e] bg-[#0a0a0a] px-2.5 py-1.5 font-['Archivo'] text-xs text-white "
  + "placeholder:text-[#555555] focus:border-[#4ade80] focus:outline-none";

export const adminLabel =
  "mb-1 block font-['JetBrains_Mono'] text-[10px] uppercase tracking-widest text-[#666666]";

export function AdminPanel({
  title, description, actions, children,
}: {
  title: string; description?: string; actions?: ReactNode; children: ReactNode;
}) {
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-['JetBrains_Mono'] text-base text-white">{title}</h2>
          {description && (
            <p className="mt-0.5 font-['Archivo'] text-xs text-[#888888]">{description}</p>
          )}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children}
    </div>
  );
}

export function SearchBox({
  value, onChange, placeholder = "Search",
}: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div className="relative min-w-[180px] flex-1">
      <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#555555]" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`${adminInput} w-full pl-8`}
      />
    </div>
  );
}

/** Dense table with a consistent header, empty state and loading overlay. */
export function DataTable<T>({
  columns, rows, loading, empty, rowKey,
}: {
  columns: Array<{ header: string; cell: (row: T) => ReactNode; width?: string; align?: string }>;
  rows: T[];
  loading?: boolean;
  empty?: string;
  rowKey: (row: T) => string;
}) {
  return (
    <div className="relative overflow-x-auto rounded border border-[#1e1e1e] bg-[#111111]">
      {loading && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#111111]/70">
          <Loader2 className="h-4 w-4 animate-spin text-[#4ade80]" />
        </div>
      )}

      <table className="w-full min-w-[640px] border-collapse">
        <thead>
          <tr className="border-b border-[#1e1e1e]">
            {columns.map((column) => (
              <th
                key={column.header}
                style={{ width: column.width }}
                className={`px-3 py-2 font-['JetBrains_Mono'] text-[10px] uppercase tracking-widest text-[#666666] ${
                  column.align === "right" ? "text-right" : "text-left"
                }`}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && !loading ? (
            <tr>
              <td
                colSpan={columns.length}
                className="px-3 py-10 text-center font-['Archivo'] text-sm text-[#666666]"
              >
                {empty || "Nothing here"}
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr
                key={rowKey(row)}
                className="border-b border-[#1a1a1a] transition-colors last:border-0 hover:bg-[#161616]"
              >
                {columns.map((column) => (
                  <td
                    key={column.header}
                    className={`px-3 py-2 font-['Archivo'] text-xs text-white ${
                      column.align === "right" ? "text-right" : ""
                    }`}
                  >
                    {column.cell(row)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

export function Pager({
  page, pages, total, onPage,
}: { page: number; pages: number; total: number; onPage: (p: number) => void }) {
  if (total === 0) return null;
  return (
    <div className="mt-3 flex items-center justify-between font-['JetBrains_Mono'] text-[11px] text-[#666666]">
      <span>{total} total</span>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onPage(page - 1)}
          disabled={page <= 1}
          className="flex h-6 w-6 items-center justify-center rounded text-[#888888] transition-colors hover:bg-[#1a1a1a] hover:text-white disabled:opacity-30"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>
        <span className="px-1">{page} / {pages || 1}</span>
        <button
          onClick={() => onPage(page + 1)}
          disabled={page >= pages}
          className="flex h-6 w-6 items-center justify-center rounded text-[#888888] transition-colors hover:bg-[#1a1a1a] hover:text-white disabled:opacity-30"
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

/**
 * Button that requires a second click to fire.
 *
 * Used for anything destructive. A native confirm() dialog is easy to click
 * through by reflex; a two-step button in place makes the consequence visible
 * where the action is.
 */
export function ConfirmButton({
  onConfirm, children, confirmLabel = "Really?", danger = true, disabled, title,
}: {
  onConfirm: () => void | Promise<void>;
  children: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  disabled?: boolean;
  title?: string;
}) {
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);

  async function handle() {
    if (!armed) {
      setArmed(true);
      // Disarm on its own so a forgotten armed button is not a trap
      setTimeout(() => setArmed(false), 4000);
      return;
    }
    setBusy(true);
    try {
      await onConfirm();
    } finally {
      setBusy(false);
      setArmed(false);
    }
  }

  const palette = danger
    ? armed
      ? "border-[#ff4444] bg-[#ff4444]/15 text-[#ff8888]"
      : "border-[#1e1e1e] text-[#888888] hover:border-[#ff4444]/50 hover:text-[#ff6666]"
    : armed
      ? "border-[#f59e0b] bg-[#f59e0b]/15 text-[#f59e0b]"
      : "border-[#1e1e1e] text-[#888888] hover:text-white";

  return (
    <button
      onClick={handle}
      disabled={disabled || busy}
      title={title}
      className={`inline-flex items-center gap-1 rounded border px-2 py-1 font-['JetBrains_Mono'] text-[10px] transition-colors disabled:opacity-40 ${palette}`}
    >
      {busy && <Loader2 className="h-3 w-3 animate-spin" />}
      {armed ? confirmLabel : children}
    </button>
  );
}

export function AdminButton({
  onClick, children, variant = "ghost", disabled, busy, title,
}: {
  onClick: () => void | Promise<void>;
  children: ReactNode;
  variant?: "ghost" | "primary";
  disabled?: boolean;
  busy?: boolean;
  title?: string;
}) {
  const palette = variant === "primary"
    ? "bg-[#4ade80] text-black hover:opacity-90"
    : "border border-[#1e1e1e] text-white hover:border-[#4ade80]";

  return (
    <button
      onClick={onClick}
      disabled={disabled || busy}
      title={title}
      className={`inline-flex items-center gap-1.5 rounded px-2.5 py-1.5 font-['JetBrains_Mono'] text-[11px] transition-colors disabled:opacity-40 ${palette}`}
    >
      {busy && <Loader2 className="h-3 w-3 animate-spin" />}
      {children}
    </button>
  );
}

export function Pill({
  children, tone = "neutral",
}: { children: ReactNode; tone?: "neutral" | "good" | "warn" | "bad" | "info" }) {
  const tones = {
    neutral: "bg-[#1a1a1a] text-[#aaaaaa]",
    good: "bg-[#4ade80]/15 text-[#4ade80]",
    warn: "bg-[#f59e0b]/15 text-[#f59e0b]",
    bad: "bg-[#ff4444]/15 text-[#ff8888]",
    info: "bg-[#60a5fa]/15 text-[#60a5fa]",
  } as const;

  return (
    <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-['JetBrains_Mono'] text-[10px] ${tones[tone]}`}>
      {children}
    </span>
  );
}

export function AdminStat({
  label, value, hint, tone,
}: { label: string; value: ReactNode; hint?: string; tone?: string }) {
  return (
    <div className="rounded border border-[#1e1e1e] bg-[#111111] p-3">
      <div className="font-['JetBrains_Mono'] text-[10px] uppercase tracking-widest text-[#666666]">
        {label}
      </div>
      <div className="mt-1 font-['JetBrains_Mono'] text-xl" style={{ color: tone || "#ffffff" }}>
        {value}
      </div>
      {hint && <div className="mt-0.5 font-['Archivo'] text-[11px] text-[#666666]">{hint}</div>}
    </div>
  );
}

export function DangerNotice({ children }: { children: ReactNode }) {
  return (
    <div className="mb-4 flex items-start gap-2 rounded border border-[#f59e0b]/30 bg-[#f59e0b]/5 px-3 py-2">
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#f59e0b]" />
      <p className="font-['Archivo'] text-xs leading-relaxed text-[#ccaa77]">{children}</p>
    </div>
  );
}

/**
 * Debounces a value. Every admin list is server-paginated, so typing in a search
 * box would otherwise fire a request per keystroke.
 */
export function useDebounced<T>(value: T, delay = 400) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}
