import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router";
import {
  BookOpen, Loader2, Lock, Plus, Search, Users, X,
} from "lucide-react";
import { createSheet, fetchSheets, type SheetSummary } from "../api";
import { useAuth } from "../AuthContext";
import {
  EmptyState, ErrorBanner, PageHeader, ProgressBar, Spinner,
} from "./TrackerUI";

type Scope = "explore" | "mine" | "followed";

const CATEGORY_LABELS: Record<string, string> = {
  all: "All",
  popular: "Popular",
  mastery: "Mastery",
  cp: "Competitive",
  "quick-revision": "Quick Revision",
  company: "Company",
  custom: "Custom",
};

const CATEGORY_ORDER = ["all", "popular", "mastery", "cp", "quick-revision", "company", "custom"];

function CreateSheetModal({ onClose, onCreated }: { onClose: () => void; onCreated: (slug: string) => void }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState("private");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    setSaving(true);
    setError("");
    try {
      const res = await createSheet({ title: title.trim(), description, visibility });
      onCreated(res.sheet.slug);
    } catch (err: any) {
      setError(err.message || "Could not create the sheet");
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded border border-[#1e1e1e] bg-[#111111] p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-['JetBrains_Mono'] text-base text-white">Create a sheet</h2>
          <button onClick={onClose} className="text-[#666666] transition-colors hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>

        {error && <ErrorBanner message={error} />}

        <div className="flex flex-col gap-4">
          <div>
            <label className="mb-1.5 block font-['JetBrains_Mono'] text-[10px] uppercase tracking-widest text-[#666666]">
              Title
            </label>
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="My Weak Areas"
              className="w-full rounded border border-[#1e1e1e] bg-[#0a0a0a] px-3 py-2 font-['Archivo'] text-sm text-white placeholder:text-[#555555] focus:border-[#4ade80] focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1.5 block font-['JetBrains_Mono'] text-[10px] uppercase tracking-widest text-[#666666]">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="What is this list for?"
              className="w-full resize-y rounded border border-[#1e1e1e] bg-[#0a0a0a] px-3 py-2 font-['Archivo'] text-sm text-white placeholder:text-[#555555] focus:border-[#4ade80] focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1.5 block font-['JetBrains_Mono'] text-[10px] uppercase tracking-widest text-[#666666]">
              Visibility
            </label>
            <div className="flex gap-2">
              {[
                { key: "private", label: "Private", hint: "Only you and collaborators" },
                { key: "public", label: "Public", hint: "Anyone can view and follow" },
              ].map((option) => (
                <button
                  key={option.key}
                  onClick={() => setVisibility(option.key)}
                  className={`flex-1 rounded border px-3 py-2 text-left transition-colors ${
                    visibility === option.key
                      ? "border-[#4ade80]/50 bg-[#4ade80]/5"
                      : "border-[#1e1e1e] hover:border-[#333333]"
                  }`}
                >
                  <div className="font-['JetBrains_Mono'] text-xs text-white">{option.label}</div>
                  <div className="font-['Archivo'] text-[10px] text-[#666666]">{option.hint}</div>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded border border-[#1e1e1e] px-3 py-2 font-['JetBrains_Mono'] text-xs text-[#888888] transition-colors hover:text-white"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={!title.trim() || saving}
            className="flex items-center gap-2 rounded bg-[#4ade80] px-4 py-2 font-['JetBrains_Mono'] text-xs text-black transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            {saving && <Loader2 className="h-3 w-3 animate-spin" />}
            Create sheet
          </button>
        </div>
      </div>
    </div>
  );
}

function SheetCard({ sheet }: { sheet: SheetSummary }) {
  const progress = sheet.progress;

  return (
    <Link
      to={`/sheets/${sheet.slug}`}
      className="flex flex-col rounded border border-[#1e1e1e] bg-[#111111] p-4 transition-colors hover:border-[#4ade80]/40"
    >
      <div className="mb-2 flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded bg-[#4ade80]/10 font-['JetBrains_Mono'] text-[11px] text-[#4ade80]">
          {sheet.icon || sheet.title.slice(0, 2).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-['Archivo'] text-sm text-white">{sheet.title}</h3>
          <div className="mt-0.5 flex items-center gap-1.5 font-['JetBrains_Mono'] text-[10px] text-[#666666]">
            {sheet.isCurated ? (
              <span className="text-[#4ade80]">{sheet.curator || "Curated"}</span>
            ) : (
              <span>{sheet.owner?.name || "You"}</span>
            )}
            {sheet.visibility === "private" && (
              <>
                <span>·</span>
                <Lock className="h-2.5 w-2.5" />
              </>
            )}
          </div>
        </div>
      </div>

      <p className="mb-3 line-clamp-2 font-['Archivo'] text-xs leading-relaxed text-[#888888]">
        {sheet.description}
      </p>

      <div className="mt-auto">
        {progress && progress.total > 0 && (
          <div className="mb-2">
            <div className="mb-1 flex items-center justify-between font-['JetBrains_Mono'] text-[10px] text-[#888888]">
              <span>{progress.solved} / {progress.total}</span>
              <span>{progress.percent}%</span>
            </div>
            <ProgressBar value={progress.solved} max={progress.total} className="h-1" />
          </div>
        )}

        <div className="flex items-center gap-3 font-['JetBrains_Mono'] text-[10px] text-[#666666]">
          <span>{sheet.questionCount} questions</span>
          {sheet.followerCount > 0 && (
            <span className="flex items-center gap-1">
              <Users className="h-2.5 w-2.5" />
              {sheet.followerCount}
            </span>
          )}
          {sheet.isFollowing && <span className="ml-auto text-[#4ade80]">Following</span>}
          {sheet.isOwner && <span className="ml-auto text-[#f59e0b]">Owner</span>}
        </div>
      </div>
    </Link>
  );
}

export function Sheets() {
  const [params, setParams] = useSearchParams();
  const { isAuthenticated } = useAuth();

  const scope = (params.get("scope") as Scope) || "explore";
  const category = params.get("category") || "all";
  const query = params.get("q") || "";

  const [searchInput, setSearchInput] = useState(query);
  const [sheets, setSheets] = useState<SheetSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);

  const setParam = useCallback((key: string, value: string | null) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  }, [params, setParams]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchInput !== query) setParam("q", searchInput || null);
    }, 400);
    return () => clearTimeout(timer);
  }, [searchInput, query, setParam]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetchSheets({
        scope,
        category: category === "all" ? undefined : category,
        q: query || undefined,
        limit: 48,
      });
      setSheets(res.sheets);
    } catch (err: any) {
      setError(err.message || "Could not load sheets");
      setSheets([]);
    } finally {
      setLoading(false);
    }
  }, [scope, category, query]);

  useEffect(() => { load(); }, [load]);

  const scopes: Array<{ key: Scope; label: string; requiresAuth: boolean }> = [
    { key: "explore", label: "Explore", requiresAuth: false },
    { key: "mine", label: "My Sheets", requiresAuth: true },
    { key: "followed", label: "Following", requiresAuth: true },
  ];

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <PageHeader
        title="Sheets"
        subtitle="Follow a curated roadmap, or build and share your own list."
        actions={isAuthenticated && (
          <button
            onClick={() => setCreating(true)}
            className="flex items-center gap-1.5 rounded bg-[#4ade80] px-3 py-2 font-['JetBrains_Mono'] text-xs text-black transition-opacity hover:opacity-90"
          >
            <Plus className="h-3.5 w-3.5" />
            Create sheet
          </button>
        )}
      />

      {error && <ErrorBanner message={error} />}

      {/* Scope tabs */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex gap-1 rounded bg-[#111111] p-1">
          {scopes.map((entry) => {
            const disabled = entry.requiresAuth && !isAuthenticated;
            return (
              <button
                key={entry.key}
                onClick={() => !disabled && setParam("scope", entry.key === "explore" ? null : entry.key)}
                disabled={disabled}
                title={disabled ? "Sign in to use this" : undefined}
                className={`rounded px-3 py-1.5 font-['JetBrains_Mono'] text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                  scope === entry.key ? "bg-[#1e1e1e] text-white" : "text-[#888888] hover:text-white"
                }`}
              >
                {entry.label}
              </button>
            );
          })}
        </div>

        <div className="relative min-w-[180px] flex-1">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#555555]" />
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search sheets"
            className="w-full rounded border border-[#1e1e1e] bg-[#111111] py-1.5 pl-9 pr-3 font-['Archivo'] text-xs text-white placeholder:text-[#555555] focus:border-[#4ade80] focus:outline-none"
          />
        </div>
      </div>

      {/* Category filter */}
      <div className="mb-6 flex flex-wrap gap-1.5">
        {CATEGORY_ORDER.map((key) => (
          <button
            key={key}
            onClick={() => setParam("category", key === "all" ? null : key)}
            className={`rounded px-2.5 py-1 font-['JetBrains_Mono'] text-[11px] transition-colors ${
              category === key
                ? "bg-[#4ade80]/15 text-[#4ade80]"
                : "bg-[#111111] text-[#888888] hover:text-white"
            }`}
          >
            {CATEGORY_LABELS[key]}
          </button>
        ))}
      </div>

      {loading ? (
        <Spinner label="Loading sheets..." />
      ) : sheets.length === 0 ? (
        <EmptyState
          icon={<BookOpen className="h-8 w-8" strokeWidth={1.5} />}
          title={
            scope === "mine" ? "You have not created a sheet yet"
              : scope === "followed" ? "You are not following any sheets"
                : "No sheets match those filters"
          }
          description={
            scope === "mine"
              ? "Custom sheets are perfect for a personal to-do list, a college club syllabus, or tracking your weak areas."
              : scope === "followed"
                ? "Follow a sheet from Explore to start tracking your progress through it."
                : "Try a different category or search term."
          }
          action={scope === "mine" && isAuthenticated ? (
            <button
              onClick={() => setCreating(true)}
              className="rounded bg-[#4ade80] px-4 py-2 font-['JetBrains_Mono'] text-sm text-black transition-opacity hover:opacity-90"
            >
              Create your first sheet
            </button>
          ) : scope === "followed" ? (
            <button
              onClick={() => setParam("scope", null)}
              className="rounded border border-[#1e1e1e] px-4 py-2 font-['JetBrains_Mono'] text-sm text-white transition-colors hover:border-[#4ade80]"
            >
              Explore sheets
            </button>
          ) : undefined}
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {sheets.map((sheet) => <SheetCard key={sheet.id} sheet={sheet} />)}
        </div>
      )}

      {creating && (
        <CreateSheetModal
          onClose={() => setCreating(false)}
          onCreated={(slug) => { window.location.href = `/sheets/${slug}`; }}
        />
      )}
    </div>
  );
}
