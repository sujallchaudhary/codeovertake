import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router";
import { ExternalLink, RefreshCw } from "lucide-react";
import {
  deleteAdminContest, deleteAdminProblem, deleteAdminSheet, fetchAdminContests,
  fetchAdminProblems, fetchAdminSheets, refreshAdminProblem, setAdminSheetCurated,
  updateAdminProblem,
} from "../../api";
import {
  DifficultyBadge, ErrorBanner, PLATFORM_LABELS, PlatformGlyph, formatRelativeTime,
} from "../TrackerUI";
import {
  AdminButton, AdminPanel, ConfirmButton, DataTable, Pager, Pill, SearchBox,
  adminInput, useDebounced,
} from "./AdminUI";

type Tab = "problems" | "sheets" | "contests";

const SHEET_CATEGORIES = ["popular", "mastery", "cp", "quick-revision", "company", "custom"];

/* ---------------------------------------------------------------- problems */

function ProblemsTab() {
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounced(search);
  const [platform, setPlatform] = useState("");
  const [partialOnly, setPartialOnly] = useState(false);
  const [page, setPage] = useState(1);

  const [rows, setRows] = useState<any[]>([]);
  const [pagination, setPagination] = useState({ page: 1, pages: 0, total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ title: string; difficulty: string; topics: string }>({
    title: "", difficulty: "unrated", topics: "",
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetchAdminProblems({
        q: debouncedSearch || undefined,
        platform: platform || undefined,
        partial: partialOnly ? "true" : undefined,
        page,
        limit: 25,
      });
      setRows(res.problems);
      setPagination(res.pagination);
    } catch (err: any) {
      setError(err.message || "Could not load problems");
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, platform, partialOnly, page]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [debouncedSearch, platform, partialOnly]);

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
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <SearchBox value={search} onChange={setSearch} placeholder="Problem title" />
        <select value={platform} onChange={(e) => setPlatform(e.target.value)} className={adminInput}>
          <option value="">All platforms</option>
          {Object.entries(PLATFORM_LABELS).map(([key, label]) => (
            <option key={key} value={key}>{label}</option>
          ))}
        </select>
        <button
          onClick={() => setPartialOnly((v) => !v)}
          className={`rounded border px-2.5 py-1.5 font-['JetBrains_Mono'] text-[11px] transition-colors ${
            partialOnly
              ? "border-[#f59e0b]/50 bg-[#f59e0b]/10 text-[#f59e0b]"
              : "border-[#1e1e1e] text-[#888888] hover:text-white"
          }`}
          title="Rows whose metadata could not be fetched properly"
        >
          Needs attention
        </button>
      </div>

      {error && <ErrorBanner message={error} />}

      <DataTable
        loading={loading}
        rows={rows}
        rowKey={(row: any) => row._id}
        empty="No problems match those filters"
        columns={[
          {
            header: "Problem",
            cell: (row: any) => (editing === row._id ? (
              <input
                value={draft.title}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                className={`${adminInput} w-full`}
              />
            ) : (
              <div className="flex items-center gap-2">
                <PlatformGlyph platform={row.platform} className="h-3.5 w-3.5 shrink-0" />
                <a
                  href={row.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-white transition-colors hover:text-[#4ade80]"
                >
                  {row.title}
                </a>
                {row.metadataPartial && <Pill tone="warn">partial</Pill>}
              </div>
            )),
          },
          {
            header: "Difficulty",
            cell: (row: any) => (editing === row._id ? (
              <select
                value={draft.difficulty}
                onChange={(e) => setDraft({ ...draft, difficulty: e.target.value })}
                className={adminInput}
              >
                {["easy", "medium", "hard", "unrated"].map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            ) : <DifficultyBadge difficulty={row.difficulty} />),
          },
          {
            header: "Topics",
            cell: (row: any) => (editing === row._id ? (
              <input
                value={draft.topics}
                onChange={(e) => setDraft({ ...draft, topics: e.target.value })}
                placeholder="comma separated"
                className={`${adminInput} w-full`}
              />
            ) : (
              <span className="text-[#888888]">
                {(row.topics || []).slice(0, 3).join(", ") || "—"}
              </span>
            )),
          },
          {
            header: "Companies",
            align: "right",
            cell: (row: any) => (
              <span className="font-['JetBrains_Mono'] text-[10px] text-[#666666]">
                {(row.companies || []).length}
              </span>
            ),
          },
          {
            header: "",
            align: "right",
            cell: (row: any) => (editing === row._id ? (
              <div className="flex justify-end gap-1">
                <AdminButton
                  variant="primary"
                  onClick={() => act(async () => {
                    await updateAdminProblem(row._id, {
                      title: draft.title,
                      difficulty: draft.difficulty,
                      topics: draft.topics.split(",").map((t) => t.trim()).filter(Boolean),
                    });
                    setEditing(null);
                  })}
                >
                  Save
                </AdminButton>
                <AdminButton onClick={() => setEditing(null)}>Cancel</AdminButton>
              </div>
            ) : (
              <div className="flex justify-end gap-1">
                <AdminButton
                  onClick={() => {
                    setEditing(row._id);
                    setDraft({
                      title: row.title,
                      difficulty: row.difficulty,
                      topics: (row.topics || []).join(", "),
                    });
                  }}
                >
                  Edit
                </AdminButton>
                <AdminButton
                  onClick={() => act(() => refreshAdminProblem(row._id))}
                  title="Re-fetch metadata from the platform"
                >
                  <RefreshCw className="h-3 w-3" />
                </AdminButton>
                <ConfirmButton
                  confirmLabel="Delete?"
                  onConfirm={() => act(() => deleteAdminProblem(row._id))}
                  title="Refused while any workspace, sheet or note references it"
                >
                  Delete
                </ConfirmButton>
              </div>
            )),
          },
        ]}
      />

      <Pager page={pagination.page} pages={pagination.pages} total={pagination.total} onPage={setPage} />
    </div>
  );
}

/* ------------------------------------------------------------------ sheets */

function SheetsTab() {
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounced(search);
  const [visibility, setVisibility] = useState("");
  const [page, setPage] = useState(1);

  const [rows, setRows] = useState<any[]>([]);
  const [pagination, setPagination] = useState({ page: 1, pages: 0, total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetchAdminSheets({
        q: debouncedSearch || undefined,
        visibility: visibility || undefined,
        page,
        limit: 25,
      });
      setRows(res.sheets);
      setPagination(res.pagination);
    } catch (err: any) {
      setError(err.message || "Could not load sheets");
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, visibility, page]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [debouncedSearch, visibility]);

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
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <SearchBox value={search} onChange={setSearch} placeholder="Sheet title" />
        <select value={visibility} onChange={(e) => setVisibility(e.target.value)} className={adminInput}>
          <option value="">All visibility</option>
          <option value="public">Public</option>
          <option value="private">Private</option>
        </select>
      </div>

      {error && <ErrorBanner message={error} />}
      <p className="mb-3 font-['Archivo'] text-[11px] text-[#666666]">
        This list includes private sheets, which the public explore page hides. Curating a sheet
        forces it public and makes it read-only for its owner.
      </p>

      <DataTable
        loading={loading}
        rows={rows}
        rowKey={(row: any) => row._id}
        empty="No sheets match those filters"
        columns={[
          {
            header: "Sheet",
            cell: (row: any) => (
              <Link to={`/sheets/${row.slug}`} className="text-white transition-colors hover:text-[#4ade80]">
                {row.title}
                <span className="ml-1.5 font-['JetBrains_Mono'] text-[10px] text-[#666666]">
                  {row.questionCount}q
                </span>
              </Link>
            ),
          },
          {
            header: "Owner",
            cell: (row: any) => (row.isCurated
              ? <Pill tone="good">{row.curator || "curated"}</Pill>
              : row.owner
                ? <Link to={`/u/${row.owner.handle}`} className="text-[#888888]">{row.owner.handle}</Link>
                : <span className="text-[#555555]">—</span>),
          },
          { header: "Category", cell: (row: any) => <Pill>{row.category}</Pill> },
          {
            header: "Visibility",
            cell: (row: any) => (row.visibility === "public"
              ? <Pill tone="info">public</Pill>
              : <Pill tone="warn">private</Pill>),
          },
          {
            header: "Followers",
            align: "right",
            cell: (row: any) => (
              <span className="font-['JetBrains_Mono'] text-[10px] text-[#666666]">
                {row.followerCount || 0}
              </span>
            ),
          },
          {
            header: "",
            align: "right",
            cell: (row: any) => (
              <div className="flex flex-wrap justify-end gap-1">
                {row.isCurated ? (
                  <ConfirmButton
                    danger={false}
                    confirmLabel="Uncurate?"
                    onConfirm={() => act(() => setAdminSheetCurated(row.slug, false))}
                  >
                    Uncurate
                  </ConfirmButton>
                ) : (
                  <select
                    defaultValue=""
                    onChange={(e) => {
                      if (e.target.value) act(() => setAdminSheetCurated(row.slug, true, e.target.value));
                    }}
                    className={`${adminInput} py-1 text-[10px]`}
                    title="Promote into the curated library"
                  >
                    <option value="">Curate as…</option>
                    {SHEET_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                )}
                <ConfirmButton
                  confirmLabel="Delete?"
                  onConfirm={() => act(() => deleteAdminSheet(row.slug))}
                >
                  Delete
                </ConfirmButton>
              </div>
            ),
          },
        ]}
      />

      <Pager page={pagination.page} pages={pagination.pages} total={pagination.total} onPage={setPage} />
    </div>
  );
}

/* ---------------------------------------------------------------- contests */

function ContestsTab() {
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<any[]>([]);
  const [pagination, setPagination] = useState({ page: 1, pages: 0, total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetchAdminContests({ status: status || undefined, page, limit: 50 });
      setRows(res.contests);
      setPagination(res.pagination);
    } catch (err: any) {
      setError(err.message || "Could not load contests");
    } finally {
      setLoading(false);
    }
  }, [status, page]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [status]);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <select value={status} onChange={(e) => setStatus(e.target.value)} className={adminInput}>
          <option value="">All contests</option>
          <option value="upcoming">Upcoming</option>
          <option value="finished">Finished</option>
        </select>
        <span className="font-['Archivo'] text-[11px] text-[#666666]">
          Use Jobs → Sync contests to pull fresh schedules.
        </span>
      </div>

      {error && <ErrorBanner message={error} />}

      <DataTable
        loading={loading}
        rows={rows}
        rowKey={(row: any) => row._id}
        empty="No contests stored yet"
        columns={[
          {
            header: "Contest",
            cell: (row: any) => (
              <div className="flex items-center gap-2">
                <PlatformGlyph platform={row.platform} className="h-3.5 w-3.5 shrink-0" />
                <a
                  href={row.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-white transition-colors hover:text-[#4ade80]"
                >
                  {row.name}
                  <ExternalLink className="h-2.5 w-2.5" />
                </a>
              </div>
            ),
          },
          {
            header: "Starts",
            cell: (row: any) => (
              <span className="text-[#888888]">{new Date(row.startTime).toLocaleString()}</span>
            ),
          },
          {
            header: "Status",
            cell: (row: any) => {
              const now = Date.now();
              const start = new Date(row.startTime).getTime();
              const end = new Date(row.endTime).getTime();
              if (now < start) return <Pill tone="info">upcoming</Pill>;
              if (now <= end) return <Pill tone="good">live</Pill>;
              return <Pill>finished</Pill>;
            },
          },
          {
            header: "",
            align: "right",
            cell: (row: any) => (
              <ConfirmButton
                confirmLabel="Delete?"
                onConfirm={async () => {
                  try {
                    await deleteAdminContest(row._id);
                    await load();
                  } catch (err: any) {
                    setError(err.message || "Could not delete");
                  }
                }}
              >
                Delete
              </ConfirmButton>
            ),
          },
        ]}
      />

      <Pager page={pagination.page} pages={pagination.pages} total={pagination.total} onPage={setPage} />
    </div>
  );
}

/* ------------------------------------------------------------------- shell */

export function AdminContent() {
  const [tab, setTab] = useState<Tab>("problems");

  const tabs: Array<{ key: Tab; label: string }> = [
    { key: "problems", label: "Problems" },
    { key: "sheets", label: "Sheets" },
    { key: "contests", label: "Contests" },
  ];

  return (
    <AdminPanel title="Content" description="The shared catalog, sheet library and contest schedule.">
      <div className="mb-4 flex gap-1 rounded bg-[#111111] p-1">
        {tabs.map((entry) => (
          <button
            key={entry.key}
            onClick={() => setTab(entry.key)}
            className={`rounded px-3 py-1.5 font-['JetBrains_Mono'] text-[11px] transition-colors ${
              tab === entry.key ? "bg-[#1e1e1e] text-white" : "text-[#888888] hover:text-white"
            }`}
          >
            {entry.label}
          </button>
        ))}
      </div>

      {tab === "problems" && <ProblemsTab />}
      {tab === "sheets" && <SheetsTab />}
      {tab === "contests" && <ContestsTab />}
    </AdminPanel>
  );
}
