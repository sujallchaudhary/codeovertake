import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router";
import {
  deleteAdminUser, fetchAdminUsers, setAdminUserRole, setAdminUserSuspended,
  type AdminUserRow,
} from "../../api";
import { useAuth } from "../../AuthContext";
import { ErrorBanner, formatRelativeTime } from "../TrackerUI";
import {
  AdminPanel, ConfirmButton, DangerNotice, DataTable, Pager, Pill, SearchBox,
  adminInput, useDebounced,
} from "./AdminUI";

export function AdminUsers() {
  const { user: me } = useAuth();

  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounced(search);
  const [filter, setFilter] = useState("");
  const [page, setPage] = useState(1);

  const [rows, setRows] = useState<AdminUserRow[]>([]);
  const [pagination, setPagination] = useState({ page: 1, pages: 0, total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetchAdminUsers({
        q: debouncedSearch || undefined,
        admin: filter === "admin" ? "true" : undefined,
        suspended: filter === "suspended" ? "true" : undefined,
        page,
        limit: 25,
      });
      setRows(res.users);
      setPagination(res.pagination);
    } catch (err: any) {
      setError(err.message || "Could not load accounts");
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, filter, page]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [debouncedSearch, filter]);

  /** Wraps an action so its error surfaces instead of vanishing. */
  async function act(fn: () => Promise<unknown>) {
    setError("");
    try {
      await fn();
      await load();
    } catch (err: any) {
      setError(err.message || "That action failed");
    }
  }

  return (
    <AdminPanel
      title="Accounts"
      description="Clerk owns credentials; this manages roles, suspension and local data."
      actions={(
        <>
          <SearchBox value={search} onChange={setSearch} placeholder="Handle, name, email or roll no" />
          <select value={filter} onChange={(e) => setFilter(e.target.value)} className={adminInput}>
            <option value="">All accounts</option>
            <option value="admin">Admins</option>
            <option value="suspended">Suspended</option>
          </select>
        </>
      )}
    >
      {error && <ErrorBanner message={error} />}

      <DangerNotice>
        Suspending blocks sign-in but keeps the account&apos;s data, which is usually what you
        want. Deleting removes the local record and its workspace, but not the Clerk account —
        delete that from the Clerk dashboard too if the person asked for erasure.
      </DangerNotice>

      <DataTable
        loading={loading}
        rows={rows}
        rowKey={(row) => row._id}
        empty="No accounts match those filters"
        columns={[
          {
            header: "Account",
            cell: (row) => (
              <div>
                <Link
                  to={`/u/${row.handle}`}
                  className="text-white transition-colors hover:text-[#4ade80]"
                >
                  {row.name}
                </Link>
                <div className="font-['JetBrains_Mono'] text-[10px] text-[#666666]">
                  /u/{row.handle} · {row.email}
                </div>
              </div>
            ),
          },
          {
            header: "Roll no",
            cell: (row) => (row.rollno
              ? <Pill tone="good">{row.rollno}</Pill>
              : <span className="text-[#555555]">—</span>),
          },
          {
            header: "C-Score",
            align: "right",
            cell: (row) => (
              <span className="font-['JetBrains_Mono'] text-[#4ade80]">{row.cScore?.total ?? 0}</span>
            ),
          },
          {
            header: "Status",
            cell: (row) => (
              <div className="flex flex-wrap gap-1">
                {row.isAdmin && <Pill tone="info">admin</Pill>}
                {row.suspended && <Pill tone="bad">suspended</Pill>}
                {!row.isAdmin && !row.suspended && <Pill>active</Pill>}
              </div>
            ),
          },
          {
            header: "Joined",
            cell: (row) => (
              <span className="text-[#666666]">{formatRelativeTime(row.createdAt)}</span>
            ),
          },
          {
            header: "",
            align: "right",
            cell: (row) => {
              const isSelf = me?.handle === row.handle;
              return (
                <div className="flex flex-wrap justify-end gap-1">
                  <ConfirmButton
                    danger={row.isAdmin}
                    confirmLabel={row.isAdmin ? "Demote?" : "Promote?"}
                    disabled={isSelf}
                    title={isSelf ? "You cannot change your own role" : undefined}
                    onConfirm={() => act(() => setAdminUserRole(row.handle, !row.isAdmin))}
                  >
                    {row.isAdmin ? "Demote" : "Make admin"}
                  </ConfirmButton>

                  <ConfirmButton
                    confirmLabel={row.suspended ? "Restore?" : "Suspend?"}
                    disabled={isSelf || row.isAdmin}
                    title={row.isAdmin ? "Demote before suspending" : undefined}
                    onConfirm={() => act(() => setAdminUserSuspended(
                      row.handle, !row.suspended, "Suspended from the admin panel",
                    ))}
                  >
                    {row.suspended ? "Unsuspend" : "Suspend"}
                  </ConfirmButton>

                  <ConfirmButton
                    confirmLabel="Delete?"
                    disabled={isSelf || row.isAdmin}
                    onConfirm={() => act(() => deleteAdminUser(row.handle))}
                  >
                    Delete
                  </ConfirmButton>
                </div>
              );
            },
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
