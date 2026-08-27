import { useCallback, useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router";
import {
  Briefcase, CheckCircle2, Circle, ExternalLink, Flame, Search, Star,
} from "lucide-react";
import {
  addToWorkspace, fetchCompanies, fetchCompanyKit, setQuestionStatus,
  updateWorkspaceQuestion, type CompanySummary,
} from "../api";
import { useAuth } from "../AuthContext";
import {
  DifficultyBadge, EmptyState, ErrorBanner, PageHeader, PlatformGlyph, ProgressBar,
  Spinner,
} from "./TrackerUI";

/* ------------------------------------------------------------ company index */

export function Companies() {
  const [params, setParams] = useSearchParams();
  const query = params.get("q") || "";
  const [searchInput, setSearchInput] = useState(query);
  const [companies, setCompanies] = useState<CompanySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchInput === query) return;
      const next = new URLSearchParams(params);
      if (searchInput) next.set("q", searchInput);
      else next.delete("q");
      setParams(next, { replace: true });
    }, 400);
    return () => clearTimeout(timer);
  }, [searchInput, query, params, setParams]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetchCompanies({ q: query || undefined, limit: 120 });
      setCompanies(res.companies);
    } catch (err: any) {
      setError(err.message || "Could not load company kits");
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <PageHeader
        title="Company Kits"
        subtitle="Curated question banks for the companies you are targeting."
      />

      {error && <ErrorBanner message={error} />}

      <div className="relative mb-6 max-w-sm">
        <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#555555]" />
        <input
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Search companies"
          className="w-full rounded border border-[#1e1e1e] bg-[#111111] py-2 pl-9 pr-3 font-['Archivo'] text-sm text-white placeholder:text-[#555555] focus:border-[#4ade80] focus:outline-none"
        />
      </div>

      {loading ? (
        <Spinner label="Loading companies..." />
      ) : companies.length === 0 ? (
        <EmptyState
          icon={<Briefcase className="h-8 w-8" strokeWidth={1.5} />}
          title={query ? "No companies match that search" : "No company kits yet"}
          description={query
            ? "Try a different name."
            : "Company kits are built from problem company tags. Run the content seeder, or add GeeksforGeeks problems (their company tags are imported automatically)."}
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {companies.map((company) => (
            <Link
              key={company.slug}
              to={`/companies/${company.slug}`}
              className="rounded border border-[#1e1e1e] bg-[#111111] p-4 transition-colors hover:border-[#4ade80]/40"
            >
              <div className="mb-3 flex items-center gap-2.5">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded bg-[#4ade80]/10 font-['JetBrains_Mono'] text-sm text-[#4ade80]">
                  {company.name.slice(0, 1).toUpperCase()}
                </span>
                <div className="min-w-0">
                  <h3 className="truncate font-['Archivo'] text-sm text-white">{company.name}</h3>
                  <p className="font-['JetBrains_Mono'] text-[10px] text-[#666666]">
                    {company.total} questions
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3 font-['JetBrains_Mono'] text-[10px]">
                <span className="text-[#4ade80]">{company.difficulty.easy}E</span>
                <span className="text-[#f59e0b]">{company.difficulty.medium}M</span>
                <span className="text-[#ff4444]">{company.difficulty.hard}H</span>
                {company.recent45 > 0 && (
                  <span className="ml-auto flex items-center gap-1 text-[#fb923c]">
                    <Flame className="h-2.5 w-2.5" />
                    {company.recent45}
                  </span>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

/* --------------------------------------------------------------- kit detail */

export function CompanyKit() {
  const { slug = "" } = useParams();
  const [params, setParams] = useSearchParams();
  const { isAuthenticated } = useAuth();

  const bucket = params.get("bucket") || "all-time";
  const difficulty = params.get("difficulty") || "";

  const [data, setData] = useState<Awaited<ReturnType<typeof fetchCompanyKit>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const setParam = useCallback((key: string, value: string | null) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  }, [params, setParams]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setData(await fetchCompanyKit(slug, {
        bucket,
        difficulty: difficulty || undefined,
        limit: 100,
      }));
    } catch (err: any) {
      setError(err.message || "Could not load that kit");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [slug, bucket, difficulty]);

  useEffect(() => { load(); }, [load]);

  /**
   * Toggling from a kit needs the problem in the workspace first, so an unseen
   * problem is added (already-solved) in one step rather than two clicks.
   */
  async function toggleSolved(problem: {
    id: string; trackedQuestionId: string | null; status: string;
  }) {
    if (!isAuthenticated) return;
    try {
      if (!problem.trackedQuestionId) {
        await addToWorkspace({ problemId: problem.id, status: "solved" });
      } else {
        await setQuestionStatus(
          problem.trackedQuestionId,
          problem.status === "solved" ? "unsolved" : "solved"
        );
      }
      await load();
    } catch (err: any) {
      setError(err.message || "Could not update the question");
    }
  }

  async function toggleStar(problem: {
    id: string; trackedQuestionId: string | null; starred: boolean;
  }) {
    if (!isAuthenticated) return;
    try {
      if (!problem.trackedQuestionId) {
        await addToWorkspace({ problemId: problem.id, starred: true });
      } else {
        await updateWorkspaceQuestion(problem.trackedQuestionId, { starred: !problem.starred });
      }
      await load();
    } catch (err: any) {
      setError(err.message || "Could not update the star");
    }
  }

  if (loading && !data) return <Spinner label="Loading kit..." />;

  if (!data) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
        <EmptyState
          icon={<Briefcase className="h-8 w-8" strokeWidth={1.5} />}
          title="Kit not found"
          description={error}
          action={(
            <Link to="/companies" className="rounded bg-[#4ade80] px-4 py-2 font-['JetBrains_Mono'] text-sm text-black">
              All companies
            </Link>
          )}
        />
      </div>
    );
  }

  const solved = data.problems.filter((p) => p.status === "solved").length;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <Link
        to="/companies"
        className="mb-3 inline-block font-['JetBrains_Mono'] text-xs text-[#888888] transition-colors hover:text-white"
      >
        ← All companies
      </Link>

      <PageHeader
        title={data.company.name}
        subtitle={`${data.pagination.total} questions in this preparation mode.`}
      />

      {error && <ErrorBanner message={error} />}

      {/* Preparation modes */}
      <div className="mb-4 flex flex-wrap gap-1.5">
        {data.buckets.map((entry) => (
          <button
            key={entry.value}
            onClick={() => setParam("bucket", entry.value === "all-time" ? null : entry.value)}
            className={`rounded px-3 py-1.5 font-['JetBrains_Mono'] text-[11px] transition-colors ${
              bucket === entry.value
                ? "bg-[#4ade80]/15 text-[#4ade80]"
                : "bg-[#111111] text-[#888888] hover:text-white"
            }`}
          >
            {entry.label}
            <span className="ml-1.5 text-[#666666]">{entry.count}</span>
          </button>
        ))}

        <select
          value={difficulty}
          onChange={(e) => setParam("difficulty", e.target.value || null)}
          className="ml-auto rounded border border-[#1e1e1e] bg-[#111111] px-2.5 py-1.5 font-['Archivo'] text-xs text-white focus:border-[#4ade80] focus:outline-none"
        >
          <option value="">All difficulties</option>
          <option value="easy">Easy</option>
          <option value="medium">Medium</option>
          <option value="hard">Hard</option>
        </select>
      </div>

      {isAuthenticated && data.problems.length > 0 && (
        <div className="mb-4 rounded border border-[#1e1e1e] bg-[#111111] p-3">
          <div className="mb-1.5 flex items-center justify-between font-['JetBrains_Mono'] text-xs">
            <span className="text-[#666666]">Solved on this page</span>
            <span className="text-white">{solved} / {data.problems.length}</span>
          </div>
          <ProgressBar value={solved} max={data.problems.length} />
        </div>
      )}

      {data.problems.length === 0 ? (
        <EmptyState
          title="No questions in this mode"
          description="Try the All-Time tab, which includes everything we know about for this company."
        />
      ) : (
        <div className="overflow-hidden rounded border border-[#1e1e1e] bg-[#111111]">
          {data.problems.map((problem) => (
            <div
              key={problem.id}
              className="flex items-center gap-3 border-b border-[#1a1a1a] px-3 py-2.5 transition-colors last:border-0 hover:bg-[#161616]"
            >
              <button
                onClick={() => toggleSolved(problem)}
                disabled={!isAuthenticated}
                title={isAuthenticated ? "Toggle solved" : "Sign in to track"}
                className="shrink-0 disabled:cursor-not-allowed"
              >
                {problem.status === "solved" ? (
                  <CheckCircle2 className="h-4 w-4 text-[#4ade80]" />
                ) : (
                  <Circle className={`h-4 w-4 ${isAuthenticated ? "text-[#444444] hover:text-[#888888]" : "text-[#2a2a2a]"}`} />
                )}
              </button>

              <PlatformGlyph platform={problem.platform} />

              <a
                href={problem.url}
                target="_blank"
                rel="noopener noreferrer"
                className={`min-w-0 flex-1 truncate font-['Archivo'] text-sm transition-colors hover:text-[#4ade80] ${
                  problem.status === "solved" ? "text-[#888888]" : "text-white"
                }`}
              >
                {problem.title}
              </a>

              {problem.frequency > 1 && (
                <span
                  title="Appears in multiple recency windows"
                  className="hidden shrink-0 items-center gap-1 font-['JetBrains_Mono'] text-[10px] text-[#fb923c] sm:flex"
                >
                  <Flame className="h-2.5 w-2.5" />
                  {problem.frequency}
                </span>
              )}

              <DifficultyBadge difficulty={problem.difficulty} />

              <a
                href={problem.url}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0 text-[#555555] transition-colors hover:text-white"
              >
                <ExternalLink className="h-3 w-3" />
              </a>

              {isAuthenticated && (
                <button onClick={() => toggleStar(problem)} className="shrink-0" title="Star">
                  <Star
                    className={`h-3.5 w-3.5 transition-colors ${
                      problem.starred ? "fill-current text-[#f59e0b]" : "text-[#444444] hover:text-[#888888]"
                    }`}
                  />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {!isAuthenticated && (
        <p className="mt-4 text-center font-['Archivo'] text-sm text-[#888888]">
          <Link to="/login" className="text-[#4ade80]">Sign in</Link> to tick questions off and
          have them tracked in your workspace.
        </p>
      )}
    </div>
  );
}
