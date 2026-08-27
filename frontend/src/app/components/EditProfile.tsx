import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router";
import {
  BadgeCheck, Check, Copy, Github, Loader2, Plus, Puzzle, Trash2, X,
} from "lucide-react";
import { useClerk } from "@clerk/react";
import {
  addEducation, addExperience, addProject, deleteEducation, deleteExperience, deleteProject,
  fetchExtensionToken, fetchGithubRepos, fetchPortfolioPlatforms,
  removePortfolioPlatform, reorderProjects, rotateExtensionToken, setPortfolioPlatform,
  syncAccountFromClerk, updateAccount, verifyPlatform,
  type PortfolioPlatformMeta,
} from "../api";
import { useAuth } from "../AuthContext";
import {
  ErrorBanner, PLATFORM_COLORS, PageHeader, PlatformGlyph, RequireAuth, Spinner,
} from "./TrackerUI";

type Tab = "account" | "platforms" | "projects" | "background" | "extension";

const inputClass =
  "w-full rounded border border-[#1e1e1e] bg-[#0a0a0a] px-3 py-2 font-['Archivo'] text-sm text-white "
  + "placeholder:text-[#555555] focus:border-[#4ade80] focus:outline-none";

const labelClass =
  "mb-1.5 block font-['JetBrains_Mono'] text-[10px] uppercase tracking-widest text-[#666666]";

function Section({ title, description, children }: {
  title: string; description?: string; children: React.ReactNode;
}) {
  return (
    <div className="rounded border border-[#1e1e1e] bg-[#111111] p-5">
      <h3 className="font-['JetBrains_Mono'] text-sm text-white">{title}</h3>
      {description && (
        <p className="mt-1 font-['Archivo'] text-xs leading-relaxed text-[#888888]">{description}</p>
      )}
      <div className="mt-4">{children}</div>
    </div>
  );
}

/* ------------------------------------------------------------------- account */

