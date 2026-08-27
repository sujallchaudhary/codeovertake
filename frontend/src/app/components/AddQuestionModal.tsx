import { useEffect, useRef, useState } from "react";
import { Link2, Loader2, Search, X } from "lucide-react";
import { resolveProblemUrl, searchProblems, type Problem } from "../api";
import { DifficultyBadge, ErrorBanner, PlatformBadge, PlatformGlyph } from "./TrackerUI";

type Tab = "url" | "search";

/**
 * The "+" add-question flow, shared by My Workspace and the sheet editor.
 *
 * Two ways in, matching Codolio:
 *   - paste a problem URL and we fetch the title/difficulty/topics for you
 *   - search by name across the catalog (topped up live from LeetCode)
 *
 * The parent decides what "adding" means via `onSubmit`, so the same modal
 * serves both "add to workspace" and "add to this sheet".
 */
export function AddQuestionModal({
  open,
  onClose,
  onSubmit,
  title = "Add a question",
  submitLabel = "Add to workspace",
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (payload: { url?: string; problemId?: string }) => Promise<void>;
  title?: string;
  submitLabel?: string;
}) {
  const [tab, setTab] = useState<Tab>("url");
  const [url, setUrl] = useState("");
  const [preview, setPreview] = useState<Problem | null>(null);
  const [resolving, setResolving] = useState(false);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Problem[]>([]);
  const [searching, setSearching] = useState(false);
  const [picked, setPicked] = useState<Problem | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset everything each time the modal is opened
  useEffect(() => {
    if (!open) return;
    setTab("url");
    setUrl("");
    setPreview(null);
    setQuery("");
    setResults([]);
    setPicked(null);
    setError("");
  }, [open]);

  // Debounced URL resolution so the preview card appears as you paste
  useEffect(() => {
    if (tab !== "url") return;
    const value = url.trim();
    setPreview(null);
    if (value.length < 12) return;

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setResolving(true);
      setError("");
      resolveProblemUrl(value)
        .then(({ problem }) => setPreview(problem))
        .catch((err: any) => setError(err.message || "Could not read that link"))
        .finally(() => setResolving(false));
    }, 600);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [url, tab]);

  // Debounced name search
  useEffect(() => {
    if (tab !== "search") return;
    const value = query.trim();
    if (value.length < 2) {
      setResults([]);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setSearching(true);
      searchProblems({ q: value, limit: 12 })
        .then((res) => setResults(res.problems))
        .catch(() => setResults([]))
        .finally(() => setSearching(false));
    }, 400);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, tab]);

  if (!open) return null;

  const chosen = tab === "url" ? preview : picked;
  const canSubmit = tab === "url" ? Boolean(url.trim()) : Boolean(picked);

  async function handleSubmit() {
    setSubmitting(true);
    setError("");
    try {
      if (tab === "url") await onSubmit({ url: url.trim() });
      else if (picked) await onSubmit({ problemId: picked._id });
      onClose();
    } catch (err: any) {
      setError(err.message || "Could not add that question");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto bg-black/70 p-4 sm:items-center">
      <div className="w-full max-w-xl rounded border border-[#1e1e1e] bg-[#111111] p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-['JetBrains_Mono'] text-base text-white">{title}</h2>
          <button onClick={onClose} className="text-[#666666] transition-colors hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="mb-4 flex gap-1 rounded bg-[#0a0a0a] p-1">
          {([
            { key: "url" as Tab, label: "Paste URL", icon: <Link2 className="h-3.5 w-3.5" /> },
            { key: "search" as Tab, label: "Search by name", icon: <Search className="h-3.5 w-3.5" /> },
          ]).map((entry) => (
            <button
              key={entry.key}
              onClick={() => setTab(entry.key)}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded px-3 py-1.5 font-['JetBrains_Mono'] text-xs transition-colors ${
                tab === entry.key ? "bg-[#1e1e1e] text-white" : "text-[#888888] hover:text-white"
              }`}
            >
              {entry.icon}
              {entry.label}
            </button>
          ))}
        </div>

        {error && <ErrorBanner message={error} />}

        {tab === "url" ? (
          <div>
            <input
              autoFocus
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://leetcode.com/problems/two-sum/"
              className="w-full rounded border border-[#1e1e1e] bg-[#0a0a0a] px-3 py-2 font-['Archivo'] text-sm text-white placeholder:text-[#555555] focus:border-[#4ade80] focus:outline-none"
            />
            <p className="mt-2 font-['Archivo'] text-xs text-[#666666]">
              Works with LeetCode, Codeforces, CodeChef, GeeksforGeeks, AtCoder, HackerRank,
              InterviewBit, Code360 and more. Difficulty and topics are fetched automatically.
            </p>
          </div>
        ) : (
          <div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#555555]" />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Two Sum"
                className="w-full rounded border border-[#1e1e1e] bg-[#0a0a0a] pl-9 pr-3 py-2 font-['Archivo'] text-sm text-white placeholder:text-[#555555] focus:border-[#4ade80] focus:outline-none"
              />
            </div>

            <div className="mt-2 max-h-64 overflow-y-auto">
              {searching && (
                <div className="flex items-center gap-2 px-1 py-3 font-['Archivo'] text-xs text-[#888888]">
                  <Loader2 className="h-3 w-3 animate-spin" /> Searching...
                </div>
              )}
              {!searching && query.trim().length >= 2 && results.length === 0 && (
                <p className="px-1 py-3 font-['Archivo'] text-xs text-[#666666]">No problems found.</p>
              )}
              {results.map((problem) => (
                <button
                  key={problem._id}
                  onClick={() => setPicked(problem)}
                  className={`flex w-full items-center gap-2 rounded px-2 py-2 text-left transition-colors ${
                    picked?._id === problem._id ? "bg-[#4ade80]/10" : "hover:bg-[#1a1a1a]"
                  }`}
                >
                  <PlatformGlyph platform={problem.platform} />
                  <span className="min-w-0 flex-1 truncate font-['Archivo'] text-sm text-white">
                    {problem.title}
                  </span>
                  <DifficultyBadge difficulty={problem.difficulty} />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Preview of what will be added */}
        {(resolving || chosen) && (
          <div className="mt-4 rounded border border-[#1e1e1e] bg-[#0a0a0a] p-3">
            {resolving ? (
              <div className="flex items-center gap-2 font-['Archivo'] text-xs text-[#888888]">
                <Loader2 className="h-3 w-3 animate-spin" /> Reading problem details...
              </div>
            ) : chosen && (
              <>
                <div className="flex items-center gap-2">
                  <PlatformGlyph platform={chosen.platform} />
                  <span className="min-w-0 flex-1 truncate font-['Archivo'] text-sm text-white">
                    {chosen.title}
                  </span>
                  <DifficultyBadge difficulty={chosen.difficulty} />
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <PlatformBadge platform={chosen.platform} />
                  {(chosen.topics || []).slice(0, 5).map((topic) => (
                    <span
                      key={topic}
                      className="rounded bg-[#1a1a1a] px-1.5 py-0.5 font-['Archivo'] text-[11px] text-[#aaaaaa]"
                    >
                      {topic}
                    </span>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded border border-[#1e1e1e] px-3 py-2 font-['JetBrains_Mono'] text-xs text-[#888888] transition-colors hover:text-white"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit || submitting || resolving}
            className="flex items-center gap-2 rounded bg-[#4ade80] px-4 py-2 font-['JetBrains_Mono'] text-xs text-black transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {submitting && <Loader2 className="h-3 w-3 animate-spin" />}
            {submitLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
