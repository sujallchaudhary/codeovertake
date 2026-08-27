import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import {
  PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer,
} from "recharts";
import {
  Award, BadgeCheck, Briefcase, ExternalLink, Github, GraduationCap, Globe, Linkedin,
  MapPin, RefreshCw, Settings, Share2, ThumbsUp, Trophy, Twitter,
} from "lucide-react";
import {
  fetchPortfolio, syncPortfolio, upvoteProject, type Portfolio as PortfolioData,
} from "../api";
import { useAuth } from "../AuthContext";
import {
  EmptyState, ErrorBanner, PLATFORM_COLORS, PlatformGlyph, ProgressBar, Spinner,
  formatRelativeTime, retentionColor,
} from "./TrackerUI";

/** C-Score card with the three pillars and a balance radar. */
function CScoreCard({ cScore }: { cScore: PortfolioData["cScore"] }) {
  const pillars = [
    { key: "dsa", label: "DSA", value: cScore.dsa, color: "#f59e0b" },
    { key: "cp", label: "CP", value: cScore.cp, color: "#60a5fa" },
    { key: "dev", label: "Dev", value: cScore.dev, color: "#4ade80" },
  ];
  const radarData = pillars.map((p) => ({ pillar: p.label, value: p.value }));

  return (
    <div className="rounded border border-[#1e1e1e] bg-[#111111] p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="font-['JetBrains_Mono'] text-[10px] uppercase tracking-widest text-[#666666]">
            C-Score
          </div>
          <div className="mt-1 font-['JetBrains_Mono'] text-4xl text-[#4ade80]">{cScore.total}</div>
          <div className="mt-0.5 font-['Archivo'] text-xs text-[#888888]">out of 1000</div>
          {typeof cScore.balance === "number" && (
            <div className="mt-2 font-['Archivo'] text-xs text-[#666666]">
              Balance {Math.round(cScore.balance * 100)}%
            </div>
          )}
        </div>

        <div className="h-32 w-32">
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart data={radarData} outerRadius="72%">
              <PolarGrid stroke="#1e1e1e" />
              <PolarAngleAxis dataKey="pillar" tick={{ fill: "#888888", fontSize: 10 }} />
              <PolarRadiusAxis domain={[0, 1000]} tick={false} axisLine={false} />
              <Radar dataKey="value" stroke="#4ade80" fill="#4ade80" fillOpacity={0.25} />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-2.5">
        {pillars.map((pillar) => (
          <div key={pillar.key}>
            <div className="mb-1 flex items-center justify-between font-['JetBrains_Mono'] text-[11px]">
              <span style={{ color: pillar.color }}>{pillar.label}</span>
              <span className="text-[#888888]">{pillar.value}</span>
            </div>
            <ProgressBar value={pillar.value} max={1000} color={pillar.color} className="h-1" />
          </div>
        ))}
      </div>

      <p className="mt-3 font-['Archivo'] text-[11px] leading-relaxed text-[#666666]">
        C-Score blends your strongest platform in each pillar, then rewards being balanced across
        all three rather than spiking in one.
      </p>
    </div>
  );
}

function PlatformCard({ platform }: { platform: PortfolioData["platforms"][number] }) {
  const color = PLATFORM_COLORS[platform.key] || "#888888";
  const stats = platform.profileStats
    .map((entry) => ({ label: entry.label, value: platform.stats?.[entry.statKey] }))
    .filter((entry) => entry.value !== undefined && entry.value !== null);

  return (
    <div className="rounded border border-[#1e1e1e] bg-[#111111] p-4">
      <div className="mb-3 flex items-center gap-2">
        <PlatformGlyph platform={platform.key} className="h-4 w-4" />
        <span className="font-['JetBrains_Mono'] text-sm" style={{ color }}>
          {platform.label}
        </span>
        {platform.verified && (
          <span title="Verified account" className="flex items-center">
            <BadgeCheck className="h-3.5 w-3.5 text-[#4ade80]" />
          </span>
        )}
        <a
          href={platform.profileUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="ml-auto text-[#555555] transition-colors hover:text-white"
        >
          <ExternalLink className="h-3 w-3" />
        </a>
      </div>

      <div className="mb-3 font-['Archivo'] text-xs text-[#888888]">@{platform.username}</div>

      {!platform.statsSupported ? (
        <p className="font-['Archivo'] text-[11px] leading-relaxed text-[#666666]">
          Linked profile. {platform.label} does not expose public stats, so nothing is auto-fetched
          from here.
        </p>
      ) : stats.length === 0 ? (
        <p className="font-['Archivo'] text-[11px] text-[#666666]">
          {platform.lastFetchFailed ? "Last refresh failed. Try syncing again." : "No stats yet."}
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {stats.map((entry) => (
            <div key={entry.label}>
              <div className="font-['JetBrains_Mono'] text-[10px] uppercase tracking-wider text-[#666666]">
                {entry.label}
              </div>
              <div className="font-['JetBrains_Mono'] text-sm text-white">
                {typeof entry.value === "number" ? entry.value.toLocaleString() : String(entry.value)}
              </div>
            </div>
          ))}
        </div>
      )}

      {platform.statsSupported && (
        <div className="mt-3 border-t border-[#1a1a1a] pt-2 font-['JetBrains_Mono'] text-[10px] text-[#555555]">
          score {platform.score} · updated {formatRelativeTime(platform.lastFetchedAt)}
        </div>
      )}
    </div>
  );
}

function ProjectCard({
  project, handle, canUpvote, onUpvoted,
}: {
  project: any;
  handle: string;
  canUpvote: boolean;
  onUpvoted: (id: string, upvotes: number, hasUpvoted: boolean) => void;
}) {
  const [busy, setBusy] = useState(false);

  async function vote() {
    setBusy(true);
    try {
      const res = await upvoteProject(handle, project.id);
      onUpvoted(project.id, res.upvotes, res.upvoted);
    } catch {
      /* already surfaced by the parent's error banner if it matters */
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col overflow-hidden rounded border border-[#1e1e1e] bg-[#111111] transition-colors hover:border-[#333333]">
      {project.images?.[0] && (
        <img
          src={project.images[0]}
          alt={project.title}
          className="h-36 w-full object-cover"
          loading="lazy"
        />
      )}
      <div className="flex flex-1 flex-col p-4">
        <h3 className="font-['Archivo'] text-sm text-white">{project.title}</h3>
        {project.description && (
          <p className="mt-1.5 line-clamp-3 font-['Archivo'] text-xs leading-relaxed text-[#888888]">
            {project.description}
          </p>
        )}

        {project.techStack?.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1">
            {project.techStack.slice(0, 6).map((tech: string) => (
              <span
                key={tech}
                className="rounded bg-[#1a1a1a] px-1.5 py-0.5 font-['JetBrains_Mono'] text-[10px] text-[#aaaaaa]"
              >
                {tech}
              </span>
            ))}
          </div>
        )}

        <div className="mt-auto flex items-center gap-2 pt-3">
          {project.repoUrl && (
            <a
              href={project.repoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 font-['JetBrains_Mono'] text-[11px] text-[#888888] transition-colors hover:text-white"
            >
              <Github className="h-3 w-3" /> Code
            </a>
          )}
          {project.demoUrl && (
            <a
              href={project.demoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 font-['JetBrains_Mono'] text-[11px] text-[#4ade80] transition-opacity hover:opacity-80"
            >
              <ExternalLink className="h-3 w-3" /> Demo
            </a>
          )}
          <button
            onClick={vote}
            disabled={!canUpvote || busy}
            title={canUpvote ? "Upvote this project" : "Sign in to upvote"}
            className={`ml-auto flex items-center gap-1 rounded px-2 py-1 font-['JetBrains_Mono'] text-[11px] transition-colors disabled:cursor-not-allowed ${
              project.hasUpvoted ? "bg-[#4ade80]/15 text-[#4ade80]" : "text-[#888888] hover:text-white"
            }`}
          >
            <ThumbsUp className={`h-3 w-3 ${project.hasUpvoted ? "fill-current" : ""}`} />
            {project.upvotes || 0}
          </button>
        </div>
      </div>
    </div>
  );
}

export function Portfolio() {
  const { handle: routeHandle } = useParams();
  const { user, isAuthenticated } = useAuth();

  // /portfolio with no handle means "my own profile"
  const handle = routeHandle || user?.handle || "";

  const [data, setData] = useState<PortfolioData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    if (!handle) { setLoading(false); return; }
    setLoading(true);
    setError("");
    try {
      setData(await fetchPortfolio(handle));
    } catch (err: any) {
      setError(err.message || "Could not load that profile");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [handle]);

  useEffect(() => { load(); }, [load]);

  async function handleSync() {
    setSyncing(true);
    setError("");
    try {
      const res = await syncPortfolio(true);
      if (!res.synced && res.cooldown) {
        setError(`Just synced. Try again in ${Math.ceil((res.retryInSeconds || 0) / 60)} minute(s).`);
      }
      await load();
    } catch (err: any) {
      setError(err.message || "Sync failed");
    } finally {
      setSyncing(false);
    }
  }

  function share() {
    navigator.clipboard?.writeText(`${window.location.origin}/u/${handle}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (!handle) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
        <EmptyState
          icon={<Award className="h-8 w-8" strokeWidth={1.5} />}
          title="Sign in to see your portfolio"
          description="Your portfolio aggregates every platform you connect into one recruiter-ready link."
          action={(
            <Link to="/login" className="rounded bg-[#4ade80] px-4 py-2 font-['JetBrains_Mono'] text-sm text-black">
              Sign in
            </Link>
          )}
        />
      </div>
    );
  }

  if (loading) return <Spinner label="Loading portfolio..." />;

  if (!data) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
        <EmptyState title="Profile unavailable" description={error || "This profile does not exist."} />
      </div>
    );
  }

  const { profile, cScore, platforms, projects, education, experience, practice, devCard } = data;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      {error && <ErrorBanner message={error} />}

      {/* Header */}
      <div className="mb-6 flex flex-wrap items-start gap-4">
        <img
          src={profile.avatarUrl || `https://api.dicebear.com/9.x/identicon/svg?seed=${profile.handle}`}
          alt={profile.name}
          className="h-16 w-16 shrink-0 rounded border border-[#1e1e1e] bg-[#111111]"
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-['JetBrains_Mono'] text-xl tracking-tight text-white">{profile.name}</h1>
            {devCard.unlocked && (
              <span
                title="Dev Card unlocked: at least one platform verified"
                className="flex items-center gap-1 rounded bg-[#4ade80]/15 px-1.5 py-0.5 font-['JetBrains_Mono'] text-[10px] text-[#4ade80]"
              >
                <BadgeCheck className="h-3 w-3" /> Verified
              </span>
            )}
          </div>
          <p className="font-['JetBrains_Mono'] text-xs text-[#666666]">/u/{profile.handle}</p>
          {profile.headline && (
            <p className="mt-1.5 font-['Archivo'] text-sm text-[#aaaaaa]">{profile.headline}</p>
          )}

          <div className="mt-2 flex flex-wrap items-center gap-3 font-['Archivo'] text-xs text-[#888888]">
            {profile.location && (
              <span className="flex items-center gap-1">
                <MapPin className="h-3 w-3" /> {profile.location}
              </span>
            )}
            {profile.socials?.website && (
              <a href={profile.socials.website} target="_blank" rel="noopener noreferrer" className="transition-colors hover:text-white">
                <Globe className="h-3.5 w-3.5" />
              </a>
            )}
            {profile.socials?.linkedin && (
              <a href={profile.socials.linkedin} target="_blank" rel="noopener noreferrer" className="transition-colors hover:text-white">
                <Linkedin className="h-3.5 w-3.5" />
              </a>
            )}
            {profile.socials?.twitter && (
              <a href={profile.socials.twitter} target="_blank" rel="noopener noreferrer" className="transition-colors hover:text-white">
                <Twitter className="h-3.5 w-3.5" />
              </a>
            )}
            {profile.rollno && (
              <Link
                to={`/student/${profile.rollno}`}
                className="flex items-center gap-1 text-[#4ade80] transition-opacity hover:opacity-80"
              >
                <Trophy className="h-3 w-3" /> Leaderboard profile
              </Link>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={share}
            className="flex items-center gap-1.5 rounded border border-[#1e1e1e] px-3 py-2 font-['JetBrains_Mono'] text-xs text-white transition-colors hover:border-[#4ade80]"
          >
            <Share2 className="h-3.5 w-3.5" />
            {copied ? "Copied" : "Share"}
          </button>
          {data.isOwner && (
            <>
              <button
                onClick={handleSync}
                disabled={syncing}
                className="flex items-center gap-1.5 rounded border border-[#1e1e1e] px-3 py-2 font-['JetBrains_Mono'] text-xs text-white transition-colors hover:border-[#4ade80] disabled:opacity-50"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`} />
                Sync
              </button>
              <Link
                to="/settings"
                className="flex items-center gap-1.5 rounded bg-[#4ade80] px-3 py-2 font-['JetBrains_Mono'] text-xs text-black transition-opacity hover:opacity-90"
              >
                <Settings className="h-3.5 w-3.5" />
                Edit profile
              </Link>
            </>
          )}
        </div>
      </div>

      {profile.about && (
        <div className="mb-6 rounded border border-[#1e1e1e] bg-[#111111] p-4">
          <div className="mb-1.5 font-['JetBrains_Mono'] text-[10px] uppercase tracking-widest text-[#666666]">
            About
          </div>
          <p className="whitespace-pre-wrap font-['Archivo'] text-sm leading-relaxed text-[#aaaaaa]">
            {profile.about}
          </p>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[320px_1fr]">
        {/* Left column */}
        <div className="flex flex-col gap-4">
          <CScoreCard cScore={cScore} />

          {/* Practice proof */}
          <div className="rounded border border-[#1e1e1e] bg-[#111111] p-4">
            <div className="mb-3 font-['JetBrains_Mono'] text-[10px] uppercase tracking-widest text-[#666666]">
              Practice
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="font-['JetBrains_Mono'] text-xl text-white">{practice.solved}</div>
                <div className="font-['Archivo'] text-[11px] text-[#666666]">solved & tracked</div>
              </div>
              <div>
                <div
                  className="font-['JetBrains_Mono'] text-xl"
                  style={{ color: retentionColor(practice.retentionRating) }}
                >
                  {practice.retentionRating}%
                </div>
                <div className="font-['Archivo'] text-[11px] text-[#666666]">retention</div>
              </div>
              <div>
                <div className="font-['JetBrains_Mono'] text-xl text-[#f59e0b]">{practice.revisionStreak}</div>
                <div className="font-['Archivo'] text-[11px] text-[#666666]">revision streak</div>
              </div>
              <div>
                <div className="font-['JetBrains_Mono'] text-xl text-white">{practice.tracked}</div>
                <div className="font-['Archivo'] text-[11px] text-[#666666]">questions tracked</div>
              </div>
            </div>
          </div>

          {/* Education */}
          {education.length > 0 && (
            <div className="rounded border border-[#1e1e1e] bg-[#111111] p-4">
              <div className="mb-3 flex items-center gap-1.5 font-['JetBrains_Mono'] text-[10px] uppercase tracking-widest text-[#666666]">
                <GraduationCap className="h-3 w-3" /> Education
              </div>
              <div className="flex flex-col gap-3">
                {education.map((entry: any) => (
                  <div key={entry._id}>
                    <div className="font-['Archivo'] text-sm text-white">{entry.institute}</div>
                    <div className="font-['Archivo'] text-xs text-[#888888]">
                      {[entry.degree, entry.field].filter(Boolean).join(", ")}
                    </div>
                    <div className="font-['JetBrains_Mono'] text-[10px] text-[#666666]">
                      {[entry.startYear, entry.endYear].filter(Boolean).join(" – ")}
                      {entry.grade && ` · ${entry.grade}`}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Experience */}
          {experience.length > 0 && (
            <div className="rounded border border-[#1e1e1e] bg-[#111111] p-4">
              <div className="mb-3 flex items-center gap-1.5 font-['JetBrains_Mono'] text-[10px] uppercase tracking-widest text-[#666666]">
                <Briefcase className="h-3 w-3" /> Experience
              </div>
              <div className="flex flex-col gap-3">
                {experience.map((entry: any) => (
                  <div key={entry._id}>
                    <div className="font-['Archivo'] text-sm text-white">{entry.role || entry.company}</div>
                    <div className="font-['Archivo'] text-xs text-[#888888]">
                      {entry.role ? entry.company : ""}
                      {entry.employmentType && ` · ${entry.employmentType}`}
                    </div>
                    <div className="font-['JetBrains_Mono'] text-[10px] text-[#666666]">
                      {entry.startDate ? new Date(entry.startDate).getFullYear() : ""}
                      {entry.current ? " – present" : entry.endDate ? ` – ${new Date(entry.endDate).getFullYear()}` : ""}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right column */}
        <div className="flex flex-col gap-5">
          {/* Platforms */}
          <div>
            <h2 className="mb-3 font-['JetBrains_Mono'] text-sm text-white">Coding profiles</h2>
            {platforms.length === 0 ? (
              <EmptyState
                title="No platforms connected"
                description={data.isOwner
                  ? "Connect LeetCode, Codeforces, GitHub and more to build your unified profile."
                  : "This developer has not connected any platforms yet."}
                action={data.isOwner && (
                  <Link to="/settings" className="rounded bg-[#4ade80] px-4 py-2 font-['JetBrains_Mono'] text-sm text-black">
                    Connect platforms
                  </Link>
                )}
              />
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {platforms.map((platform) => (
                  <PlatformCard key={platform.key} platform={platform} />
                ))}
              </div>
            )}
          </div>

          {/* Projects */}
          <div>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-['JetBrains_Mono'] text-sm text-white">Projects</h2>
              {data.isOwner && (
                <Link
                  to="/settings?tab=projects"
                  className="font-['JetBrains_Mono'] text-[11px] text-[#4ade80] transition-opacity hover:opacity-80"
                >
                  Manage
                </Link>
              )}
            </div>
            {projects.length === 0 ? (
              <EmptyState
                title="No projects yet"
                description={data.isOwner
                  ? "Coding is not only algorithms. Showcase what you have built straight from your GitHub repositories."
                  : "No projects on show."}
                action={data.isOwner && (
                  <Link to="/settings?tab=projects" className="rounded bg-[#4ade80] px-4 py-2 font-['JetBrains_Mono'] text-sm text-black">
                    Add a project
                  </Link>
                )}
              />
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {projects.map((project: any) => (
                  <ProjectCard
                    key={project.id}
                    project={project}
                    handle={profile.handle}
                    canUpvote={isAuthenticated && !data.isOwner}
                    onUpvoted={(id, upvotes, hasUpvoted) => setData((current) => (current ? {
                      ...current,
                      projects: current.projects.map((p: any) => (
                        p.id === id ? { ...p, upvotes, hasUpvoted } : p
                      )),
                    } : current))}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