function AccountTab() {
  const { user, patchUser, refresh } = useAuth();
  const clerk = useClerk();
  const [form, setForm] = useState({
    name: user?.name || "",
    handle: user?.handle || "",
    headline: user?.headline || "",
    about: user?.about || "",
    location: user?.location || "",
    website: user?.socials?.website || "",
    linkedin: user?.socials?.linkedin || "",
    twitter: user?.socials?.twitter || "",
    isPublic: user?.isPublic ?? true,
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      const res = await updateAccount({
        name: form.name,
        handle: form.handle,
        headline: form.headline,
        about: form.about,
        location: form.location,
        isPublic: form.isPublic,
        socials: { website: form.website, linkedin: form.linkedin, twitter: form.twitter },
      } as any);
      patchUser(res.user);
      await refresh();
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err: any) {
      setError(err.message || "Could not save your profile");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {error && <ErrorBanner message={error} />}

      <Section title="Public profile" description="This is what recruiters see on your portfolio link.">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={labelClass}>Name</label>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Handle</label>
            <input
              value={form.handle}
              onChange={(e) => setForm({ ...form, handle: e.target.value.toLowerCase() })}
              className={inputClass}
            />
            <p className="mt-1 font-['JetBrains_Mono'] text-[10px] text-[#555555]">
              /u/{form.handle || "your-handle"}
            </p>
          </div>
          <div className="sm:col-span-2">
            <label className={labelClass}>Headline</label>
            <input
              value={form.headline}
              onChange={(e) => setForm({ ...form, headline: e.target.value })}
              placeholder="Final year CS student · Full stack + DSA"
              className={inputClass}
            />
          </div>
          <div className="sm:col-span-2">
            <label className={labelClass}>About</label>
            <textarea
              value={form.about}
              onChange={(e) => setForm({ ...form, about: e.target.value })}
              rows={4}
              className={`${inputClass} resize-y`}
            />
          </div>
          <div>
            <label className={labelClass}>Location</label>
            <input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} className={inputClass} />
          </div>
          {/*
            Roll number is not a free-text field any more: pointing your
            portfolio at a leaderboard profile requires a verified claim,
            otherwise anyone could display someone else's ranking as their own.
          */}
          <div>
            <label className={labelClass}>Leaderboard profile</label>
            {user?.rollno ? (
              <div className="flex items-center gap-2 rounded border border-[#1e1e1e] bg-[#0a0a0a] px-3 py-2">
                <BadgeCheck className="h-3.5 w-3.5 shrink-0 text-[#4ade80]" />
                <span className="font-['JetBrains_Mono'] text-sm text-white">{user.rollno}</span>
                <Link
                  to="/claim"
                  className="ml-auto font-['JetBrains_Mono'] text-[11px] text-[#888888] transition-colors hover:text-white"
                >
                  Manage
                </Link>
              </div>
            ) : (
              <Link
                to="/claim"
                className="flex items-center justify-between rounded border border-[#1e1e1e] bg-[#0a0a0a] px-3 py-2 transition-colors hover:border-[#4ade80]"
              >
                <span className="font-['Archivo'] text-sm text-[#888888]">
                  Not linked to a roll number
                </span>
                <span className="font-['JetBrains_Mono'] text-[11px] text-[#4ade80]">Claim →</span>
              </Link>
            )}
          </div>
          <div>
            <label className={labelClass}>Website</label>
            <input value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>LinkedIn</label>
            <input value={form.linkedin} onChange={(e) => setForm({ ...form, linkedin: e.target.value })} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Twitter / X</label>
            <input value={form.twitter} onChange={(e) => setForm({ ...form, twitter: e.target.value })} className={inputClass} />
          </div>
          <div className="flex items-end">
            <button
              onClick={() => setForm({ ...form, isPublic: !form.isPublic })}
              className={`rounded border px-3 py-2 font-['JetBrains_Mono'] text-xs transition-colors ${
                form.isPublic
                  ? "border-[#4ade80]/50 bg-[#4ade80]/5 text-[#4ade80]"
                  : "border-[#1e1e1e] text-[#888888]"
              }`}
            >
              {form.isPublic ? "Profile is public" : "Profile is private"}
            </button>
          </div>
        </div>

        <div className="mt-5 flex items-center gap-3">
          <button
            onClick={save}
            disabled={saving}
            className="flex items-center gap-2 rounded bg-[#4ade80] px-4 py-2 font-['JetBrains_Mono'] text-xs text-black transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {saving && <Loader2 className="h-3 w-3 animate-spin" />}
            Save changes
          </button>
          {saved && (
            <span className="flex items-center gap-1 font-['JetBrains_Mono'] text-xs text-[#4ade80]">
              <Check className="h-3 w-3" /> Saved
            </span>
          )}
          {user && (
            <Link
              to={`/u/${user.handle}`}
              className="ml-auto font-['JetBrains_Mono'] text-xs text-[#888888] transition-colors hover:text-white"
            >
              View public profile →
            </Link>
          )}
        </div>
      </Section>

      {/*
        Credentials live in Clerk, so email, password, MFA and connected
        accounts are managed in its account modal rather than duplicated here.
      */}
      <Section
        title="Sign-in and security"
        description="Your email, password, two-factor authentication and connected accounts (Google, GitHub, ...) are managed by Clerk."
      >
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="rounded bg-[#1a1a1a] px-2 py-1 font-['JetBrains_Mono'] text-[11px] text-[#aaaaaa]">
            {user?.email}
          </span>
          {(user?.verifiedEmails || []).includes(user?.email || "") && (
            <span className="flex items-center gap-1 rounded bg-[#4ade80]/15 px-1.5 py-0.5 font-['JetBrains_Mono'] text-[10px] text-[#4ade80]">
              <BadgeCheck className="h-3 w-3" /> verified
            </span>
          )}
        </div>
        <button
          onClick={() => clerk.openUserProfile()}
          className="rounded border border-[#1e1e1e] px-3 py-2 font-['JetBrains_Mono'] text-xs text-white transition-colors hover:border-[#4ade80]"
        >
          Manage account
        </button>
      </Section>
    </div>
  );
}

/* ----------------------------------------------------------------- platforms */

