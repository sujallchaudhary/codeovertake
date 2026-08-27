import { useCallback, useEffect, useRef, useState } from "react";
import {
  FileText, Link2, Loader2, Pin, Plus, Search, Trash2, X,
} from "lucide-react";
import {
  createNote, deleteNote, fetchNotes, searchProblems, updateNote,
  type Note, type Problem,
} from "../api";
import {
  DifficultyBadge, EmptyState, ErrorBanner, PageHeader, PlatformGlyph, RequireAuth,
  Spinner, Tag, formatRelativeTime,
} from "./TrackerUI";

type Scope = "all" | "general" | "linked";

const inputClass =
  "w-full rounded border border-[#1e1e1e] bg-[#0a0a0a] px-3 py-2 font-['Archivo'] text-sm text-white "
  + "placeholder:text-[#555555] focus:border-[#4ade80] focus:outline-none";

/**
 * Picker for the "Question Linked" field.
 *
 * Attaching several questions to one note is what makes the note appear on all
 * of them, so this is the key control in the editor.
 */
function LinkedQuestionPicker({
  linked, onChange,
}: {
  linked: Problem[];
  onChange: (next: Problem[]) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Problem[]>([]);
  const [searching, setSearching] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const value = query.trim();
    if (value.length < 2) { setResults([]); return; }
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setSearching(true);
      searchProblems({ q: value, limit: 8 })
        .then((res) => setResults(res.problems))
        .catch(() => setResults([]))
        .finally(() => setSearching(false));
    }, 400);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [query]);

  const linkedIds = new Set(linked.map((p) => p._id));

  return (
    <div>
      <label className="mb-1.5 block font-['JetBrains_Mono'] text-[10px] uppercase tracking-widest text-[#666666]">
        Questions linked
      </label>

      {linked.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {linked.map((problem) => (
            <Tag key={problem._id} onRemove={() => onChange(linked.filter((p) => p._id !== problem._id))}>
              {problem.title}
            </Tag>
          ))}
        </div>
      )}

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#555555]" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search a question to link, or paste its URL"
          className={`${inputClass} pl-9`}
        />
      </div>

      {searching && (
        <p className="mt-1.5 flex items-center gap-1 font-['Archivo'] text-xs text-[#888888]">
          <Loader2 className="h-3 w-3 animate-spin" /> Searching...
        </p>
      )}

      {results.length > 0 && (
        <div className="mt-1.5 max-h-40 overflow-y-auto rounded border border-[#1e1e1e] bg-[#0a0a0a]">
          {results.map((problem) => (
            <button
              key={problem._id}
              disabled={linkedIds.has(problem._id)}
              onClick={() => { onChange([...linked, problem]); setQuery(""); setResults([]); }}
              className="flex w-full items-center gap-2 px-2.5 py-2 text-left transition-colors hover:bg-[#161616] disabled:opacity-40"
            >
              <PlatformGlyph platform={problem.platform} />
              <span className="min-w-0 flex-1 truncate font-['Archivo'] text-xs text-white">
                {problem.title}
              </span>
              <DifficultyBadge difficulty={problem.difficulty} />
            </button>
          ))}
        </div>
      )}

      <p className="mt-1.5 font-['Archivo'] text-xs text-[#666666]">
        Link several questions and this note appears in the Notes tab of every one of them.
        Leave empty to keep it as a standalone note.
      </p>
    </div>
  );
}

