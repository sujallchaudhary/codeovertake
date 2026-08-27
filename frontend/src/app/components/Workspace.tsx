import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router";
import {
  Brain, CheckCircle2, Circle, Filter, ListChecks, Plus, Search, Star, X,
} from "lucide-react";
import {
  addToWorkspace, fetchWorkspace, fetchWorkspaceStats, fetchWorkspaceTags, setQuestionStatus,
  updateWorkspaceQuestion, type TrackedQuestion, type WorkspaceStats,
} from "../api";
import {
  DifficultyBadge, EmptyState, ErrorBanner, PLATFORM_LABELS, PageHeader, PlatformGlyph,
  ProgressBar, RequireAuth, Spinner, StatCard, Tag, retentionColor,
} from "./TrackerUI";
import { AddQuestionModal } from "./AddQuestionModal";
import { QuestionDetail } from "./QuestionDetail";

const PAGE_SIZE = 25;

const selectClass =
  "rounded border border-[#1e1e1e] bg-[#111111] px-2.5 py-1.5 font-['Archivo'] text-xs text-white "
  + "focus:border-[#4ade80] focus:outline-none";

function WorkspaceInner() {
  const [params, setParams] = useSearchParams();

  const status = params.get("status") || "";
  const difficulty = params.get("difficulty") || "";
  const platform = params.get("platform") || "";
  const tag = params.get("tag") || "";
  const starred = params.get("starred") === "true";
  const search = params.get("search") || "";
  const sortBy = params.get("sortBy") || "added";

  const [searchInput, setSearchInput] = useState(search);
  const [questions, setQuestions] = useState<TrackedQuestion[]>([]);
  const [stats, setStats] = useState<WorkspaceStats | null>(null);
  const [tags, setTags] = useState<Array<{ name: string; count: number }>>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);

  // Drops stale responses when filters change quickly
  const fetchIdRef = useRef(0);

  /** Writes one filter into the URL so the view is shareable and back-navigable. */
  const setParam = useCallback((key: string, value: string | null) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
    setPage(1);
  }, [params, setParams]);

  // Debounce the search box into the URL
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchInput !== search) setParam("search", searchInput || null);
    }, 400);
    return () => clearTimeout(timer);
  }, [searchInput, search, setParam]);

  const loadQuestions = useCallback(async (targetPage: number, append: boolean) => {
    const fetchId = ++fetchIdRef.current;
    setLoading(true);
    setError("");
    try {
      const res = await fetchWorkspace({
        status: status || undefined,
        difficulty: difficulty || undefined,
        platform: platform || undefined,
        tag: tag || undefined,
        starred: starred ? "true" : undefined,
        search: search || undefined,
        sortBy,
        page: targetPage,
        limit: PAGE_SIZE,
      });
      if (fetchId !== fetchIdRef.current) return; // superseded
      setQuestions((current) => (append ? [...current, ...res.questions] : res.questions));
      setTotal(res.pagination.total);
      setPages(res.pagination.pages);
    } catch (err: any) {
      if (fetchId === fetchIdRef.current) setError(err.message || "Could not load your workspace");
    } finally {
      if (fetchId === fetchIdRef.current) setLoading(false);
    }
  }, [status, difficulty, platform, tag, starred, search, sortBy]);

  const loadMeta = useCallback(async () => {
    try {
      const [s, t] = await Promise.all([fetchWorkspaceStats(), fetchWorkspaceTags()]);
      setStats(s);
      setTags(t.tags);
    } catch {
      /* non-critical: the list still works without facets */
    }
  }, []);

  useEffect(() => { setPage(1); loadQuestions(1, false); }, [loadQuestions]);
  useEffect(() => { loadMeta(); }, [loadMeta]);

  async function toggleSolved(question: TrackedQuestion) {
    const next = question.status === "solved" ? "unsolved" : "solved";
    // Optimistic: the row flips immediately, then we reconcile
    setQuestions((current) => current.map(
      (q) => (q.id === question.id ? { ...q, status: next } as TrackedQuestion : q)
    ));
    try {
      const res = await setQuestionStatus(question.id, next);
      setQuestions((current) => current.map((q) => (q.id === question.id ? res.question : q)));
      loadMeta();
    } catch (err: any) {
      setError(err.message || "Could not update status");
      loadQuestions(1, false);
    }
  }

  async function toggleStar(question: TrackedQuestion) {
    setQuestions((current) => current.map(
      (q) => (q.id === question.id ? { ...q, starred: !q.starred } : q)
    ));
    try {
      await updateWorkspaceQuestion(question.id, { starred: !question.starred });
      loadMeta();
    } catch (err: any) {
      setError(err.message || "Could not update star");
      loadQuestions(1, false);
    }
  }

  const activeFilterCount = useMemo(
    () => [status, difficulty, platform, tag, starred ? "1" : ""].filter(Boolean).length,
    [status, difficulty, platform, tag, starred]
  );

  const solvedPercent = stats && stats.total > 0
    ? Math.round((stats.solved / stats.total) * 100)
    : 0;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <PageHeader
        title="My Workspace"
        subtitle="Every question you are tracking, in one place."
        actions={(
          <>
            <Link
              to="/revision"
              className="flex items-center gap-1.5 rounded border border-[#1e1e1e] px-3 py-2 font-['JetBrains_Mono'] text-xs text-white transition-colors hover:border-[#4ade80]"
            >
              <Brain className="h-3.5 w-3.5" />
              Revision
            </Link>
            <button
              onClick={() => setAddOpen(true)}
              className="flex items-center gap-1.5 rounded bg-[#4ade80] px-3 py-2 font-['JetBrains_Mono'] text-xs text-black transition-opacity hover:opacity-90"
            >
              <Plus className="h-3.5 w-3.5" />
              Add question
            </button>
          </>
        )}
      />

      {error && <ErrorBanner message={error} />}

      {/* Summary */}
      {stats && (
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="Tracked" value={stats.total} hint={`${stats.starred} starred`} />
          <StatCard label="Solved" value={stats.solved} hint={`${solvedPercent}% of tracked`} color="#4ade80" />
          <StatCard
            label="Retention"
            value={`${stats.retention.rating}%`}
            hint={stats.retention.label}
            color={retentionColor(stats.retention.rating)}
          />
          <StatCard
            label="Revision streak"
            value={stats.retention.streak}
            hint={`best ${stats.retention.longestStreak}`}
            color="#f59e0b"
          />
        </div>
      )}

      {/* Difficulty progress */}
      {stats && stats.total > 0 && (
        <div className="mb-6 grid gap-3 sm:grid-cols-3">
          {(["easy", "medium", "hard"] as const).map((level) => (
            <div key={level} className="rounded border border-[#1e1e1e] bg-[#111111] p-3">
              <div className="mb-1.5 flex items-center justify-between">
                <DifficultyBadge difficulty={level} />
                <span className="font-['JetBrains_Mono'] text-xs text-[#888888]">
                  {stats.difficultySolved[level] || 0} / {stats.difficulty[level] || 0}
                </span>
              </div>
              <ProgressBar
                value={stats.difficultySolved[level] || 0}
                max={stats.difficulty[level] || 0}
                color={level === "easy" ? "#4ade80" : level === "medium" ? "#f59e0b" : "#ff4444"}
              />
            </div>
          ))}
        </div>
      )}

      {/* Toolbar */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#555555]" />
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search your questions"
            className="w-full rounded border border-[#1e1e1e] bg-[#111111] py-1.5 pl-9 pr-3 font-['Archivo'] text-xs text-white placeholder:text-[#555555] focus:border-[#4ade80] focus:outline-none"
          />
        </div>

        <div className="flex gap-1 rounded bg-[#111111] p-1">
          {[
            { key: "", label: "All" },
            { key: "unsolved", label: "Unsolved" },
            { key: "solved", label: "Solved" },
          ].map((entry) => (
            <button
              key={entry.key || "all"}
              onClick={() => setParam("status", entry.key || null)}
              className={`rounded px-2.5 py-1 font-['JetBrains_Mono'] text-[11px] transition-colors ${
                status === entry.key ? "bg-[#1e1e1e] text-white" : "text-[#888888] hover:text-white"
              }`}
            >
              {entry.label}
            </button>
          ))}
        </div>

        <button
          onClick={() => setParam("starred", starred ? null : "true")}
          className={`flex items-center gap-1.5 rounded border px-2.5 py-1.5 font-['JetBrains_Mono'] text-[11px] transition-colors ${
            starred
              ? "border-transparent bg-[#f59e0b]/15 text-[#f59e0b]"
              : "border-[#1e1e1e] text-[#888888] hover:text-white"
          }`}
        >
          <Star className={`h-3 w-3 ${starred ? "fill-current" : ""}`} />
          Starred
        </button>

        <button
          onClick={() => setShowFilters((v) => !v)}
          className={`flex items-center gap-1.5 rounded border px-2.5 py-1.5 font-['JetBrains_Mono'] text-[11px] transition-colors ${
            activeFilterCount > 0
              ? "border-[#4ade80]/40 text-[#4ade80]"
              : "border-[#1e1e1e] text-[#888888] hover:text-white"
          }`}
        >
          <Filter className="h-3 w-3" />
          Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
        </button>
      </div>

      {showFilters && (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded border border-[#1e1e1e] bg-[#111111] p-3">
          <select
            value={difficulty}
            onChange={(e) => setParam("difficulty", e.target.value || null)}
            className={selectClass}
          >
            <option value="">All difficulties</option>
            <option value="easy">Easy</option>
            <option value="medium">Medium</option>
            <option value="hard">Hard</option>
            <option value="unrated">Unrated</option>
          </select>

          <select
            value={platform}
            onChange={(e) => setParam("platform", e.target.value || null)}
            className={selectClass}
          >
            <option value="">All platforms</option>
            {(stats?.platforms || []).map((p) => (
              <option key={p.platform} value={p.platform}>
                {PLATFORM_LABELS[p.platform] || p.platform} ({p.total})
              </option>
            ))}
          </select>

          <select
            value={sortBy}
            onChange={(e) => setParam("sortBy", e.target.value)}
            className={selectClass}
          >
            <option value="added">Recently added</option>
            <option value="title">Title</option>
            <option value="difficulty">Difficulty</option>
            <option value="due">Next review</option>
            <option value="solved">Recently solved</option>
          </select>

          {tags.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="font-['JetBrains_Mono'] text-[10px] uppercase tracking-widest text-[#666666]">
                Tags
              </span>
              {tags.slice(0, 12).map((t) => (
                <Tag
                  key={t.name}
                  active={tag === t.name}
                  onClick={() => setParam("tag", tag === t.name ? null : t.name)}
                >
                  {t.name} <span className="text-[#666666]">{t.count}</span>
                </Tag>
              ))}
            </div>
          )}

          {activeFilterCount > 0 && (
            <button
              onClick={() => setParams(new URLSearchParams(), { replace: true })}
              className="ml-auto flex items-center gap-1 font-['JetBrains_Mono'] text-[11px] text-[#888888] transition-colors hover:text-white"
            >
              <X className="h-3 w-3" /> Clear
            </button>
          )}
        </div>
      )}

      {/* List */}
      {loading && questions.length === 0 ? (
        <Spinner label="Loading your workspace..." />
      ) : questions.length === 0 ? (
        <EmptyState
          icon={<ListChecks className="h-8 w-8" strokeWidth={1.5} />}
          title={total === 0 && activeFilterCount === 0 && !search
            ? "Your workspace is empty"
            : "No questions match those filters"}
          description={total === 0 && activeFilterCount === 0 && !search
            ? "Add your first question by pasting a problem link, or follow a sheet to pull a whole curated list in at once."
            : "Try clearing a filter or widening your search."}
          action={(
            <div className="flex flex-wrap items-center justify-center gap-2">
              <button
                onClick={() => setAddOpen(true)}
                className="rounded bg-[#4ade80] px-4 py-2 font-['JetBrains_Mono'] text-sm text-black transition-opacity hover:opacity-90"
              >
                Add a question
              </button>
              <Link
                to="/sheets"
                className="rounded border border-[#1e1e1e] px-4 py-2 font-['JetBrains_Mono'] text-sm text-white transition-colors hover:border-[#4ade80]"
              >
                Browse sheets
              </Link>
            </div>
          )}
        />
      ) : (
        <>
          <div className="overflow-hidden rounded border border-[#1e1e1e] bg-[#111111]">
            {questions.map((question) => (
              <div
                key={question.id}
                className="flex items-center gap-3 border-b border-[#1a1a1a] px-3 py-2.5 transition-colors last:border-0 hover:bg-[#161616]"
              >
                <button
                  onClick={() => toggleSolved(question)}
                  title={question.status === "solved" ? "Mark unsolved" : "Mark solved"}
                  className="shrink-0"
                >
                  {question.status === "solved" ? (
                    <CheckCircle2 className="h-4 w-4 text-[#4ade80]" />
                  ) : (
                    <Circle className="h-4 w-4 text-[#444444] transition-colors hover:text-[#888888]" />
                  )}
                </button>

                <PlatformGlyph platform={question.problem.platform} />

                <button
                  onClick={() => setDetailId(question.id)}
                  className="min-w-0 flex-1 text-left"
                >
                  <span
                    className={`block truncate font-['Archivo'] text-sm transition-colors hover:text-[#4ade80] ${
                      question.status === "solved" ? "text-[#888888]" : "text-white"
                    }`}
                  >
                    {question.problem.title}
                  </span>
                  {question.tags.length > 0 && (
                    <span className="mt-0.5 flex flex-wrap gap-1">
                      {question.tags.slice(0, 3).map((t) => (
                        <span key={t} className="font-['Archivo'] text-[10px] text-[#666666]">#{t}</span>
                      ))}
                    </span>
                  )}
                </button>

                {question.status === "solved" && question.memoryScore > 0 && (
                  <span
                    title={`Retention ${question.memoryScore}%`}
                    className="hidden shrink-0 font-['JetBrains_Mono'] text-[10px] sm:block"
                    style={{ color: retentionColor(question.memoryScore) }}
                  >
                    {question.memoryScore}%
                  </span>
                )}

                <DifficultyBadge difficulty={question.problem.difficulty} />

                <button onClick={() => toggleStar(question)} className="shrink-0" title="Star">
                  <Star
                    className={`h-3.5 w-3.5 transition-colors ${
                      question.starred ? "fill-current text-[#f59e0b]" : "text-[#444444] hover:text-[#888888]"
                    }`}
                  />
                </button>
              </div>
            ))}
          </div>

          <div className="mt-4 flex items-center justify-between font-['JetBrains_Mono'] text-xs text-[#666666]">
            <span>Showing {questions.length} of {total}</span>
            {page < pages && (
              <button
                onClick={() => { const next = page + 1; setPage(next); loadQuestions(next, true); }}
                disabled={loading}
                className="rounded border border-[#1e1e1e] px-3 py-1.5 text-white transition-colors hover:border-[#4ade80] disabled:opacity-50"
              >
                {loading ? "Loading..." : "Load more"}
              </button>
            )}
          </div>
        </>
      )}

      <AddQuestionModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onSubmit={async (payload) => {
          await addToWorkspace(payload);
          await Promise.all([loadQuestions(1, false), loadMeta()]);
          setPage(1);
        }}
      />

      {detailId && (
        <QuestionDetail
          questionId={detailId}
          onClose={() => setDetailId(null)}
          onChanged={(updated) => {
            if (!updated) {
              setQuestions((current) => current.filter((q) => q.id !== detailId));
              setTotal((t) => Math.max(0, t - 1));
            } else {
              setQuestions((current) => current.map((q) => (q.id === updated.id ? updated : q)));
            }
            loadMeta();
          }}
        />
      )}
    </div>
  );
}

export function Workspace() {
  return (
    <RequireAuth feature="My Workspace">
      <WorkspaceInner />
    </RequireAuth>
  );
}
