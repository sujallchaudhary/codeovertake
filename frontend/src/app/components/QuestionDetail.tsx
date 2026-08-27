import { useCallback, useEffect, useState } from "react";
import {
  ExternalLink, Link2, Loader2, Plus, Star, Trash2, X,
} from "lucide-react";
import {
  createNote, deleteNote, fetchWorkspaceQuestion, removeFromWorkspace, setQuestionStatus,
  updateNote, updateWorkspaceQuestion, type Note, type TrackedQuestion,
} from "../api";
import {
  DifficultyBadge, ErrorBanner, PlatformBadge, Spinner, Tag, formatRelativeTime,
  retentionColor,
} from "./TrackerUI";

/**
 * Slide-over panel for a single tracked question.
 *
 * Shows the problem metadata, the user's own state (status, star, tags), the
 * spaced-repetition schedule, and every note linked to this problem — including
 * notes written on *other* questions, which is the point of linked notes.
 */
export function QuestionDetail({
  questionId, onClose, onChanged,
}: {
  questionId: string;
  onClose: () => void;
  onChanged?: (question: TrackedQuestion | null) => void;
}) {
  const [question, setQuestion] = useState<TrackedQuestion | null>(null);
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tagInput, setTagInput] = useState("");
  const [saving, setSaving] = useState(false);

  const [noteDraft, setNoteDraft] = useState<{ id?: string; title: string; content: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetchWorkspaceQuestion(questionId);
      setQuestion(res.question);
      setNotes(res.notes);
    } catch (err: any) {
      setError(err.message || "Could not load that question");
    } finally {
      setLoading(false);
    }
  }, [questionId]);

  useEffect(() => { load(); }, [load]);

  async function patch(data: { starred?: boolean; tags?: string[] }) {
    if (!question) return;
    setSaving(true);
    try {
      const res = await updateWorkspaceQuestion(question.id, data);
      setQuestion(res.question);
      onChanged?.(res.question);
    } catch (err: any) {
      setError(err.message || "Could not save");
    } finally {
      setSaving(false);
    }
  }

  async function toggleStatus() {
    if (!question) return;
    setSaving(true);
    try {
      const next = question.status === "solved" ? "unsolved" : "solved";
      const res = await setQuestionStatus(question.id, next);
      setQuestion(res.question);
      onChanged?.(res.question);
    } catch (err: any) {
      setError(err.message || "Could not update status");
    } finally {
      setSaving(false);
    }
  }

  async function handleRemove() {
    if (!question) return;
    setSaving(true);
    try {
      await removeFromWorkspace(question.id);
      onChanged?.(null);
      onClose();
    } catch (err: any) {
      setError(err.message || "Could not remove");
      setSaving(false);
    }
  }

  async function saveNote() {
    if (!noteDraft || !question) return;
    setSaving(true);
    try {
      if (noteDraft.id) {
        await updateNote(noteDraft.id, { title: noteDraft.title, content: noteDraft.content });
      } else {
        await createNote({
          title: noteDraft.title,
          content: noteDraft.content,
          // Linking to this problem is what makes the note appear here
          linkedProblems: [question.problem._id],
        });
      }
      setNoteDraft(null);
      await load();
    } catch (err: any) {
      setError(err.message || "Could not save the note");
    } finally {
      setSaving(false);
    }
  }

  async function removeNote(id: string) {
    setSaving(true);
    try {
      await deleteNote(id);
      await load();
    } catch (err: any) {
      setError(err.message || "Could not delete the note");
    } finally {
      setSaving(false);
    }
  }

  function addTag() {
    const value = tagInput.trim();
    if (!value || !question) return;
    if (question.tags.includes(value)) { setTagInput(""); return; }
    patch({ tags: [...question.tags, value] });
    setTagInput("");
  }

  return (
    <div className="fixed inset-0 z-[65] flex justify-end bg-black/70" onClick={onClose}>
      <div
        className="h-full w-full max-w-lg overflow-y-auto border-l border-[#1e1e1e] bg-[#0f0f0f]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[#1e1e1e] bg-[#0f0f0f]/95 px-4 py-3 backdrop-blur-sm">
          <h2 className="font-['JetBrains_Mono'] text-sm text-white">Question</h2>
          <button onClick={onClose} className="text-[#666666] transition-colors hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-4 py-4">
          {error && <ErrorBanner message={error} />}

          {loading ? (
            <Spinner />
          ) : !question ? (
            <p className="font-['Archivo'] text-sm text-[#888888]">Question not found.</p>
          ) : (
            <>
              {/* Problem */}
              <div className="mb-4">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <PlatformBadge platform={question.problem.platform} />
                  <DifficultyBadge difficulty={question.problem.difficulty} />
                  {question.problem.isPremium && (
                    <span className="rounded bg-[#f59e0b]/15 px-1.5 py-0.5 font-['JetBrains_Mono'] text-[10px] text-[#f59e0b]">
                      Premium
                    </span>
                  )}
                </div>
                <h3 className="font-['Archivo'] text-lg leading-snug text-white">
                  {question.problem.title}
                </h3>
                <a
                  href={question.problem.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1.5 inline-flex items-center gap-1.5 font-['JetBrains_Mono'] text-xs text-[#4ade80] transition-opacity hover:opacity-80"
                >
                  <ExternalLink className="h-3 w-3" />
                  Open problem
                </a>
              </div>

              {/* Actions */}
              <div className="mb-4 flex flex-wrap items-center gap-2">
                <button
                  onClick={toggleStatus}
                  disabled={saving}
                  className={`rounded px-3 py-1.5 font-['JetBrains_Mono'] text-xs transition-colors disabled:opacity-50 ${
                    question.status === "solved"
                      ? "bg-[#4ade80]/15 text-[#4ade80]"
                      : "border border-[#1e1e1e] text-[#888888] hover:text-white"
                  }`}
                >
                  {question.status === "solved" ? "✓ Solved" : "Mark solved"}
                </button>
                <button
                  onClick={() => patch({ starred: !question.starred })}
                  disabled={saving}
                  className={`flex items-center gap-1.5 rounded px-3 py-1.5 font-['JetBrains_Mono'] text-xs transition-colors disabled:opacity-50 ${
                    question.starred
                      ? "bg-[#f59e0b]/15 text-[#f59e0b]"
                      : "border border-[#1e1e1e] text-[#888888] hover:text-white"
                  }`}
                >
                  <Star className={`h-3 w-3 ${question.starred ? "fill-current" : ""}`} />
                  {question.starred ? "Starred" : "Star"}
                </button>
                <button
                  onClick={handleRemove}
                  disabled={saving}
                  className="ml-auto flex items-center gap-1.5 rounded border border-[#1e1e1e] px-3 py-1.5 font-['JetBrains_Mono'] text-xs text-[#888888] transition-colors hover:border-[#ff4444]/50 hover:text-[#ff4444] disabled:opacity-50"
                >
                  <Trash2 className="h-3 w-3" />
                  Remove
                </button>
              </div>

              {/* Topics */}
              {question.problem.topics?.length > 0 && (
                <div className="mb-4">
                  <div className="mb-1.5 font-['JetBrains_Mono'] text-[10px] uppercase tracking-widest text-[#666666]">
                    Topics
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {question.problem.topics.map((topic) => <Tag key={topic}>{topic}</Tag>)}
                  </div>
                </div>
              )}

              {/* Custom tags */}
              <div className="mb-4">
                <div className="mb-1.5 font-['JetBrains_Mono'] text-[10px] uppercase tracking-widest text-[#666666]">
                  Your tags
                </div>
                <div className="mb-2 flex flex-wrap gap-1.5">
                  {question.tags.length === 0 && (
                    <span className="font-['Archivo'] text-xs text-[#555555]">
                      No tags yet. Try &quot;Tricky&quot; or &quot;Attempted&quot;.
                    </span>
                  )}
                  {question.tags.map((tag) => (
                    <Tag
                      key={tag}
                      onRemove={() => patch({ tags: question.tags.filter((t) => t !== tag) })}
                    >
                      {tag}
                    </Tag>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTag(); } }}
                    placeholder="Add a tag"
                    className="flex-1 rounded border border-[#1e1e1e] bg-[#0a0a0a] px-2.5 py-1.5 font-['Archivo'] text-xs text-white placeholder:text-[#555555] focus:border-[#4ade80] focus:outline-none"
                  />
                  <button
                    onClick={addTag}
                    className="rounded border border-[#1e1e1e] px-2.5 py-1.5 text-[#888888] transition-colors hover:text-white"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              {/* Revision state */}
              {question.status === "solved" && (
                <div className="mb-4 rounded border border-[#1e1e1e] bg-[#111111] p-3">
                  <div className="mb-2 font-['JetBrains_Mono'] text-[10px] uppercase tracking-widest text-[#666666]">
                    Revision
                  </div>
                  <div className="grid grid-cols-2 gap-3 font-['Archivo'] text-xs">
                    <div>
                      <span className="text-[#666666]">Retention</span>
                      <div
                        className="font-['JetBrains_Mono'] text-base"
                        style={{ color: retentionColor(question.memoryScore) }}
                      >
                        {question.memoryScore}%
                      </div>
                    </div>
                    <div>
                      <span className="text-[#666666]">Next review</span>
                      <div className="font-['JetBrains_Mono'] text-base text-white">
                        {question.revision.dueAt
                          ? new Date(question.revision.dueAt).toLocaleDateString()
                          : "—"}
                      </div>
                    </div>
                    <div>
                      <span className="text-[#666666]">Reviews done</span>
                      <div className="font-['JetBrains_Mono'] text-white">{question.revision.reviewCount}</div>
                    </div>
                    <div>
                      <span className="text-[#666666]">Last rated</span>
                      <div className="font-['JetBrains_Mono'] text-white">
                        {question.revision.lastRating || "not yet"}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Notes */}
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <div className="font-['JetBrains_Mono'] text-[10px] uppercase tracking-widest text-[#666666]">
                    Notes
                  </div>
                  {!noteDraft && (
                    <button
                      onClick={() => setNoteDraft({ title: "", content: "" })}
                      className="flex items-center gap-1 font-['JetBrains_Mono'] text-[11px] text-[#4ade80] transition-opacity hover:opacity-80"
                    >
                      <Plus className="h-3 w-3" /> Add note
                    </button>
                  )}
                </div>

                {noteDraft && (
                  <div className="mb-3 rounded border border-[#1e1e1e] bg-[#111111] p-3">
                    <input
                      autoFocus
                      value={noteDraft.title}
                      onChange={(e) => setNoteDraft({ ...noteDraft, title: e.target.value })}
                      placeholder="Note title, e.g. Sliding window template"
                      className="mb-2 w-full rounded border border-[#1e1e1e] bg-[#0a0a0a] px-2.5 py-1.5 font-['Archivo'] text-sm text-white placeholder:text-[#555555] focus:border-[#4ade80] focus:outline-none"
                    />
                    <textarea
                      value={noteDraft.content}
                      onChange={(e) => setNoteDraft({ ...noteDraft, content: e.target.value })}
                      rows={6}
                      placeholder={"Markdown supported. Fenced code blocks work:\n```py\ndef solve():\n    ...\n```"}
                      className="w-full resize-y rounded border border-[#1e1e1e] bg-[#0a0a0a] px-2.5 py-1.5 font-['JetBrains_Mono'] text-xs text-white placeholder:text-[#555555] focus:border-[#4ade80] focus:outline-none"
                    />
                    <div className="mt-2 flex justify-end gap-2">
                      <button
                        onClick={() => setNoteDraft(null)}
                        className="rounded px-2.5 py-1.5 font-['JetBrains_Mono'] text-xs text-[#888888] transition-colors hover:text-white"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={saveNote}
                        disabled={!noteDraft.title.trim() || saving}
                        className="flex items-center gap-1.5 rounded bg-[#4ade80] px-3 py-1.5 font-['JetBrains_Mono'] text-xs text-black transition-opacity hover:opacity-90 disabled:opacity-40"
                      >
                        {saving && <Loader2 className="h-3 w-3 animate-spin" />}
                        Save note
                      </button>
                    </div>
                  </div>
                )}

                {notes.length === 0 && !noteDraft && (
                  <p className="font-['Archivo'] text-xs text-[#555555]">
                    No notes on this question yet. A note linked to several questions shows up on
                    all of them.
                  </p>
                )}

                <div className="flex flex-col gap-2">
                  {notes.map((note) => {
                    const linkCount = (note.linkedProblems || []).length;
                    return (
                      <div key={note._id} className="rounded border border-[#1e1e1e] bg-[#111111] p-3">
                        <div className="mb-1 flex items-start justify-between gap-2">
                          <h4 className="font-['Archivo'] text-sm text-white">{note.title}</h4>
                          <div className="flex shrink-0 items-center gap-1.5">
                            <button
                              onClick={() => setNoteDraft({
                                id: note._id, title: note.title, content: note.content,
                              })}
                              className="font-['JetBrains_Mono'] text-[10px] text-[#888888] transition-colors hover:text-white"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => removeNote(note._id)}
                              className="text-[#666666] transition-colors hover:text-[#ff4444]"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>
                        </div>
                        {note.content && (
                          <pre className="mt-1 max-h-56 overflow-auto whitespace-pre-wrap rounded bg-[#0a0a0a] p-2 font-['JetBrains_Mono'] text-[11px] leading-relaxed text-[#cccccc]">
                            {note.content}
                          </pre>
                        )}
                        <div className="mt-2 flex items-center gap-2 font-['JetBrains_Mono'] text-[10px] text-[#666666]">
                          {linkCount > 1 && (
                            <span className="flex items-center gap-1 text-[#4ade80]">
                              <Link2 className="h-3 w-3" />
                              shared with {linkCount - 1} other question{linkCount - 1 === 1 ? "" : "s"}
                            </span>
                          )}
                          <span className="ml-auto">updated {formatRelativeTime(note.updatedAt)}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