function NoteEditor({
  note, onClose, onSaved,
}: {
  note: Note | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(note?.title || "");
  const [content, setContent] = useState(note?.content || "");
  const [tagsText, setTagsText] = useState((note?.tags || []).join(", "));
  const [linked, setLinked] = useState<Problem[]>(
    // Populated notes come back with full problem objects
    Array.isArray(note?.linkedProblems) && typeof note?.linkedProblems[0] === "object"
      ? (note!.linkedProblems as Problem[])
      : []
  );
  const [pinned, setPinned] = useState(Boolean(note?.pinned));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    setSaving(true);
    setError("");
    const payload = {
      title: title.trim(),
      content,
      tags: tagsText.split(",").map((t) => t.trim()).filter(Boolean),
      linkedProblems: linked.map((p) => p._id),
      pinned,
    };
    try {
      if (note) await updateNote(note._id, payload);
      else await createNote(payload);
      onSaved();
      onClose();
    } catch (err: any) {
      setError(err.message || "Could not save the note");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto bg-black/70 p-4 sm:items-center">
      <div className="w-full max-w-2xl rounded border border-[#1e1e1e] bg-[#111111] p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-['JetBrains_Mono'] text-base text-white">
            {note ? "Edit note" : "New note"}
          </h2>
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
              placeholder="Sliding window template"
              className={inputClass}
            />
          </div>

          <div>
            <label className="mb-1.5 block font-['JetBrains_Mono'] text-[10px] uppercase tracking-widest text-[#666666]">
              Content
            </label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={12}
              placeholder={"Markdown. Fenced code blocks keep their formatting:\n```py\nl = 0\nfor r in range(n):\n    ...\n```"}
              className="w-full resize-y rounded border border-[#1e1e1e] bg-[#0a0a0a] px-3 py-2 font-['JetBrains_Mono'] text-xs leading-relaxed text-white placeholder:text-[#555555] focus:border-[#4ade80] focus:outline-none"
            />
          </div>

          <LinkedQuestionPicker linked={linked} onChange={setLinked} />

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block font-['JetBrains_Mono'] text-[10px] uppercase tracking-widest text-[#666666]">
                Tags
              </label>
              <input
                value={tagsText}
                onChange={(e) => setTagsText(e.target.value)}
                placeholder="patterns, revision"
                className={inputClass}
              />
            </div>
            <div className="flex items-end">
              <button
                onClick={() => setPinned((v) => !v)}
                className={`flex items-center gap-1.5 rounded border px-3 py-2 font-['JetBrains_Mono'] text-xs transition-colors ${
                  pinned
                    ? "border-transparent bg-[#f59e0b]/15 text-[#f59e0b]"
                    : "border-[#1e1e1e] text-[#888888] hover:text-white"
                }`}
              >
                <Pin className={`h-3 w-3 ${pinned ? "fill-current" : ""}`} />
                {pinned ? "Pinned" : "Pin to top"}
              </button>
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
            onClick={save}
            disabled={!title.trim() || saving}
            className="flex items-center gap-2 rounded bg-[#4ade80] px-4 py-2 font-['JetBrains_Mono'] text-xs text-black transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            {saving && <Loader2 className="h-3 w-3 animate-spin" />}
            Save note
          </button>
        </div>
      </div>
    </div>
  );
}

function NotesInner() {
  const [scope, setScope] = useState<Scope>("all");
  const [query, setQuery] = useState("");
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<Note | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetchNotes({
        q: query || undefined,
        general: scope === "general" ? "true" : undefined,
        limit: 100,
      });
      // "linked" has no server flag; it is simply the complement of general
      setNotes(scope === "linked" ? res.notes.filter((n) => !n.isGeneral) : res.notes);
    } catch (err: any) {
      setError(err.message || "Could not load your notes");
    } finally {
      setLoading(false);
    }
  }, [query, scope]);

  useEffect(() => {
    const timer = setTimeout(load, query ? 400 : 0);
    return () => clearTimeout(timer);
  }, [load, query]);

  async function remove(id: string) {
    try {
      await deleteNote(id);
      setNotes((current) => current.filter((n) => n._id !== id));
    } catch (err: any) {
      setError(err.message || "Could not delete the note");
    }
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <PageHeader
        title="My Notes"
        subtitle="Write a concept once and link it to every question that uses it."
        actions={(
          <button
            onClick={() => setCreating(true)}
            className="flex items-center gap-1.5 rounded bg-[#4ade80] px-3 py-2 font-['JetBrains_Mono'] text-xs text-black transition-opacity hover:opacity-90"
          >
            <Plus className="h-3.5 w-3.5" />
            New note
          </button>
        )}
      />

      {error && <ErrorBanner message={error} />}

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#555555]" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search titles and content"
            className="w-full rounded border border-[#1e1e1e] bg-[#111111] py-1.5 pl-9 pr-3 font-['Archivo'] text-xs text-white placeholder:text-[#555555] focus:border-[#4ade80] focus:outline-none"
          />
        </div>
        <div className="flex gap-1 rounded bg-[#111111] p-1">
          {([
            { key: "all" as Scope, label: "All" },
            { key: "linked" as Scope, label: "Linked to questions" },
            { key: "general" as Scope, label: "Standalone" },
          ]).map((entry) => (
            <button
              key={entry.key}
              onClick={() => setScope(entry.key)}
              className={`rounded px-2.5 py-1 font-['JetBrains_Mono'] text-[11px] transition-colors ${
                scope === entry.key ? "bg-[#1e1e1e] text-white" : "text-[#888888] hover:text-white"
              }`}
            >
              {entry.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <Spinner label="Loading notes..." />
      ) : notes.length === 0 ? (
        <EmptyState
          icon={<FileText className="h-8 w-8" strokeWidth={1.5} />}
          title={query ? "No notes match that search" : "No notes yet"}
          description={query
            ? "Try a different search term."
            : "Notes are where your understanding lives. Write a pattern once, link it to every question that uses it, and it will be waiting for you at revision time."}
          action={!query && (
            <button
              onClick={() => setCreating(true)}
              className="rounded bg-[#4ade80] px-4 py-2 font-['JetBrains_Mono'] text-sm text-black transition-opacity hover:opacity-90"
            >
              Write your first note
            </button>
          )}
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {notes.map((note) => {
            const links = (note.linkedProblems || []) as Problem[];
            return (
              <div
                key={note._id}
                className="flex flex-col rounded border border-[#1e1e1e] bg-[#111111] p-4 transition-colors hover:border-[#333333]"
              >
                <div className="mb-2 flex items-start justify-between gap-2">
                  <h3 className="font-['Archivo'] text-sm leading-snug text-white">
                    {note.pinned && <Pin className="mr-1 inline h-3 w-3 fill-current text-[#f59e0b]" />}
                    {note.title}
                  </h3>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <button
                      onClick={() => setEditing(note)}
                      className="font-['JetBrains_Mono'] text-[10px] text-[#888888] transition-colors hover:text-white"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => remove(note._id)}
                      className="text-[#666666] transition-colors hover:text-[#ff4444]"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </div>

                {note.content && (
                  <pre className="mb-3 max-h-32 overflow-hidden whitespace-pre-wrap font-['JetBrains_Mono'] text-[11px] leading-relaxed text-[#999999]">
                    {note.content.slice(0, 260)}
                  </pre>
                )}

                <div className="mt-auto">
                  {links.length > 0 ? (
                    <div className="mb-2 flex flex-wrap gap-1">
                      {links.slice(0, 3).map((problem) => (
                        <a
                          key={problem._id}
                          href={problem.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 rounded bg-[#1a1a1a] px-1.5 py-0.5 font-['Archivo'] text-[10px] text-[#aaaaaa] transition-colors hover:text-white"
                        >
                          <PlatformGlyph platform={problem.platform} className="h-2.5 w-2.5" />
                          {problem.title.slice(0, 22)}
                        </a>
                      ))}
                      {links.length > 3 && (
                        <span className="font-['JetBrains_Mono'] text-[10px] text-[#666666]">
                          +{links.length - 3}
                        </span>
                      )}
                    </div>
                  ) : (
                    <span className="mb-2 inline-block rounded bg-[#1a1a1a] px-1.5 py-0.5 font-['JetBrains_Mono'] text-[10px] text-[#888888]">
                      standalone
                    </span>
                  )}

                  <div className="flex items-center justify-between font-['JetBrains_Mono'] text-[10px] text-[#666666]">
                    {links.length > 0 && (
                      <span className="flex items-center gap-1">
                        <Link2 className="h-3 w-3" /> {links.length} linked
                      </span>
                    )}
                    <span className="ml-auto">{formatRelativeTime(note.updatedAt)}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {(creating || editing) && (
        <NoteEditor
          note={editing}
          onClose={() => { setCreating(false); setEditing(null); }}
          onSaved={load}
        />
      )}
    </div>
  );
}

export function Notes() {
  return (
    <RequireAuth feature="Notes">
      <NotesInner />
    </RequireAuth>
  );
}
