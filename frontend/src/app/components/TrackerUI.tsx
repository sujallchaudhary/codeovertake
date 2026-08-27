import type { ReactNode } from "react";
import { Link } from "react-router";
import { Loader2, Lock } from "lucide-react";
import { useAuth } from "../AuthContext";
import {
  GithubIcon, LeetcodeIcon, CodeforcesIcon, CodechefIcon,
} from "./PlatformIcons";

/**
 * Shared presentational building blocks for the tracker/portfolio pages.
 * Kept in one place so difficulty colours, platform chips and empty states stay
 * consistent across the Workspace, Sheets, Company Kits and Revision screens.
 */

/* --------------------------------------------------------------- difficulty */

export const DIFFICULTY_COLORS: Record<string, string> = {
  easy: "#4ade80",
  medium: "#f59e0b",
  hard: "#ff4444",
  unrated: "#888888",
};

export function DifficultyBadge({ difficulty }: { difficulty?: string }) {
  const key = difficulty || "unrated";
  const color = DIFFICULTY_COLORS[key] || DIFFICULTY_COLORS.unrated;
  return (
    <span
      className="inline-flex shrink-0 items-center rounded px-1.5 py-0.5 font-['JetBrains_Mono'] text-[10px] uppercase tracking-wider"
      style={{ color, backgroundColor: `${color}1a` }}
    >
      {key}
    </span>
  );
}

/* ----------------------------------------------------------------- platform */

export const PLATFORM_COLORS: Record<string, string> = {
  github: "#4ade80",
  leetcode: "#f59e0b",
  codeforces: "#60a5fa",
  codechef: "#a78bfa",
  atcoder: "#f472b6",
  geeksforgeeks: "#2f8d46",
  hackerrank: "#00ea64",
  interviewbit: "#38bdf8",
  codestudio: "#fb923c",
  spoj: "#94a3b8",
  hackerearth: "#818cf8",
  other: "#888888",
};

export const PLATFORM_LABELS: Record<string, string> = {
  github: "GitHub",
  leetcode: "LeetCode",
  codeforces: "Codeforces",
  codechef: "CodeChef",
  atcoder: "AtCoder",
  geeksforgeeks: "GeeksforGeeks",
  hackerrank: "HackerRank",
  interviewbit: "InterviewBit",
  codestudio: "Code360",
  spoj: "SPOJ",
  hackerearth: "HackerEarth",
  other: "Other",
};

/** Inline SVG icon when we have one, otherwise a coloured initial. */
export function PlatformGlyph({ platform, className = "h-3.5 w-3.5" }: { platform: string; className?: string }) {
  const color = PLATFORM_COLORS[platform] || PLATFORM_COLORS.other;
  const icons: Record<string, ReactNode> = {
    github: <GithubIcon />,
    leetcode: <LeetcodeIcon />,
    codeforces: <CodeforcesIcon />,
    codechef: <CodechefIcon />,
  };
  if (icons[platform]) {
    return (
      <span className={className} style={{ color }} title={PLATFORM_LABELS[platform]}>
        {icons[platform]}
      </span>
    );
  }
  return (
    <span
      className={`${className} inline-flex items-center justify-center rounded-sm font-['JetBrains_Mono'] text-[9px] font-bold`}
      style={{ color, backgroundColor: `${color}22` }}
      title={PLATFORM_LABELS[platform] || platform}
    >
      {(PLATFORM_LABELS[platform] || platform).slice(0, 1)}
    </span>
  );
}

export function PlatformBadge({ platform }: { platform: string }) {
  const color = PLATFORM_COLORS[platform] || PLATFORM_COLORS.other;
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 font-['JetBrains_Mono'] text-[10px]"
      style={{ color, backgroundColor: `${color}14` }}
    >
      {PLATFORM_LABELS[platform] || platform}
    </span>
  );
}

/* ------------------------------------------------------------------ generic */

export function ProgressBar({
  value, max, color = "#4ade80", className = "h-1.5",
}: { value: number; max: number; color?: string; className?: string }) {
  const percent = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div className={`w-full overflow-hidden rounded-full bg-[#1e1e1e] ${className}`}>
      <div
        className="h-full rounded-full transition-all duration-500"
        style={{ width: `${percent}%`, backgroundColor: color }}
      />
    </div>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-16 font-['Archivo'] text-sm text-[#888888]">
      <Loader2 className="h-4 w-4 animate-spin" />
      {label || "Loading..."}
    </div>
  );
}