function PlatformRow({ meta, onChanged }: { meta: PortfolioPlatformMeta; onChanged: () => void }) {
  const { user } = useAuth();
  const clerk = useClerk();
  const entry = user?.platforms?.[meta.key];
  const [username, setUsername] = useState(entry?.username || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [verification, setVerification] = useState<{ code: string; field: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const color = PLATFORM_COLORS[meta.key] || "#888888";

  useEffect(() => { setUsername(entry?.username || ""); }, [entry?.username]);

  async function connect() {
    setBusy(true);
    setError("");
    try {
      const res = await setPortfolioPlatform(meta.key, username.trim());
      setVerification(res.verification);
      onChanged();
    } catch (err: any) {
      setError(err.errors?.[0]?.message || err.message || "Could not connect");
    } finally {
      setBusy(false);
    }
  }

  async function verify() {
    setBusy(true);
    setError("");
    try {
      await verifyPlatform(meta.key);
      setVerification(null);
      onChanged();
    } catch (err: any) {
      setError(err.errors?.[0]?.message || err.message || "Verification failed");
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    setBusy(true);
    setError("");
    try {
      await removePortfolioPlatform(meta.key);
      setUsername("");
      setVerification(null);
      onChanged();
    } catch (err: any) {
      setError(err.message || "Could not disconnect");
    } finally {
      setBusy(false);
    }
  }

  /**
   * GitHub is linked as a Clerk social connection, so the account modal owns
   * that flow. After linking we pull the connection through immediately rather
   * than waiting for the `user.updated` webhook.
   */
  function connectGithub() {
    clerk.openUserProfile();
  }

  async function pullFromClerk() {
    setBusy(true);
    setError("");
    try {
      await syncAccountFromClerk();
      onChanged();
    } catch (err: any) {
      setError(err.message || "Could not refresh from Clerk");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded border border-[#1e1e1e] bg-[#0a0a0a] p-3">
      <div className="mb-2 flex items-center gap-2">
        <PlatformGlyph platform={meta.key} className="h-4 w-4" />
        <span className="font-['JetBrains_Mono'] text-sm" style={{ color }}>{meta.label}</span>
        {entry?.verified && (
          <span className="flex items-center gap-1 rounded bg-[#4ade80]/15 px-1.5 py-0.5 font-['JetBrains_Mono'] text-[10px] text-[#4ade80]">
            <BadgeCheck className="h-3 w-3" /> Verified
          </span>
        )}
        {!meta.statsSupported && (
          <span
            title="No public stats API: the handle is shown as a link only"
            className="rounded bg-[#1a1a1a] px-1.5 py-0.5 font-['JetBrains_Mono'] text-[10px] text-[#888888]"
          >
            link only
          </span>
        )}
        {meta.countsTowardsLeaderboard && (
          <span className="ml-auto font-['JetBrains_Mono'] text-[10px] text-[#555555]">
            counts on leaderboard
          </span>
        )}
      </div>

      {error && <p className="mb-2 font-['Archivo'] text-xs text-[#ff8888]">{error}</p>}

      {meta.key === "github" ? (
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="github-username"
            className="min-w-[160px] flex-1 rounded border border-[#1e1e1e] bg-[#111111] px-2.5 py-1.5 font-['Archivo'] text-xs text-white placeholder:text-[#555555] focus:border-[#4ade80] focus:outline-none"
          />
          <button
            onClick={connect}
            disabled={busy || !username.trim()}
            className="rounded border border-[#1e1e1e] px-2.5 py-1.5 font-['JetBrains_Mono'] text-xs text-white transition-colors hover:border-[#4ade80] disabled:opacity-40"
          >
            Save handle
          </button>
          <button
            onClick={connectGithub}
            className="flex items-center gap-1.5 rounded bg-[#4ade80] px-2.5 py-1.5 font-['JetBrains_Mono'] text-xs text-black transition-opacity hover:opacity-90"
          >
            <Github className="h-3 w-3" />
            {user?.githubAuth?.login ? "Manage connection" : "Connect GitHub"}
          </button>
          <button
            onClick={pullFromClerk}
            disabled={busy}
            title="Pull your linked accounts from Clerk now"
            className="flex items-center gap-1.5 rounded border border-[#1e1e1e] px-2.5 py-1.5 font-['JetBrains_Mono'] text-xs text-[#888888] transition-colors hover:text-white disabled:opacity-40"
          >
            {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
            Refresh
          </button>
          {entry?.username && (
            <button
              onClick={disconnect}
              disabled={busy}
              className="text-[#666666] transition-colors hover:text-[#ff4444] disabled:opacity-40"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
          <p className="w-full font-['Archivo'] text-[11px] text-[#666666]">
            Link GitHub under <span className="text-[#aaaaaa]">Connected accounts</span> in the
            account modal. That verifies the development pillar automatically and unlocks the
            repository picker for projects, then press Refresh.
          </p>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder={`${meta.label} username`}
              className="min-w-[160px] flex-1 rounded border border-[#1e1e1e] bg-[#111111] px-2.5 py-1.5 font-['Archivo'] text-xs text-white placeholder:text-[#555555] focus:border-[#4ade80] focus:outline-none"
            />
            <button
              onClick={connect}
              disabled={busy || !username.trim() || username.trim() === entry?.username}
              className="flex items-center gap-1.5 rounded border border-[#1e1e1e] px-2.5 py-1.5 font-['JetBrains_Mono'] text-xs text-white transition-colors hover:border-[#4ade80] disabled:opacity-40"
            >
              {busy && <Loader2 className="h-3 w-3 animate-spin" />}
              {entry?.username ? "Update" : "Connect"}
            </button>
            {entry?.username && !entry.verified && (
              <button
                onClick={verify}
                disabled={busy}
                className="rounded bg-[#4ade80] px-2.5 py-1.5 font-['JetBrains_Mono'] text-xs text-black transition-opacity hover:opacity-90 disabled:opacity-40"
              >
                Verify
              </button>
            )}
            {entry?.username && (
              <button
                onClick={disconnect}
                disabled={busy}
                className="text-[#666666] transition-colors hover:text-[#ff4444] disabled:opacity-40"
                title="Deregister this platform"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Verification instructions */}
          {entry?.username && !entry.verified && (
            <div className="mt-2 rounded border border-[#f59e0b]/25 bg-[#f59e0b]/5 p-2.5">
              <p className="font-['Archivo'] text-[11px] leading-relaxed text-[#ccaa77]">
                To verify, paste this code into the{" "}
                <span className="font-['JetBrains_Mono'] text-[#f59e0b]">{meta.verificationField}</span>{" "}
                field of your {meta.label} profile, save it, then press Verify. You can change the
                field straight back afterwards.
              </p>
              {verification?.code ? (
                <div className="mt-2 flex items-center gap-2">
                  <code className="flex-1 truncate rounded bg-[#0a0a0a] px-2 py-1 font-['JetBrains_Mono'] text-[11px] text-[#4ade80]">
                    {verification.code}
                  </code>
                  <button
                    onClick={() => {
                      navigator.clipboard?.writeText(verification.code);
                      setCopied(true);
                      setTimeout(() => setCopied(false), 1500);
                    }}
                    className="flex items-center gap-1 rounded border border-[#1e1e1e] px-2 py-1 font-['JetBrains_Mono'] text-[10px] text-white"
                  >
                    {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                    {copied ? "Copied" : "Copy"}
                  </button>
                </div>
              ) : (
                <p className="mt-1.5 font-['JetBrains_Mono'] text-[10px] text-[#888888]">
                  Press Update to reissue your verification code.
                </p>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function PlatformsTab() {
  const { refresh } = useAuth();
  const [platforms, setPlatforms] = useState<PortfolioPlatformMeta[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchPortfolioPlatforms()
      .then((res) => setPlatforms(res.platforms))
      .catch(() => setPlatforms([]))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <Spinner />;

  return (
    <Section
      title="Coding platforms"
      description="We never ask for passwords. Public usernames are enough to pull stats; verification just proves the account is yours, which unlocks the Dev Card and the C-Score leaderboard."
    >
      <div className="flex flex-col gap-3">
        {platforms.map((meta) => (
          <PlatformRow key={meta.key} meta={meta} onChanged={refresh} />
        ))}
      </div>
    </Section>
  );
}

/* ------------------------------------------------------------------ projects */

function ProjectsTab() {
  const { user, refresh } = useAuth();
  const [repos, setRepos] = useState<any[]>([]);
  const [reposError, setReposError] = useState("");
  const [loadingRepos, setLoadingRepos] = useState(false);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState<{
    title: string; description: string; repoUrl: string; demoUrl: string; techStack: string; images: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);

  const projects = [...(user?.projects || [])].sort((a: any, b: any) => (a.order || 0) - (b.order || 0));

  const loadRepos = useCallback(async () => {
    setLoadingRepos(true);
    setReposError("");
    try {
      const res = await fetchGithubRepos();
      setRepos(res.repos);
    } catch (err: any) {
      setReposError(err.message || "Could not load repositories");
    } finally {
      setLoadingRepos(false);
    }
  }, []);

  async function save() {
    if (!draft) return;
    setBusy(true);
    setError("");
    try {
      await addProject({
        title: draft.title,
        description: draft.description,
        repoUrl: draft.repoUrl,
        demoUrl: draft.demoUrl,
        techStack: draft.techStack.split(",").map((t) => t.trim()).filter(Boolean),
        images: draft.images.split(",").map((t) => t.trim()).filter(Boolean),
      });
      setDraft(null);
      await refresh();
    } catch (err: any) {
      setError(err.message || "Could not save the project");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setBusy(true);
    try {
      await deleteProject(id);
      await refresh();
    } catch (err: any) {
      setError(err.message || "Could not delete the project");
    } finally {
      setBusy(false);
    }
  }

  /** Moves a project one slot up/down and persists the whole order. */
  async function move(index: number, delta: number) {
    const next = [...projects];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setBusy(true);
    try {
      await reorderProjects(next.map((p: any) => String(p._id)));
      await refresh();
    } catch (err: any) {
      setError(err.message || "Could not reorder");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {error && <ErrorBanner message={error} />}

      <Section
        title="Projects"
        description="Show what you built, not just what you solved. Order them so your best work leads."
      >
        {projects.length === 0 && (
          <p className="mb-3 font-['Archivo'] text-sm text-[#888888]">No projects yet.</p>
        )}

        <div className="mb-4 flex flex-col gap-2">
          {projects.map((project: any, index: number) => (
            <div
              key={project._id}
              className="flex items-center gap-2 rounded border border-[#1e1e1e] bg-[#0a0a0a] px-3 py-2"
            >
              <div className="flex flex-col">
                <button
                  onClick={() => move(index, -1)}
                  disabled={index === 0 || busy}
                  className="text-[10px] leading-none text-[#666666] transition-colors hover:text-white disabled:opacity-30"
                >
                  ▲
                </button>
                <button
                  onClick={() => move(index, 1)}
                  disabled={index === projects.length - 1 || busy}
                  className="text-[10px] leading-none text-[#666666] transition-colors hover:text-white disabled:opacity-30"
                >
                  ▼
                </button>
              </div>
              <span className="min-w-0 flex-1 truncate font-['Archivo'] text-sm text-white">
                {project.title}
              </span>
              {project.techStack?.length > 0 && (
                <span className="hidden truncate font-['JetBrains_Mono'] text-[10px] text-[#666666] sm:block">
                  {project.techStack.slice(0, 3).join(" · ")}
                </span>
              )}
              <button
                onClick={() => remove(String(project._id))}
                disabled={busy}
                className="text-[#666666] transition-colors hover:text-[#ff4444] disabled:opacity-40"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>

        {draft ? (
          <div className="rounded border border-[#1e1e1e] bg-[#0a0a0a] p-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className={labelClass}>Title</label>
                <input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} className={inputClass} />
              </div>
              <div className="sm:col-span-2">
                <label className={labelClass}>Description</label>
                <textarea
                  value={draft.description}
                  onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                  rows={3}
                  className={`${inputClass} resize-y`}
                />
              </div>
              <div>
                <label className={labelClass}>Repository URL</label>
                <input value={draft.repoUrl} onChange={(e) => setDraft({ ...draft, repoUrl: e.target.value })} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Demo URL</label>
                <input value={draft.demoUrl} onChange={(e) => setDraft({ ...draft, demoUrl: e.target.value })} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Tech stack (comma separated)</label>
                <input value={draft.techStack} onChange={(e) => setDraft({ ...draft, techStack: e.target.value })} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Screenshot URLs (comma separated)</label>
                <input value={draft.images} onChange={(e) => setDraft({ ...draft, images: e.target.value })} className={inputClass} />
              </div>
            </div>
            <div className="mt-3 flex justify-end gap-2">
              <button
                onClick={() => setDraft(null)}
                className="rounded border border-[#1e1e1e] px-3 py-1.5 font-['JetBrains_Mono'] text-xs text-[#888888]"
              >
                Cancel
              </button>
              <button
                onClick={save}
                disabled={!draft.title.trim() || busy}
                className="flex items-center gap-2 rounded bg-[#4ade80] px-3 py-1.5 font-['JetBrains_Mono'] text-xs text-black disabled:opacity-40"
              >
                {busy && <Loader2 className="h-3 w-3 animate-spin" />}
                Add project
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setDraft({
              title: "", description: "", repoUrl: "", demoUrl: "", techStack: "", images: "",
            })}
            className="flex items-center gap-1.5 rounded bg-[#4ade80] px-3 py-2 font-['JetBrains_Mono'] text-xs text-black transition-opacity hover:opacity-90"
          >
            <Plus className="h-3.5 w-3.5" /> Add project
          </button>
        )}
      </Section>

      <Section
        title="Pick from GitHub"
        description="Load your repositories and turn any of them into a project card in one click."
      >
        {reposError && <p className="mb-2 font-['Archivo'] text-xs text-[#ff8888]">{reposError}</p>}
        <button
          onClick={loadRepos}
          disabled={loadingRepos}
          className="mb-3 flex items-center gap-1.5 rounded border border-[#1e1e1e] px-3 py-2 font-['JetBrains_Mono'] text-xs text-white transition-colors hover:border-[#4ade80] disabled:opacity-50"
        >
          {loadingRepos ? <Loader2 className="h-3 w-3 animate-spin" /> : <Github className="h-3.5 w-3.5" />}
          Load repositories
        </button>

        {repos.length > 0 && (
          <div className="max-h-72 overflow-y-auto rounded border border-[#1e1e1e]">
            {repos.map((repo) => (
              <div
                key={repo.fullName}
                className="flex items-center gap-2 border-b border-[#1a1a1a] px-3 py-2 last:border-0"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate font-['Archivo'] text-sm text-white">{repo.name}</div>
                  <div className="truncate font-['Archivo'] text-[11px] text-[#666666]">
                    {repo.description || "No description"}
                  </div>
                </div>
                <span className="shrink-0 font-['JetBrains_Mono'] text-[10px] text-[#666666]">
                  ★ {repo.stars}
                </span>
                <button
                  onClick={() => setDraft({
                    title: repo.name,
                    description: repo.description || "",
                    repoUrl: repo.url,
                    demoUrl: repo.homepage || "",
                    techStack: [repo.language, ...(repo.topics || [])].filter(Boolean).join(", "),
                    images: "",
                  })}
                  disabled={repo.alreadyAdded}
                  className="shrink-0 rounded border border-[#1e1e1e] px-2 py-1 font-['JetBrains_Mono'] text-[10px] text-white transition-colors hover:border-[#4ade80] disabled:opacity-40"
                >
                  {repo.alreadyAdded ? "Added" : "Use"}
                </button>
              </div>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}

/* ---------------------------------------------------------------- background */

function BackgroundTab() {
  const { user, refresh } = useAuth();
  const [error, setError] = useState("");
  const [eduDraft, setEduDraft] = useState<any | null>(null);
  const [expDraft, setExpDraft] = useState<any | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await fn();
      await refresh();
      setEduDraft(null);
      setExpDraft(null);
    } catch (err: any) {
      setError(err.message || "Could not save");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {error && <ErrorBanner message={error} />}

      <Section title="Education">
        <div className="mb-3 flex flex-col gap-2">
          {(user?.education || []).map((entry: any) => (
            <div key={entry._id} className="flex items-center gap-2 rounded border border-[#1e1e1e] bg-[#0a0a0a] px-3 py-2">
              <div className="min-w-0 flex-1">
                <div className="truncate font-['Archivo'] text-sm text-white">{entry.institute}</div>
                <div className="truncate font-['Archivo'] text-[11px] text-[#666666]">
                  {[entry.degree, entry.field, entry.startYear && `${entry.startYear}–${entry.endYear || ""}`]
                    .filter(Boolean).join(" · ")}
                </div>
              </div>
              <button
                onClick={() => run(() => deleteEducation(String(entry._id)))}
                disabled={busy}
                className="text-[#666666] transition-colors hover:text-[#ff4444]"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>

        {eduDraft ? (
          <div className="rounded border border-[#1e1e1e] bg-[#0a0a0a] p-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className={labelClass}>Institute</label>
                <input value={eduDraft.institute} onChange={(e) => setEduDraft({ ...eduDraft, institute: e.target.value })} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Degree</label>
                <input value={eduDraft.degree} onChange={(e) => setEduDraft({ ...eduDraft, degree: e.target.value })} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Field</label>
                <input value={eduDraft.field} onChange={(e) => setEduDraft({ ...eduDraft, field: e.target.value })} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Start year</label>
                <input value={eduDraft.startYear} onChange={(e) => setEduDraft({ ...eduDraft, startYear: e.target.value })} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>End year</label>
                <input value={eduDraft.endYear} onChange={(e) => setEduDraft({ ...eduDraft, endYear: e.target.value })} className={inputClass} />
              </div>
              <div className="sm:col-span-2">
                <label className={labelClass}>Grade</label>
                <input value={eduDraft.grade} onChange={(e) => setEduDraft({ ...eduDraft, grade: e.target.value })} className={inputClass} />
              </div>
            </div>
            <div className="mt-3 flex justify-end gap-2">
              <button onClick={() => setEduDraft(null)} className="rounded border border-[#1e1e1e] px-3 py-1.5 font-['JetBrains_Mono'] text-xs text-[#888888]">
                Cancel
              </button>
              <button
                onClick={() => run(() => addEducation({
                  ...eduDraft,
                  startYear: Number(eduDraft.startYear) || null,
                  endYear: Number(eduDraft.endYear) || null,
                }))}
                disabled={!eduDraft.institute.trim() || busy}
                className="rounded bg-[#4ade80] px-3 py-1.5 font-['JetBrains_Mono'] text-xs text-black disabled:opacity-40"
              >
                Add
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setEduDraft({ institute: "", degree: "", field: "", startYear: "", endYear: "", grade: "" })}
            className="flex items-center gap-1.5 rounded border border-[#1e1e1e] px-3 py-2 font-['JetBrains_Mono'] text-xs text-white transition-colors hover:border-[#4ade80]"
          >
            <Plus className="h-3.5 w-3.5" /> Add education
          </button>
        )}
      </Section>

      <Section title="Experience">
        <div className="mb-3 flex flex-col gap-2">
          {(user?.experience || []).map((entry: any) => (
            <div key={entry._id} className="flex items-center gap-2 rounded border border-[#1e1e1e] bg-[#0a0a0a] px-3 py-2">
              <div className="min-w-0 flex-1">
                <div className="truncate font-['Archivo'] text-sm text-white">
                  {entry.role || entry.company}
                </div>
                <div className="truncate font-['Archivo'] text-[11px] text-[#666666]">
                  {[entry.role && entry.company, entry.employmentType].filter(Boolean).join(" · ")}
                </div>
              </div>
              <button
                onClick={() => run(() => deleteExperience(String(entry._id)))}
                disabled={busy}
                className="text-[#666666] transition-colors hover:text-[#ff4444]"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>

        {expDraft ? (
          <div className="rounded border border-[#1e1e1e] bg-[#0a0a0a] p-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className={labelClass}>Company</label>
                <input value={expDraft.company} onChange={(e) => setExpDraft({ ...expDraft, company: e.target.value })} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Role</label>
                <input value={expDraft.role} onChange={(e) => setExpDraft({ ...expDraft, role: e.target.value })} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Type</label>
                <select
                  value={expDraft.employmentType}
                  onChange={(e) => setExpDraft({ ...expDraft, employmentType: e.target.value })}
                  className={inputClass}
                >
                  {["internship", "full-time", "part-time", "freelance", "open-source", "other"].map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelClass}>Location</label>
                <input value={expDraft.location} onChange={(e) => setExpDraft({ ...expDraft, location: e.target.value })} className={inputClass} />
              </div>
              <div className="sm:col-span-2">
                <label className={labelClass}>Description</label>
                <textarea
                  value={expDraft.description}
                  onChange={(e) => setExpDraft({ ...expDraft, description: e.target.value })}
                  rows={3}
                  className={`${inputClass} resize-y`}
                />
              </div>
            </div>
            <div className="mt-3 flex justify-end gap-2">
              <button onClick={() => setExpDraft(null)} className="rounded border border-[#1e1e1e] px-3 py-1.5 font-['JetBrains_Mono'] text-xs text-[#888888]">
                Cancel
              </button>
              <button
                onClick={() => run(() => addExperience(expDraft))}
                disabled={!expDraft.company.trim() || busy}
                className="rounded bg-[#4ade80] px-3 py-1.5 font-['JetBrains_Mono'] text-xs text-black disabled:opacity-40"
              >
                Add
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setExpDraft({
              company: "", role: "", employmentType: "internship", location: "", description: "",
            })}
            className="flex items-center gap-1.5 rounded border border-[#1e1e1e] px-3 py-2 font-['JetBrains_Mono'] text-xs text-white transition-colors hover:border-[#4ade80]"
          >
            <Plus className="h-3.5 w-3.5" /> Add experience
          </button>
        )}
      </Section>
    </div>
  );
}

/* ----------------------------------------------------------------- extension */

function ExtensionTab() {
  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchExtensionToken()
      .then((res) => setToken(res.extensionToken))
      .catch((err) => setError(err.message || "Could not load your extension token"))
      .finally(() => setLoading(false));
  }, []);

  async function rotate() {
    try {
      const res = await rotateExtensionToken();
      setToken(res.extensionToken);
    } catch (err: any) {
      setError(err.message || "Could not rotate the token");
    }
  }

  return (
    <Section
      title="Browser extension"
      description="Save problems to your workspace without leaving LeetCode, Codeforces, CodeChef, GeeksforGeeks and more. Load the extension/ folder from the repository as an unpacked extension, then paste this token into its options page."
    >
      {error && <ErrorBanner message={error} />}
      {loading ? <Spinner /> : (
        <>
          <label className={labelClass}>Pairing token</label>
          <div className="flex items-center gap-2">
            <code className="flex-1 truncate rounded border border-[#1e1e1e] bg-[#0a0a0a] px-3 py-2 font-['JetBrains_Mono'] text-xs text-[#4ade80]">
              {token}
            </code>
            <button
              onClick={() => {
                navigator.clipboard?.writeText(token);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
              className="flex items-center gap-1.5 rounded border border-[#1e1e1e] px-3 py-2 font-['JetBrains_Mono'] text-xs text-white transition-colors hover:border-[#4ade80]"
            >
              {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <button
            onClick={rotate}
            className="mt-3 font-['JetBrains_Mono'] text-xs text-[#888888] transition-colors hover:text-[#ff6666]"
          >
            Rotate token (invalidates existing installs)
          </button>
        </>
      )}
    </Section>
  );
}

/* ---------------------------------------------------------------------- page */

const TABS: Array<{ key: Tab; label: string }> = [
  { key: "account", label: "Profile" },
  { key: "platforms", label: "Platforms" },
  { key: "projects", label: "Projects" },
  { key: "background", label: "Education & Work" },
  { key: "extension", label: "Extension" },
];

function EditProfileInner() {
  const [params, setParams] = useSearchParams();
  const tab = (params.get("tab") as Tab) || "account";

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      <PageHeader title="Edit profile" subtitle="Everything that appears on your public portfolio." />

      <div className="mb-5 flex flex-wrap gap-1 rounded bg-[#111111] p-1">
        {TABS.map((entry) => (
          <button
            key={entry.key}
            onClick={() => {
              const next = new URLSearchParams(params);
              if (entry.key === "account") next.delete("tab");
              else next.set("tab", entry.key);
              setParams(next, { replace: true });
            }}
            className={`flex items-center gap-1.5 rounded px-3 py-1.5 font-['JetBrains_Mono'] text-xs transition-colors ${
              tab === entry.key ? "bg-[#1e1e1e] text-white" : "text-[#888888] hover:text-white"
            }`}
          >
            {entry.key === "extension" && <Puzzle className="h-3 w-3" />}
            {entry.label}
          </button>
        ))}
      </div>

      {tab === "account" && <AccountTab />}
      {tab === "platforms" && <PlatformsTab />}
      {tab === "projects" && <ProjectsTab />}
      {tab === "background" && <BackgroundTab />}
      {tab === "extension" && <ExtensionTab />}
    </div>
  );
}

export function EditProfile() {
  return (
    <RequireAuth feature="profile settings">
      <EditProfileInner />
    </RequireAuth>
  );
}
