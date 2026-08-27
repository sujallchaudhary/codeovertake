import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router";
import { Clock } from "lucide-react";
import { fetchAdminClaims, reassignAdminClaim } from "../../api";
import { ErrorBanner, formatRelativeTime } from "../TrackerUI";
import {
  AdminButton, AdminPanel, ConfirmButton, DangerNotice, DataTable, Pager, Pill,
  SearchBox, adminInput, useDebounced,
} from "./AdminUI";

/** Inline reassign control: type the new owner's handle, or release outright. */
function ReassignCell({
  rollno, onDone, onError,
}: { rollno: string; onDone: () => void; onError: (m: string) => void }) {
  const [open, setOpen] = useState(false);
  const [handle, setHandle] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    try {
      await reassignAdminClaim(rollno, handle.trim() || undefined);
      setOpen(false);
      setHandle("");
      onDone();
    } catch (err: any) {
      onError(err.message || "Could not reassign");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <div className="flex justify-end gap-1">
        <AdminButton onClick={() => setOpen(true)}>Reassign</AdminButton>
        <ConfirmButton
          confirmLabel="Release?"
          title="Release the claim so the profile can be claimed again"
          onConfirm={async () => {
            try {
              await reassignAdminClaim(rollno);
              onDone();
            } catch (err: any) {
              onError(err.message || "Could not release");
            }
          }}
        >
          Release
        </ConfirmButton>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-end gap-1">
      <input
        autoFocus
        value={handle}
        onChange={(e) => setHandle(e.target.value.toLowerCase())}
        placeholder="new owner handle"
        onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
        className={`${adminInput} w-36`}
      />
      <AdminButton onClick={submit} variant="primary" busy={busy} disabled={!handle.trim()}>
        Assign
      </AdminButton>
      <AdminButton onClick={() => setOpen(false)}>Cancel</AdminButton>
    </div>
  );
}

export function AdminClaims() {
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounced(search);
  const [page, setPage] = useState(1);

  const [claims, setClaims] = useState<any[]>([]);
  const [pending, setPending] = useState<any[]>([]);
  const [pagination, setPagination] = useState({ page: 1, pages: 0, total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetchAdminClaims({ q: debouncedSearch || undefined, page, limit: 25 });
      setClaims(res.claims);
      setPending(res.pending);
      setPagination(res.pagination);
    } catch (err: any) {
      setError(err.message || "Could not load claims");
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, page]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [debouncedSearch]);

  return (
    <AdminPanel
      title="Profile claims"
      description="Who owns which leaderboard profile."
      actions={<SearchBox value={search} onChange={setSearch} placeholder="Roll number or name" />}
    >
      {error && <ErrorBanner message={error} />}

      <DangerNotice>
        Reassign only when someone has proved their identity out of band. Self-service claiming
        already requires verifying a platform handle on the record, so a manual reassignment
        bypasses that check — and is recorded in the audit log.
      </DangerNotice>

      {/* In-flight claims: useful for spotting someone stuck on verification */}
      {pending.length > 0 && (
        <div className="mb-4 rounded border border-[#f59e0b]/25 bg-[#f59e0b]/5 p-3">
          <div className="mb-2 flex items-center gap-1.5 font-['JetBrains_Mono'] text-[10px] uppercase tracking-widest text-[#f59e0b]">
            <Clock className="h-3 w-3" /> Verification in progress ({pending.length})
          </div>
          <div className="flex flex-col gap-1">
            {pending.map((item) => (
              <div key={item.rollno} className="flex items-center gap-2 font-['Archivo'] text-xs">
                <span className="font-['JetBrains_Mono'] text-white">{item.rollno}</span>
                <span className="text-[#888888]">{item.name}</span>
                <Pill tone="warn">{item.pendingClaim?.platform}</Pill>
                <span className="ml-auto font-['JetBrains_Mono'] text-[10px] text-[#666666]">
                  {item.pendingClaim?.user?.handle
                    ? `by ${item.pendingClaim.user.handle}`
                    : "unknown"}
                  {" · "}
                  {item.pendingClaim?.attempts || 0} attempt(s)
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <DataTable
        loading={loading}
        rows={claims}
        rowKey={(row: any) => row.rollno}
        empty="No profiles have been claimed yet"
        columns={[
          {
            header: "Profile",
            cell: (row: any) => (
              <Link
                to={`/student/${row.rollno}`}
                className="text-white transition-colors hover:text-[#4ade80]"
              >
                {row.rollno}
                <span className="ml-1.5 font-['Archivo'] text-[11px] text-[#888888]">{row.name}</span>
              </Link>
            ),
          },
          {
            header: "Owner",
            cell: (row: any) => (row.claimedBy ? (
              <div>
                <Link to={`/u/${row.claimedBy.handle}`} className="text-[#4ade80]">
                  /u/{row.claimedBy.handle}
                </Link>
                <div className="font-['JetBrains_Mono'] text-[10px] text-[#666666]">
                  {row.claimedBy.email}
                </div>
              </div>
            ) : <span className="text-[#555555]">—</span>),
          },
          {
            header: "Claimed",
            cell: (row: any) => (
              <span className="text-[#666666]">{formatRelativeTime(row.claimedAt)}</span>
            ),
          },
          {
            header: "",
            align: "right",
            cell: (row: any) => (
              <ReassignCell rollno={row.rollno} onDone={load} onError={setError} />
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
    </AdminPanel>
  );
}
