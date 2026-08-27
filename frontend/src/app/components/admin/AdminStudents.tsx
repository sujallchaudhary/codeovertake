import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router";
import { ExternalLink, RefreshCw, Save, X } from "lucide-react";
import {
  deleteAdminStudent, fetchAdminStudent, fetchAdminStudents, refreshAdminStudent,
  updateAdminStudent, type AdminStudentRow,
} from "../../api";
import { ErrorBanner, PLATFORM_LABELS, PlatformGlyph, formatRelativeTime } from "../TrackerUI";
import {
  AdminButton, AdminPanel, ConfirmButton, DangerNotice, DataTable, Pager, Pill,
  SearchBox, adminInput, adminLabel, useDebounced,
} from "./AdminUI";

const LEADERBOARD_PLATFORMS = ["github", "leetcode", "codeforces", "codechef"];

/** Editor drawer for one student. Also the place to force a stats refresh. */
function StudentEditor({
  rollno, onClose, onSaved,
}: { rollno: string; onClose: () => void; onSaved: () => void }) {
  const [student, setStudent] = useState<any>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchAdminStudent(rollno);
      setStudent(res.student);
      setForm({
        name: res.student.name || "",
        branch: res.student.branch || "",
        year: String(res.student.year ?? ""),
        ...Object.fromEntries(
          LEADERBOARD_PLATFORMS.map((key) => [key, res.student[key]?.username || ""])
        ),
      });
    } catch (err: any) {
      setError(err.message || "Could not load that student");
    } finally {
      setLoading(false);
    }
  }, [rollno]);

  useEffect(() => { load(); }, [load]);

  async function save() {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await updateAdminStudent(rollno, { ...form, year: Number(form.year) || undefined });
      setMessage("Saved. The change is recorded in the audit log.");
      onSaved();
      await load();
    } catch (err: any) {
      setError(err.errors?.[0]?.message || err.message || "Could not save");
    } finally {
      setBusy(false);
    }
  }

  async function refresh() {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const res = await refreshAdminStudent(rollno);
      const failed = Object.entries(res.platforms).filter(([, v]) => v === "failed");
      setMessage(failed.length
        ? `Refreshed. Failed: ${failed.map(([k]) => PLATFORM_LABELS[k] || k).join(", ")} (previous stats kept).`
        : "Refreshed all connected platforms.");
      onSaved();
      await load();
    } catch (err: any) {
      setError(err.message || "Refresh failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[65] flex justify-end bg-black/70" onClick={onClose}>
      <div
        className="h-full w-full max-w-lg overflow-y-auto border-l border-[#1e1e1e] bg-[#0f0f0f]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[#1e1e1e] bg-[#0f0f0f]/95 px-4 py-3 backdrop-blur-sm">
          <h3 className="font-['JetBrains_Mono'] text-sm text-white">{rollno}</h3>
          <button onClick={onClose} className="text-[#666666] transition-colors hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-4 py-4">
          {error && <ErrorBanner message={error} />}
          {message && (
            <div className="mb-3 rounded border border-[#4ade80]/30 bg-[#4ade80]/10 px-3 py-2 font-['Archivo'] text-xs text-[#4ade80]">
              {message}
            </div>
          )}

          {loading ? (
            <p className="font-['Archivo'] text-sm text-[#888888]">Loading...</p>
          ) : !student ? (
            <p className="font-['Archivo'] text-sm text-[#888888]">Not found.</p>
          ) : (
            <>
              <DangerNotice>
                Editing here bypasses the 24-hour cooldown and the owner check. Every change is
                written to the audit log with a before/after diff.
              </DangerNotice>

              {student.claimedBy && (
                <div className="mb-4 rounded border border-[#1e1e1e] bg-[#111111] p-3">
                  <div className={adminLabel}>Claimed by</div>
                  <Link
                    to={`/u/${student.claimedBy.handle}`}
                    className="font-['Archivo'] text-sm text-[#4ade80]"
                  >
                    {student.claimedBy.name} (/u/{student.claimedBy.handle})
                  </Link>
                  <div className="mt-0.5 font-['JetBrains_Mono'] text-[10px] text-[#666666]">
                    {student.claimedBy.email} · {formatRelativeTime(student.claimedAt)}
                  </div>
                </div>
              )}

              <div className="mb-4 grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className={adminLabel}>Name</label>
                  <input
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className={`${adminInput} w-full`}
                  />
                </div>
                <div>
                  <label className={adminLabel}>Branch</label>
                  <input
                    value={form.branch}
                    onChange={(e) => setForm({ ...form, branch: e.target.value })}
                    className={`${adminInput} w-full`}
                  />
                </div>
                <div>
                  <label className={adminLabel}>Year</label>
                  <input
                    value={form.year}
                    onChange={(e) => setForm({ ...form, year: e.target.value })}
                    className={`${adminInput} w-full`}
                  />
                </div>
              </div>

              <div className={adminLabel}>Platform handles</div>
              <p className="mb-2 font-['Archivo'] text-[11px] text-[#666666]">
                Clearing a handle also clears its stats and zeroes that platform&apos;s score,
                since the numbers belong to the old account.
              </p>
              <div className="mb-4 flex flex-col gap-2">
                {LEADERBOARD_PLATFORMS.map((key) => (
                  <div key={key} className="flex items-center gap-2">
                    <PlatformGlyph platform={key} className="h-3.5 w-3.5 shrink-0" />
                    <span className="w-24 shrink-0 font-['JetBrains_Mono'] text-[11px] text-[#888888]">
                      {PLATFORM_LABELS[key]}
                    </span>
                    <input
                      value={form[key] ?? ""}
                      onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                      placeholder="not set"
                      className={`${adminInput} flex-1`}
                    />
                    <span className="w-12 shrink-0 text-right font-['JetBrains_Mono'] text-[10px] text-[#666666]">
                      {student.scores?.[key] ?? 0}
                    </span>
                  </div>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <AdminButton onClick={save} variant="primary" busy={busy}>
                  <Save className="h-3 w-3" /> Save
                </AdminButton>
                <AdminButton onClick={refresh} busy={busy} title="Fetch stats now instead of waiting for cron">
                  <RefreshCw className="h-3 w-3" /> Refresh stats
                </AdminButton>
                <Link
                  to={`/student/${rollno}`}
                  className="ml-auto inline-flex items-center gap-1 font-['JetBrains_Mono'] text-[11px] text-[#888888] transition-colors hover:text-white"
                >
                  <ExternalLink className="h-3 w-3" /> Public profile
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export function AdminStudents() {
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounced(search);
  const [claimed, setClaimed] = useState("");
  const [page, setPage] = useState(1);

  const [rows, setRows] = useState<AdminStudentRow[]>([]);
  const [pagination, setPagination] = useState({ page: 1, pages: 0, total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetchAdminStudents({
        q: debouncedSearch || undefined,
        claimed: claimed || undefined,
        page,
        limit: 25,
      });
      setRows(res.students);
      setPagination(res.pagination);
    } catch (err: any) {
      setError(err.message || "Could not load students");
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, claimed, page]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [debouncedSearch, claimed]);

  async function remove(rollno: string) {
    try {
      await deleteAdminStudent(rollno);
      await load();
    } catch (err: any) {
      setError(err.message || "Could not delete");
    }
  }

  return (
    <AdminPanel
      title="Students"
      description="Leaderboard records. Editing here overrides the cooldown and ownership rules."
      actions={(
        <>
          <SearchBox value={search} onChange={setSearch} placeholder="Roll number or name" />
          <select
            value={claimed}
            onChange={(e) => setClaimed(e.target.value)}
            className={adminInput}
          >
            <option value="">All records</option>
            <option value="true">Claimed</option>
            <option value="false">Unclaimed</option>
          </select>
        </>
      )}
    >
      {error && <ErrorBanner message={error} />}

      <DataTable
        loading={loading}
        rows={rows}
        rowKey={(row) => row.rollno}
        empty="No students match those filters"
        columns={[
          {
            header: "Student",
            cell: (row) => (
              <button onClick={() => setEditing(row.rollno)} className="text-left">
                <span className="text-white transition-colors hover:text-[#4ade80]">{row.name}</span>
                <span className="ml-1.5 font-['JetBrains_Mono'] text-[10px] text-[#666666]">
                  {row.rollno}
                </span>
              </button>
            ),
          },
          {
            header: "Branch",
            cell: (row) => <span className="text-[#888888]">{row.branch} · Y{row.year}</span>,
          },
          {
            header: "Score",
            align: "right",
            cell: (row) => (
              <span className="font-['JetBrains_Mono'] text-[#4ade80]">{row.scores?.total ?? 0}</span>
            ),
          },
          {
            header: "Ownership",
            cell: (row) => (row.claimedBy ? (
              <Link to={`/u/${row.claimedBy.handle}`}>
                <Pill tone="good">{row.claimedBy.handle}</Pill>
              </Link>
            ) : (
              <Pill tone="warn">unclaimed</Pill>
            )),
          },
          {
            header: "Updated",
            cell: (row) => (
              <span className="text-[#666666]">{formatRelativeTime(row.updatedAt)}</span>
            ),
          },
          {
            header: "",
            align: "right",
            cell: (row) => (
              <div className="flex justify-end gap-1">
                <ConfirmButton
                  onConfirm={() => remove(row.rollno)}
                  confirmLabel="Delete?"
                  title="Delete this record and its snapshots"
                >
                  Delete
                </ConfirmButton>
              </div>
            ),
          },
        ]}
      />

      <Pager
        page={pagination.page}
        pages={pagination.pages}
        total={pagination.total}
        onPage={setPage}
      />

      {editing && (
        <StudentEditor rollno={editing} onClose={() => setEditing(null)} onSaved={load} />
      )}
    </AdminPanel>
  );
}
