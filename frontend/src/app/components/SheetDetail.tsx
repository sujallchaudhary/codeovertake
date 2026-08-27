import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import {
  CheckCircle2, ChevronDown, ChevronRight, Circle, ExternalLink, FolderPlus, Loader2,
  Lock, Plus, Settings, Star, Trash2, Upload, UserPlus, Users, X,
} from "lucide-react";
import {
  addSheetCollaborator, addSheetQuestion, addSheetSection, deleteSheet, deleteSheetSection,
  fetchSheet, followSheet, importSheetQuestions, removeSheetCollaborator, removeSheetQuestion,
  trackSheetQuestion, unfollowSheet, updateSheet,
  type SheetQuestion, type SheetResponse,
} from "../api";
import { useAuth } from "../AuthContext";
import { AddQuestionModal } from "./AddQuestionModal";
import {
  DifficultyBadge, EmptyState, ErrorBanner, PlatformGlyph, ProgressBar, Spinner,
} from "./TrackerUI";

/** One row inside a sheet, with the tick/star controls gated on follow status. */
function QuestionRow({
  question, canTrack, canEdit, onToggle, onStar, onRemove,
}: {
  question: SheetQuestion;
  canTrack: boolean;
  canEdit: boolean;
  onToggle: () => void;
  onStar: () => void;
  onRemove: () => void;
}) {
  const solved = question.status === "solved";
  return (
    <div className="flex items-center gap-3 border-b border-[#1a1a1a] px-3 py-2.5 transition-colors last:border-0 hover:bg-[#161616]">
      <button
        onClick={onToggle}
        disabled={!canTrack}
        title={canTrack ? (solved ? "Mark unsolved" : "Mark solved") : "Follow this sheet to track progress"}
        className="shrink-0 disabled:cursor-not-allowed"
      >
        {solved ? (
          <CheckCircle2 className="h-4 w-4 text-[#4ade80]" />
        ) : (
          <Circle className={`h-4 w-4 ${canTrack ? "text-[#444444] hover:text-[#888888]" : "text-[#2a2a2a]"}`} />
        )}
      </button>

      <PlatformGlyph platform={question.problem.platform} />

      <a
        href={question.problem.url}
        target="_blank"
        rel="noopener noreferrer"
        className={`min-w-0 flex-1 truncate font-['Archivo'] text-sm transition-colors hover:text-[#4ade80] ${
          solved ? "text-[#888888]" : "text-white"
        }`}
      >
        {question.problem.title}
      </a>

      <DifficultyBadge difficulty={question.problem.difficulty} />

      <a
        href={question.problem.url}
        target="_blank"
        rel="noopener noreferrer"
        className="shrink-0 text-[#555555] transition-colors hover:text-white"
      >
        <ExternalLink className="h-3 w-3" />
      </a>

      {canTrack && (
        <button onClick={onStar} className="shrink-0" title="Star">
          <Star
            className={`h-3.5 w-3.5 transition-colors ${
              question.starred ? "fill-current text-[#f59e0b]" : "text-[#444444] hover:text-[#888888]"
            }`}
          />
        </button>
      )}

      {canEdit && (
        <button
          onClick={onRemove}
          className="shrink-0 text-[#444444] transition-colors hover:text-[#ff4444]"
          title="Remove from sheet"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}

function ImportModal({
  onClose, onImport,
}: {
  onClose: () => void;
  onImport: (csv: string) => Promise<{ imported: number; skipped: number; failures: any[] }>;
}) {
  const [csv, setCsv] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ imported: number; skipped: number; failures: any[] } | null>(null);

  async function handleFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setCsv(await file.text());
  }

  async function submit() {
    setBusy(true);
    setError("");
    try {
      setResult(await onImport(csv));
    } catch (err: any) {
      setError(err.message || "Import failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded border border-[#1e1e1e] bg-[#111111] p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-['JetBrains_Mono'] text-base text-white">Import questions</h2>
          <button onClick={onClose} className="text-[#666666] transition-colors hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>

        {error && <ErrorBanner message={error} />}

        {result ? (
          <div>
            <p className="font-['Archivo'] text-sm text-white">
              Imported <span className="text-[#4ade80]">{result.imported}</span> questions
              {result.skipped > 0 && <> · skipped {result.skipped} already in the sheet</>}
            </p>
            {result.failures.length > 0 && (
              <div className="mt-3">
                <p className="mb-1.5 font-['JetBrains_Mono'] text-[11px] text-[#ff8888]">
                  {result.failures.length} row(s) could not be read:
                </p>
                <ul className="max-h-32 overflow-y-auto font-['JetBrains_Mono'] text-[10px] text-[#888888]">
                  {result.failures.slice(0, 20).map((f, i) => (
                    <li key={i} className="truncate">{f.url} — {f.message}</li>
                  ))}
                </ul>
              </div>
            )}
            <button
              onClick={onClose}
              className="mt-4 w-full rounded bg-[#4ade80] px-4 py-2 font-['JetBrains_Mono'] text-xs text-black"
            >
              Done
            </button>
          </div>
        ) : (
          <>
            <p className="mb-3 font-['Archivo'] text-xs leading-relaxed text-[#888888]">
              Upload a CSV with a <span className="font-['JetBrains_Mono'] text-[#4ade80]">problemUrl</span> column.
              Optional <span className="font-['JetBrains_Mono']">topic</span> and{" "}
              <span className="font-['JetBrains_Mono']">subTopic</span> columns create the folder
              structure for you. Difficulty and tags are fetched automatically.
            </p>

            <input
              type="file"
              accept=".csv,text/csv,text/plain"
              onChange={handleFile}
              className="mb-3 w-full rounded border border-[#1e1e1e] bg-[#0a0a0a] px-3 py-2 font-['Archivo'] text-xs text-[#aaaaaa] file:mr-3 file:rounded file:border-0 file:bg-[#1e1e1e] file:px-2 file:py-1 file:font-['JetBrains_Mono'] file:text-[11px] file:text-white"
            />

            <textarea
              value={csv}
              onChange={(e) => setCsv(e.target.value)}
              rows={8}
              placeholder={"problemUrl,topic,subTopic\nhttps://leetcode.com/problems/two-sum/,Arrays,Hashing"}
              className="w-full resize-y rounded border border-[#1e1e1e] bg-[#0a0a0a] px-3 py-2 font-['JetBrains_Mono'] text-[11px] text-white placeholder:text-[#555555] focus:border-[#4ade80] focus:outline-none"
            />

            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={onClose}
                className="rounded border border-[#1e1e1e] px-3 py-2 font-['JetBrains_Mono'] text-xs text-[#888888] transition-colors hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={submit}
                disabled={!csv.trim() || busy}
                className="flex items-center gap-2 rounded bg-[#4ade80] px-4 py-2 font-['JetBrains_Mono'] text-xs text-black transition-opacity hover:opacity-90 disabled:opacity-40"
              >
                {busy && <Loader2 className="h-3 w-3 animate-spin" />}
                Import
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function SettingsPanel({
  data, onClose, onChanged,
}: {
  data: SheetResponse;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { sheet, permissions } = data;
  const [title, setTitle] = useState(sheet.title);
  const [description, setDescription] = useState(sheet.description);
  const [visibility, setVisibility] = useState(sheet.visibility);
  const [email, setEmail] = useState("");
  const [collaborators, setCollaborators] = useState(sheet.collaborators);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    setBusy(true);
    setError("");
    try {
      await updateSheet(sheet.slug, { title, description, visibility });
      onChanged();
      onClose();
    } catch (err: any) {
      setError(err.message || "Could not save");
    } finally {
      setBusy(false);
    }
  }

  async function invite() {
    setBusy(true);
    setError("");
    try {
      const res = await addSheetCollaborator(sheet.slug, email.trim());
      setCollaborators(res.collaborators);
      setEmail("");
    } catch (err: any) {
      setError(err.message || "Could not add collaborator");
    } finally {
      setBusy(false);
    }
  }

  async function revoke(target: string) {
    setBusy(true);
    try {
      const res = await removeSheetCollaborator(sheet.slug, target);
      setCollaborators(res.collaborators);
    } catch (err: any) {
      setError(err.message || "Could not remove collaborator");
    } finally {
      setBusy(false);
    }
  }

  async function destroy() {
    // eslint-disable-next-line no-restricted-globals, no-alert
    if (!confirm(`Delete "${sheet.title}"? Your solved questions stay in My Workspace.`)) return;
    setBusy(true);
    try {
      await deleteSheet(sheet.slug);
      window.location.href = "/sheets?scope=mine";
    } catch (err: any) {
      setError(err.message || "Could not delete the sheet");
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto bg-black/70 p-4 sm:items-center" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded border border-[#1e1e1e] bg-[#111111] p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-['JetBrains_Mono'] text-base text-white">Sheet settings</h2>
          <button onClick={onClose} className="text-[#666666] transition-colors hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>

        {error && <ErrorBanner message={error} />}

        {permissions.isOwner ? (
          <>
            <div className="flex flex-col gap-4">
              <div>
                <label className="mb-1.5 block font-['JetBrains_Mono'] text-[10px] uppercase tracking-widest text-[#666666]">
                  Title
                </label>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full rounded border border-[#1e1e1e] bg-[#0a0a0a] px-3 py-2 font-['Archivo'] text-sm text-white focus:border-[#4ade80] focus:outline-none"
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
                  className="w-full resize-y rounded border border-[#1e1e1e] bg-[#0a0a0a] px-3 py-2 font-['Archivo'] text-sm text-white focus:border-[#4ade80] focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1.5 block font-['JetBrains_Mono'] text-[10px] uppercase tracking-widest text-[#666666]">
                  Visibility
                </label>
                <div className="flex gap-2">
                  {["private", "public"].map((option) => (
                    <button
                      key={option}
                      onClick={() => setVisibility(option)}
                      className={`flex-1 rounded border px-3 py-2 font-['JetBrains_Mono'] text-xs capitalize transition-colors ${
                        visibility === option
                          ? "border-[#4ade80]/50 bg-[#4ade80]/5 text-white"
                          : "border-[#1e1e1e] text-[#888888] hover:text-white"
                      }`}
                    >
                      {option}
                    </button>
                  ))}
                </div>
              </div>

              {/* Collaborators */}
              <div>
                <label className="mb-1.5 block font-['JetBrains_Mono'] text-[10px] uppercase tracking-widest text-[#666666]">
                  Collaborators
                </label>
                <p className="mb-2 font-['Archivo'] text-xs text-[#666666]">
                  Collaborators can add and remove questions. They never see your solved status,
                  and you never see theirs.
                </p>
                <div className="mb-2 flex gap-2">
                  <input
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="friend@example.com"
                    className="flex-1 rounded border border-[#1e1e1e] bg-[#0a0a0a] px-3 py-2 font-['Archivo'] text-xs text-white placeholder:text-[#555555] focus:border-[#4ade80] focus:outline-none"
                  />
                  <button
                    onClick={invite}
                    disabled={!email.includes("@") || busy}
                    className="flex items-center gap-1.5 rounded border border-[#1e1e1e] px-3 py-2 font-['JetBrains_Mono'] text-xs text-white transition-colors hover:border-[#4ade80] disabled:opacity-40"
                  >
                    <UserPlus className="h-3 w-3" />
                    Invite
                  </button>
                </div>
                {collaborators.length > 0 && (
                  <div className="flex flex-col gap-1">
                    {collaborators.map((collaborator) => (
                      <div
                        key={collaborator.email}
                        className="flex items-center justify-between rounded bg-[#0a0a0a] px-2.5 py-1.5"
                      >
                        <span className="font-['Archivo'] text-xs text-[#aaaaaa]">{collaborator.email}</span>
                        <button
                          onClick={() => revoke(collaborator.email)}
                          className="text-[#666666] transition-colors hover:text-[#ff4444]"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="mt-5 flex items-center justify-between">
              <button
                onClick={destroy}
                disabled={busy}
                className="flex items-center gap-1.5 font-['JetBrains_Mono'] text-xs text-[#ff6666] transition-opacity hover:opacity-80 disabled:opacity-40"
              >
                <Trash2 className="h-3 w-3" />
                Delete sheet
              </button>
              <div className="flex gap-2">
                <button
                  onClick={onClose}
                  className="rounded border border-[#1e1e1e] px-3 py-2 font-['JetBrains_Mono'] text-xs text-[#888888] transition-colors hover:text-white"
                >
                  Cancel
                </button>
                <button
                  onClick={save}
                  disabled={busy || !title.trim()}
                  className="flex items-center gap-2 rounded bg-[#4ade80] px-4 py-2 font-['JetBrains_Mono'] text-xs text-black transition-opacity hover:opacity-90 disabled:opacity-40"
                >
                  {busy && <Loader2 className="h-3 w-3 animate-spin" />}
                  Save
                </button>
              </div>
            </div>
          </>
        ) : (
          <p className="font-['Archivo'] text-sm text-[#888888]">
            You have edit access to this sheet&apos;s questions, but only the owner can change its
            settings.
          </p>
        )}
      </div>
    </div>
  );
}

export function SheetDetail() {
  const { slug = "" } = useParams();
  const { isAuthenticated } = useAuth();

  const [data, setData] = useState<SheetResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);

  const [addTarget, setAddTarget] = useState<{ sectionId?: string; subsectionId?: string } | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setData(await fetchSheet(slug));
    } catch (err: any) {
      setError(err.message || "Could not load that sheet");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => { load(); }, [load]);

  async function toggleFollow() {
    if (!data) return;
    setBusy(true);
    setError("");
    try {
      if (data.permissions.isFollowing) await unfollowSheet(slug);
      else await followSheet(slug);
      await load();
    } catch (err: any) {
      setError(err.message || "Could not update follow state");
    } finally {
      setBusy(false);
    }
  }

  async function track(question: SheetQuestion, patch: { status?: string; starred?: boolean }) {
    if (!data?.permissions.canTrack) return;
    try {
      await trackSheetQuestion(slug, question.problem.id || question.problem._id, patch);
      await load();
    } catch (err: any) {
      setError(err.message || "Could not save your progress");
    }
  }

  async function removeQuestion(question: SheetQuestion, location: { sectionId?: string; subsectionId?: string }) {
    try {
      await removeSheetQuestion(slug, question.problem.id || question.problem._id, location);
      await load();
    } catch (err: any) {
      setError(err.message || "Could not remove the question");
    }
  }

  async function addSection(parentSectionId?: string) {
    // eslint-disable-next-line no-alert
    const title = prompt(parentSectionId ? "Subtopic name" : "Topic name");
    if (!title?.trim()) return;
    try {
      await addSheetSection(slug, { title: title.trim(), parentSectionId });
      await load();
    } catch (err: any) {
      setError(err.message || "Could not add the section");
    }
  }

  async function removeSection(sectionId: string, subsectionId?: string) {
    // eslint-disable-next-line no-alert, no-restricted-globals
    if (!confirm("Delete this section and the questions inside it?")) return;
    try {
      await deleteSheetSection(slug, sectionId, subsectionId);
      await load();
    } catch (err: any) {
      setError(err.message || "Could not delete the section");
    }
  }

  if (loading) return <Spinner label="Loading sheet..." />;

  if (error && !data) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
        <EmptyState
          icon={<Lock className="h-8 w-8" strokeWidth={1.5} />}
          title="Cannot open this sheet"
          description={error}
          action={(
            <Link
              to="/sheets"
              className="rounded bg-[#4ade80] px-4 py-2 font-['JetBrains_Mono'] text-sm text-black"
            >
              Back to sheets
            </Link>
          )}
        />
      </div>
    );
  }

  if (!data) return null;
  const { sheet, permissions, progress } = data;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="mb-6">
        <Link
          to="/sheets"
          className="mb-3 inline-block font-['JetBrains_Mono'] text-xs text-[#888888] transition-colors hover:text-white"
        >
          ← All sheets
        </Link>

        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded bg-[#4ade80]/10 font-['JetBrains_Mono'] text-xs text-[#4ade80]">
              {sheet.icon || sheet.title.slice(0, 2).toUpperCase()}
            </span>
            <div>
              <h1 className="font-['JetBrains_Mono'] text-xl tracking-tight text-white">{sheet.title}</h1>
              <div className="mt-1 flex flex-wrap items-center gap-2 font-['JetBrains_Mono'] text-[11px] text-[#666666]">
                {sheet.isCurated ? (
                  <span className="text-[#4ade80]">{sheet.curator || "Curated"}</span>
                ) : (
                  <span>by {sheet.owner?.name || "you"}</span>
                )}
                <span>·</span>
                <span>{sheet.questionCount} questions</span>
                {sheet.followerCount > 0 && (
                  <>
                    <span>·</span>
                    <span className="flex items-center gap-1">
                      <Users className="h-3 w-3" />
                      {sheet.followerCount}
                    </span>
                  </>
                )}
                {sheet.visibility === "private" && (
                  <>
                    <span>·</span>
                    <span className="flex items-center gap-1"><Lock className="h-3 w-3" /> private</span>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {permissions.canEdit && (
              <>
                <button
                  onClick={() => setImportOpen(true)}
                  className="flex items-center gap-1.5 rounded border border-[#1e1e1e] px-3 py-2 font-['JetBrains_Mono'] text-xs text-white transition-colors hover:border-[#4ade80]"
                >
                  <Upload className="h-3.5 w-3.5" />
                  Import
                </button>
                <button
                  onClick={() => addSection()}
                  className="flex items-center gap-1.5 rounded border border-[#1e1e1e] px-3 py-2 font-['JetBrains_Mono'] text-xs text-white transition-colors hover:border-[#4ade80]"
                >
                  <FolderPlus className="h-3.5 w-3.5" />
                  Add topic
                </button>
                <button
                  onClick={() => setAddTarget({})}
                  className="flex items-center gap-1.5 rounded bg-[#4ade80] px-3 py-2 font-['JetBrains_Mono'] text-xs text-black transition-opacity hover:opacity-90"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add question
                </button>
              </>
            )}
            {permissions.isOwner && (
              <button
                onClick={() => setSettingsOpen(true)}
                className="flex items-center gap-1.5 rounded border border-[#1e1e1e] px-3 py-2 font-['JetBrains_Mono'] text-xs text-white transition-colors hover:border-[#4ade80]"
              >
                <Settings className="h-3.5 w-3.5" />
                Settings
              </button>
            )}
            {!permissions.isOwner && isAuthenticated && (
              <button
                onClick={toggleFollow}
                disabled={busy}
                className={`flex items-center gap-1.5 rounded px-4 py-2 font-['JetBrains_Mono'] text-xs transition-opacity hover:opacity-90 disabled:opacity-50 ${
                  permissions.isFollowing
                    ? "border border-[#1e1e1e] text-white"
                    : "bg-[#4ade80] text-black"
                }`}
              >
                {busy && <Loader2 className="h-3 w-3 animate-spin" />}
                {permissions.isFollowing ? "Following" : "Follow to track"}
              </button>
            )}
            {!isAuthenticated && (
              <Link
                to="/login"
                className="rounded bg-[#4ade80] px-4 py-2 font-['JetBrains_Mono'] text-xs text-black transition-opacity hover:opacity-90"
              >
                Sign in to track
              </Link>
            )}
          </div>
        </div>

        {sheet.description && (
          <p className="mt-4 max-w-3xl font-['Archivo'] text-sm leading-relaxed text-[#aaaaaa]">
            {sheet.description}
          </p>
        )}
      </div>

      {error && <ErrorBanner message={error} />}

      {/* Follow nudge */}
      {isAuthenticated && !permissions.canTrack && !permissions.isOwner && (
        <div className="mb-5 rounded border border-[#4ade80]/25 bg-[#4ade80]/5 px-4 py-3 font-['Archivo'] text-sm text-[#aaaaaa]">
          Follow this sheet to mark questions done, star them and add notes. Your progress is
          private and stays in My Workspace even if you unfollow later.
        </div>
      )}

      {/* Progress */}
      {progress.total > 0 && (
        <div className="mb-6 rounded border border-[#1e1e1e] bg-[#111111] p-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="font-['JetBrains_Mono'] text-xs uppercase tracking-widest text-[#666666]">
              Your progress
            </span>
            <span className="font-['JetBrains_Mono'] text-sm text-white">
              {progress.solved} / {progress.total}
              <span className="ml-2 text-[#4ade80]">{progress.percent}%</span>
            </span>
          </div>
          <ProgressBar value={progress.solved} max={progress.total} className="h-2" />

          <div className="mt-3 grid grid-cols-3 gap-3">
            {(["easy", "medium", "hard"] as const).map((level) => {
              const bucket = progress.byDifficulty[level];
              if (!bucket || bucket.total === 0) return null;
              const color = level === "easy" ? "#4ade80" : level === "medium" ? "#f59e0b" : "#ff4444";
              return (
                <div key={level}>
                  <div className="mb-1 flex items-center justify-between font-['JetBrains_Mono'] text-[10px]">
                    <span className="uppercase" style={{ color }}>{level}</span>
                    <span className="text-[#888888]">{bucket.solved}/{bucket.total}</span>
                  </div>
                  <ProgressBar value={bucket.solved} max={bucket.total} color={color} className="h-1" />
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Content */}
      {sheet.questionCount === 0 ? (
        <EmptyState
          title="This sheet has no questions yet"
          description={permissions.canEdit
            ? "Add questions one by one, or import a spreadsheet to build the whole list at once."
            : "The curator has not added any questions yet."}
          action={permissions.canEdit && (
            <div className="flex gap-2">
              <button
                onClick={() => setAddTarget({})}
                className="rounded bg-[#4ade80] px-4 py-2 font-['JetBrains_Mono'] text-sm text-black"
              >
                Add a question
              </button>
              <button
                onClick={() => setImportOpen(true)}
                className="rounded border border-[#1e1e1e] px-4 py-2 font-['JetBrains_Mono'] text-sm text-white"
              >
                Import CSV
              </button>
            </div>
          )}
        />
      ) : (
        <div className="flex flex-col gap-4">
          {/* Root-level questions (not inside a topic) */}
          {sheet.questions.length > 0 && (
            <div className="overflow-hidden rounded border border-[#1e1e1e] bg-[#111111]">
              {sheet.questions.map((question) => (
                <QuestionRow
                  key={question.problem._id}
                  question={question}
                  canTrack={permissions.canTrack}
                  canEdit={permissions.canEdit}
                  onToggle={() => track(question, {
                    status: question.status === "solved" ? "unsolved" : "solved",
                  })}
                  onStar={() => track(question, { starred: !question.starred })}
                  onRemove={() => removeQuestion(question, {})}
                />
              ))}
            </div>
          )}

          {/* Topics */}
          {sheet.sections.map((section) => {
            const sectionSolved = section.questions.filter((q) => q.status === "solved").length
              + section.subsections.reduce(
                (sum, sub) => sum + sub.questions.filter((q) => q.status === "solved").length, 0
              );
            const sectionTotal = section.questions.length
              + section.subsections.reduce((sum, sub) => sum + sub.questions.length, 0);
            const isCollapsed = collapsed[section.id];

            return (
              <div key={section.id} className="overflow-hidden rounded border border-[#1e1e1e] bg-[#111111]">
                <div className="flex items-center gap-2 border-b border-[#1e1e1e] px-3 py-2.5">
                  <button
                    onClick={() => setCollapsed((c) => ({ ...c, [section.id]: !c[section.id] }))}
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                  >
                    {isCollapsed
                      ? <ChevronRight className="h-4 w-4 shrink-0 text-[#666666]" />
                      : <ChevronDown className="h-4 w-4 shrink-0 text-[#666666]" />}
                    <span className="truncate font-['JetBrains_Mono'] text-sm text-white">
                      {section.title}
                    </span>
                    <span className="shrink-0 font-['JetBrains_Mono'] text-[11px] text-[#666666]">
                      {sectionSolved}/{sectionTotal}
                    </span>
                  </button>

                  <div className="hidden w-24 shrink-0 sm:block">
                    <ProgressBar value={sectionSolved} max={sectionTotal} className="h-1" />
                  </div>

                  {permissions.canEdit && (
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        onClick={() => setAddTarget({ sectionId: section.id })}
                        title="Add question to this topic"
                        className="text-[#666666] transition-colors hover:text-[#4ade80]"
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => addSection(section.id)}
                        title="Add subtopic"
                        className="text-[#666666] transition-colors hover:text-[#4ade80]"
                      >
                        <FolderPlus className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => removeSection(section.id)}
                        title="Delete topic"
                        className="text-[#666666] transition-colors hover:text-[#ff4444]"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  )}
                </div>

                {!isCollapsed && (
                  <>
                    {section.questions.map((question) => (
                      <QuestionRow
                        key={question.problem._id}
                        question={question}
                        canTrack={permissions.canTrack}
                        canEdit={permissions.canEdit}
                        onToggle={() => track(question, {
                          status: question.status === "solved" ? "unsolved" : "solved",
                        })}
                        onStar={() => track(question, { starred: !question.starred })}
                        onRemove={() => removeQuestion(question, { sectionId: section.id })}
                      />
                    ))}

                    {/* Subtopics */}
                    {section.subsections.map((sub) => (
                      <div key={sub.id} className="border-t border-[#1a1a1a] bg-[#0d0d0d]">
                        <div className="flex items-center gap-2 px-3 py-2 pl-8">
                          <span className="min-w-0 flex-1 truncate font-['JetBrains_Mono'] text-xs text-[#aaaaaa]">
                            {sub.title}
                          </span>
                          <span className="shrink-0 font-['JetBrains_Mono'] text-[10px] text-[#666666]">
                            {sub.questions.filter((q) => q.status === "solved").length}/{sub.questions.length}
                          </span>
                          {permissions.canEdit && (
                            <div className="flex shrink-0 items-center gap-1">
                              <button
                                onClick={() => setAddTarget({ sectionId: section.id, subsectionId: sub.id })}
                                title="Add question here"
                                className="text-[#666666] transition-colors hover:text-[#4ade80]"
                              >
                                <Plus className="h-3 w-3" />
                              </button>
                              <button
                                onClick={() => removeSection(section.id, sub.id)}
                                title="Delete subtopic"
                                className="text-[#666666] transition-colors hover:text-[#ff4444]"
                              >
                                <Trash2 className="h-3 w-3" />
                              </button>
                            </div>
                          )}
                        </div>
                        <div className="pl-5">
                          {sub.questions.map((question) => (
                            <QuestionRow
                              key={question.problem._id}
                              question={question}
                              canTrack={permissions.canTrack}
                              canEdit={permissions.canEdit}
                              onToggle={() => track(question, {
                                status: question.status === "solved" ? "unsolved" : "solved",
                              })}
                              onStar={() => track(question, { starred: !question.starred })}
                              onRemove={() => removeQuestion(question, {
                                sectionId: section.id, subsectionId: sub.id,
                              })}
                            />
                          ))}
                        </div>
                      </div>
                    ))}
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}

      <AddQuestionModal
        open={addTarget !== null}
        onClose={() => setAddTarget(null)}
        title="Add a question to this sheet"
        submitLabel="Add to sheet"
        onSubmit={async (payload) => {
          await addSheetQuestion(slug, { ...payload, ...addTarget });
          await load();
        }}
      />

      {importOpen && (
        <ImportModal
          onClose={() => { setImportOpen(false); load(); }}
          onImport={async (csv) => {
            const res = await importSheetQuestions(slug, csv);
            return { imported: res.imported, skipped: res.skipped, failures: res.failures };
          }}
        />
      )}

      {settingsOpen && (
        <SettingsPanel data={data} onClose={() => setSettingsOpen(false)} onChanged={load} />
      )}
    </div>
  );
}
