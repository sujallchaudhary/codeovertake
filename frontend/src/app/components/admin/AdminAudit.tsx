import { useCallback, useEffect, useState } from "react";
import { ChevronDown, ChevronRight, Download, RefreshCw, ShieldAlert, Terminal } from "lucide-react";
import { fetchAdminAudit, type AuditEntry } from "../../api";
import { EmptyState, ErrorBanner, Spinner, formatRelativeTime } from "../TrackerUI";
import {
  AdminButton, AdminPanel, Pager, Pill, SearchBox, adminInput, adminLabel, useDebounced,
} from "./AdminUI";

const TARGET_TYPES = ["student", "user", "claim", "problem", "sheet", "contest", "job"];

/** Colour by blast radius, not by entity: deletes stand out, reads stay quiet. */
function actionTone(action: string) {
  if (action.includes("delete") || action.includes("suspend")) return "bad" as const;
  if (action.includes("admin") || action.includes("reassign") || action.includes("release")) {
    return "warn" as const;
  }
  if (action.startsWith("job.")) return "info" as const;
  return "neutral" as const;
}

function MetadataRow({ entry }: { entry: AuditEntry }) {
  const [open, setOpen] = useState(false);
  const metadata = entry.metadata || {};
  const keys = Object.keys(metadata);

  if (keys.length === 0) return <span className="text-[#555555]">—</span>;

  return (
    <div>
      <button
        onClick={() => setOpen((value) => !value)}
        className="inline-flex items-center gap-1 font-['JetBrains_Mono'] text-[10px] text-[#666666] transition-colors hover:text-white"
      >
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        {keys.length} field{keys.length === 1 ? "" : "s"}
      </button>

      {open && (
        <pre className="mt-1.5 max-w-[420px] overflow-x-auto rounded border border-[#1e1e1e] bg-[#0a0a0a] px-2 py-1.5 font-['JetBrains_Mono'] text-[10px] leading-relaxed text-[#aaaaaa]">
          {JSON.stringify(metadata, null, 2)}
        </pre>
      )}
    </div>
  );
}