export function EmptyState({
  icon, title, description, action,
}: { icon?: ReactNode; title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded border border-[#1e1e1e] bg-[#111111] px-6 py-14 text-center">
      {icon && <div className="mb-3 text-[#444444]">{icon}</div>}
      <h3 className="font-['JetBrains_Mono'] text-sm text-white">{title}</h3>
      {description && (
        <p className="mt-1.5 max-w-md font-['Archivo'] text-sm leading-relaxed text-[#888888]">
          {description}
        </p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function PageHeader({
  title, subtitle, actions,
}: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="font-['JetBrains_Mono'] text-xl tracking-tight text-white sm:text-2xl">{title}</h1>
        {subtitle && (
          <p className="mt-1 font-['Archivo'] text-sm text-[#888888]">{subtitle}</p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export function StatCard({
  label, value, hint, color = "#ffffff",
}: { label: string; value: ReactNode; hint?: string; color?: string }) {
  return (
    <div className="rounded border border-[#1e1e1e] bg-[#111111] p-4">
      <div className="font-['JetBrains_Mono'] text-[10px] uppercase tracking-widest text-[#666666]">
        {label}
      </div>
      <div className="mt-1.5 font-['JetBrains_Mono'] text-2xl" style={{ color }}>{value}</div>
      {hint && <div className="mt-0.5 font-['Archivo'] text-xs text-[#666666]">{hint}</div>}
    </div>
  );
}

/** Small pill used for tags across the tracker. */
export function Tag({
  children, onRemove, active, onClick,
}: { children: ReactNode; onRemove?: () => void; active?: boolean; onClick?: () => void }) {
  return (
    <span
      onClick={onClick}
      className={`inline-flex items-center gap-1 rounded px-2 py-0.5 font-['Archivo'] text-xs transition-colors ${
        active
          ? "bg-[#4ade80]/15 text-[#4ade80]"
          : "bg-[#1a1a1a] text-[#aaaaaa]"
      } ${onClick ? "cursor-pointer hover:text-white" : ""}`}
    >
      {children}
      {onRemove && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          className="text-[#666666] transition-colors hover:text-[#ff4444]"
        >
          ×
        </button>
      )}
    </span>
  );
}

export function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="mb-4 rounded border border-[#ff4444]/30 bg-[#ff4444]/10 px-3 py-2 font-['Archivo'] text-sm text-[#ff8888]">
      {message}
    </div>
  );
}

/**
 * Gate for the personal features. Rather than redirecting (which loses context),
 * it explains what signing in unlocks — the tracker is the reason to have an
 * account at all.
 */
export function RequireAuth({ children, feature }: { children: ReactNode; feature: string }) {
  const { isAuthenticated, loading } = useAuth();

  if (loading) return <Spinner label="Checking your session..." />;

  if (!isAuthenticated) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <EmptyState
          icon={<Lock className="h-8 w-8" strokeWidth={1.5} />}
          title={`Sign in to use ${feature}`}
          description={`${feature} is personal to your account. Create a free CodeOvertake account to track questions, follow sheets, build your revision streak and publish a portfolio.`}
          action={(
            <div className="flex items-center justify-center gap-2">
              <Link
                to="/login"
                className="rounded bg-[#4ade80] px-4 py-2 font-['JetBrains_Mono'] text-sm text-black transition-opacity hover:opacity-90"
              >
                Sign in
              </Link>
              <Link
                to="/signup"
                className="rounded border border-[#1e1e1e] px-4 py-2 font-['JetBrains_Mono'] text-sm text-white transition-colors hover:border-[#4ade80]"
              >
                Create account
              </Link>
            </div>
          )}
        />
      </div>
    );
  }

  return <>{children}</>;
}

/* ------------------------------------------------------------------ helpers */

export function formatRelativeTime(iso?: string | null) {
  if (!iso) return "never";
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

export function formatDuration(seconds: number) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.round((seconds % 3600) / 60);
  if (hours && minutes) return `${hours}h ${minutes}m`;
  if (hours) return `${hours}h`;
  return `${minutes}m`;
}

/** Colour for a 0-100 retention/memory score. */
export function retentionColor(score: number) {
  if (score >= 70) return "#4ade80";
  if (score >= 50) return "#f59e0b";
  if (score >= 25) return "#fb923c";
  return "#ff4444";
}