export function AdminAudit() {
  const [action, setAction] = useState("");
  const [targetType, setTargetType] = useState("");
  const [targetId, setTargetId] = useState("");
  const debouncedTargetId = useDebounced(targetId);
  const [page, setPage] = useState(1);

  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [actions, setActions] = useState<string[]>([]);
  const [pagination, setPagination] = useState({ page: 1, pages: 0, total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetchAdminAudit({
        action: action || undefined,
        targetType: targetType || undefined,
        targetId: debouncedTargetId || undefined,
        page,
        limit: 50,
      });
      setEntries(res.entries);
      setPagination(res.pagination);
      // The action list comes from distinct() over the whole collection, so it is
      // stable across filters — but an empty first page would blank the dropdown.
      if (res.actions.length > 0) setActions(res.actions);
    } catch (err: any) {
      setError(err.message || "Could not load the audit log");
    } finally {
      setLoading(false);
    }
  }, [action, targetType, debouncedTargetId, page]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [action, targetType, debouncedTargetId]);

  /** Exports the current page as JSON, which is what you paste into an incident note. */
  function exportPage() {
    const blob = new Blob([JSON.stringify(entries, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `audit-page-${pagination.page}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  if (loading && entries.length === 0 && !action && !targetType && !debouncedTargetId) {
    return <Spinner label="Loading audit log..." />;
  }

  return (
    <AdminPanel
      title="Audit log"
      description="Every privileged action, who did it and what changed."
      actions={(
        <>
          <AdminButton onClick={exportPage} disabled={entries.length === 0}>
            <Download className="h-3 w-3" /> Export page
          </AdminButton>
          <AdminButton onClick={load} busy={loading}>
            <RefreshCw className="h-3 w-3" /> Refresh
          </AdminButton>
        </>
      )}
    >
      {error && <ErrorBanner message={error} />}

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div>
          <label className={adminLabel}>Action</label>
          <select value={action} onChange={(e) => setAction(e.target.value)} className={adminInput}>
            <option value="">All actions</option>
            {actions.map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
        </div>

        <div>
          <label className={adminLabel}>Target type</label>
          <select
            value={targetType}
            onChange={(e) => setTargetType(e.target.value)}
            className={adminInput}
          >
            <option value="">All types</option>
            {TARGET_TYPES.map((type) => (
              <option key={type} value={type}>{type}</option>
            ))}
          </select>
        </div>

        <div className="min-w-[200px] flex-1">
          <label className={adminLabel}>Target id</label>
          <SearchBox
            value={targetId}
            onChange={setTargetId}
            placeholder="Exact roll number, handle or id"
          />
        </div>
      </div>

      {/*
        Rendered as a hand-rolled list rather than DataTable because each entry can
        expand a metadata block, and a nested <pre> inside a fixed-width table cell
        forces horizontal scrolling on the whole table.
      */}
      <div className="relative overflow-x-auto rounded border border-[#1e1e1e] bg-[#111111]">
        <table className="w-full min-w-[720px] border-collapse">
          <thead>
            <tr className="border-b border-[#1e1e1e]">
              {["Action", "Target", "Changes", "Actor", "When"].map((header, index) => (
                <th
                  key={header}
                  className={`px-3 py-2 font-['JetBrains_Mono'] text-[10px] uppercase tracking-widest text-[#666666] ${
                    index === 4 ? "text-right" : "text-left"
                  }`}
                >
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {entries.length === 0 ? (
              <tr>
                <td colSpan={5} className="p-0">
                  <EmptyState
                    icon={<ShieldAlert className="h-8 w-8" />}
                    title="No entries"
                    description={
                      action || targetType || debouncedTargetId
                        ? "Nothing matches those filters."
                        : "No privileged actions have been recorded yet."
                    }
                  />
                </td>
              </tr>
            ) : (
              entries.map((entry) => (
                <tr
                  key={entry._id}
                  className="border-b border-[#1a1a1a] align-top transition-colors last:border-0 hover:bg-[#161616]"
                >
                  <td className="px-3 py-2">
                    <Pill tone={actionTone(entry.action)}>{entry.action}</Pill>
                    {entry.outcome && entry.outcome !== "success" && (
                      <div className="mt-1">
                        <Pill tone="bad">{entry.outcome}</Pill>
                      </div>
                    )}
                  </td>

                  <td className="px-3 py-2 font-['Archivo'] text-xs">
                    <div className="text-white">{entry.targetLabel || entry.targetId || "—"}</div>
                    <div className="font-['JetBrains_Mono'] text-[10px] text-[#666666]">
                      {entry.targetType}
                      {entry.targetId && entry.targetLabel ? ` · ${entry.targetId}` : ""}
                    </div>
                  </td>

                  <td className="px-3 py-2">
                    <MetadataRow entry={entry} />
                  </td>

                  <td className="px-3 py-2 font-['Archivo'] text-xs">
                    {entry.actor ? (
                      <>
                        <div className="text-white">{entry.actor.name}</div>
                        <div className="font-['JetBrains_Mono'] text-[10px] text-[#666666]">
                          /u/{entry.actor.handle}
                        </div>
                      </>
                    ) : (
                      /*
                        No actor document means the call authenticated with
                        x-admin-secret — a script or cron, not a person. Worth
                        flagging visually, because it is unattributable.
                      */
                      <span className="inline-flex items-center gap-1 font-['JetBrains_Mono'] text-[10px] text-[#f59e0b]">
                        <Terminal className="h-3 w-3" />
                        {entry.actorLabel || "secret"}
                      </span>
                    )}
                  </td>

                  <td className="whitespace-nowrap px-3 py-2 text-right font-['JetBrains_Mono'] text-[10px] text-[#666666]">
                    {formatRelativeTime(entry.createdAt)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Pager
        page={pagination.page}
        pages={pagination.pages}
        total={pagination.total}
        onPage={setPage}
      />
    </AdminPanel>
  );
}
