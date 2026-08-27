import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CalendarDays, CalendarPlus, ChevronLeft, ChevronRight, ExternalLink, Timer, X,
} from "lucide-react";
import { fetchContestCalendar, fetchUpcomingContests, type Contest } from "../api";
import {
  ErrorBanner, PLATFORM_COLORS, PLATFORM_LABELS, PageHeader, PlatformGlyph, Spinner,
  formatDuration,
} from "./TrackerUI";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const PLATFORMS = ["leetcode", "codeforces", "codechef", "atcoder"];

/** Local YYYY-MM-DD, so calendar cells line up with the user's own timezone. */
function localDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function startOfMonthGrid(year: number, month: number) {
  // month is 0-indexed here; back up to the Sunday on/before the 1st
  const first = new Date(year, month, 1);
  const start = new Date(first);
  start.setDate(first.getDate() - first.getDay());
  return start;
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString([], {
    weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
  });
}

/** Live "starts in 3h 20m" countdown text. */
function useCountdown(iso?: string) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  if (!iso) return "";
  const diff = new Date(iso).getTime() - now;
  if (diff <= 0) return "";
  const totalMinutes = Math.floor(diff / 60000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `in ${days}d ${hours}h`;
  if (hours > 0) return `in ${hours}h ${minutes}m`;
  return `in ${minutes}m`;
}

function ContestRow({ contest, onSelect }: { contest: Contest; onSelect: () => void }) {
  const countdown = useCountdown(contest.startTime);
  const color = PLATFORM_COLORS[contest.platform] || "#888888";

  return (
    <button
      type="button"
      onClick={onSelect}
      className="flex w-full items-start gap-3 border-b border-[#1e1e1e] px-3 py-3 text-left transition-colors last:border-0 hover:bg-[#161616]"
    >
      <span
        className="mt-1 h-2 w-2 shrink-0 rounded-full"
        style={{ backgroundColor: color }}
      />
      <div className="min-w-0 flex-1">
        <div className="truncate font-['Archivo'] text-sm text-white">{contest.name}</div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 font-['JetBrains_Mono'] text-[11px] text-[#888888]">
          <span style={{ color }}>{PLATFORM_LABELS[contest.platform]}</span>
          <span>·</span>
          <span>{formatDateTime(contest.startTime)}</span>
          <span>·</span>
          <span>{formatDuration(contest.durationSeconds)}</span>
        </div>
      </div>
      {contest.status === "ongoing" ? (
        <span className="shrink-0 rounded bg-[#4ade80]/15 px-1.5 py-0.5 font-['JetBrains_Mono'] text-[10px] uppercase text-[#4ade80]">
          Live
        </span>
      ) : (
        countdown && (
          <span className="shrink-0 font-['JetBrains_Mono'] text-[10px] text-[#666666]">{countdown}</span>
        )
      )}
    </button>
  );
}

function ContestDetail({ contest, onClose }: { contest: Contest; onClose: () => void }) {
  const countdown = useCountdown(contest.startTime);
  const color = PLATFORM_COLORS[contest.platform] || "#888888";

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded border border-[#1e1e1e] bg-[#111111] p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="flex items-start gap-2.5">
            <span className="mt-0.5 h-5 w-5"><PlatformGlyph platform={contest.platform} className="h-5 w-5" /></span>
            <div>
              <h2 className="font-['Archivo'] text-base leading-snug text-white">{contest.name}</h2>
              <p className="mt-0.5 font-['JetBrains_Mono'] text-xs" style={{ color }}>
                {PLATFORM_LABELS[contest.platform]}
                {contest.contestType && ` · ${contest.contestType}`}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-[#666666] transition-colors hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mb-5 grid grid-cols-2 gap-3">
          <div className="rounded border border-[#1e1e1e] bg-[#0a0a0a] p-3">
            <div className="font-['JetBrains_Mono'] text-[10px] uppercase tracking-widest text-[#666666]">Starts</div>
            <div className="mt-1 font-['Archivo'] text-sm text-white">{formatDateTime(contest.startTime)}</div>
            {countdown && <div className="mt-0.5 font-['JetBrains_Mono'] text-[11px] text-[#4ade80]">{countdown}</div>}
          </div>
          <div className="rounded border border-[#1e1e1e] bg-[#0a0a0a] p-3">
            <div className="font-['JetBrains_Mono'] text-[10px] uppercase tracking-widest text-[#666666]">Duration</div>
            <div className="mt-1 font-['Archivo'] text-sm text-white">{formatDuration(contest.durationSeconds)}</div>
            {contest.ratedRange && (
              <div className="mt-0.5 font-['JetBrains_Mono'] text-[11px] text-[#888888]">Rated {contest.ratedRange}</div>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <a
            href={contest.registrationUrl || contest.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex flex-1 items-center justify-center gap-2 rounded bg-[#4ade80] px-4 py-2 font-['JetBrains_Mono'] text-sm text-black transition-opacity hover:opacity-90"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Register
          </a>
          {/* Opens Google Calendar prefilled; nothing is stored on our side */}
          <a
            href={contest.googleCalendarUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex flex-1 items-center justify-center gap-2 rounded border border-[#1e1e1e] px-4 py-2 font-['JetBrains_Mono'] text-sm text-white transition-colors hover:border-[#4ade80]"
          >
            <CalendarPlus className="h-3.5 w-3.5" />
            Add to Calendar
          </a>
        </div>
      </div>
    </div>
  );
}

export function Contests() {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth()); // 0-indexed
  const [enabled, setEnabled] = useState<string[]>(PLATFORMS);

  const [monthContests, setMonthContests] = useState<Contest[]>([]);
  const [upcoming, setUpcoming] = useState<Contest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<Contest | null>(null);

  const platformParam = enabled.length === PLATFORMS.length ? undefined : enabled.join(",");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [cal, next] = await Promise.all([
        fetchContestCalendar(year, month + 1, platformParam),
        fetchUpcomingContests({ platforms: platformParam, limit: 25 }),
      ]);
      setMonthContests(cal.contests);
      setUpcoming(next.contests);
    } catch (err: any) {
      setError(err.message || "Could not load contests");
    } finally {
      setLoading(false);
    }
  }, [year, month, platformParam]);

  useEffect(() => { load(); }, [load]);

  /**
   * Re-bucket by *local* date. The API groups by UTC day, which would shift
   * contests into the wrong cell for users far from UTC.
   */
  const byLocalDate = useMemo(() => {
    const map: Record<string, Contest[]> = {};
    for (const contest of monthContests) {
      const start = new Date(contest.startTime);
      const end = new Date(contest.endTime);
      const cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate());
      while (cursor <= end) {
        const key = localDateKey(cursor);
        if (!map[key]) map[key] = [];
        map[key].push(contest);
        cursor.setDate(cursor.getDate() + 1);
      }
    }
    return map;
  }, [monthContests]);

  const grid = useMemo(() => {
    const start = startOfMonthGrid(year, month);
    return Array.from({ length: 42 }, (_, i) => {
      const date = new Date(start);
      date.setDate(start.getDate() + i);
      return date;
    });
  }, [year, month]);

  function shiftMonth(delta: number) {
    const next = new Date(year, month + delta, 1);
    setYear(next.getFullYear());
    setMonth(next.getMonth());
  }

  function togglePlatform(key: string) {
    setEnabled((current) => (
      current.includes(key) ? current.filter((k) => k !== key) : [...current, key]
    ));
  }

  const todayKey = localDateKey(today);
  const monthLabel = new Date(year, month, 1).toLocaleString([], { month: "long", year: "numeric" });

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <PageHeader
        title="Contest Tracker"
        subtitle="Every contest from LeetCode, Codeforces, CodeChef and AtCoder in one calendar."
      />

      {error && <ErrorBanner message={error} />}

      {/* Platform filters */}
      <div className="mb-5 flex flex-wrap items-center gap-2">
        {PLATFORMS.map((key) => {
          const active = enabled.includes(key);
          const color = PLATFORM_COLORS[key];
          return (
            <button
              key={key}
              onClick={() => togglePlatform(key)}
              className={`flex items-center gap-1.5 rounded border px-2.5 py-1.5 font-['JetBrains_Mono'] text-xs transition-colors ${
                active ? "border-transparent" : "border-[#1e1e1e] text-[#666666]"
              }`}
              style={active ? { backgroundColor: `${color}1a`, color } : undefined}
            >
              <PlatformGlyph platform={key} className="h-3 w-3" />
              {PLATFORM_LABELS[key]}
            </button>
          );
        })}
        {enabled.length === 0 && (
          <span className="font-['Archivo'] text-xs text-[#666666]">
            Select at least one platform to see contests.
          </span>
        )}
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
        {/* Calendar */}
        <div className="rounded border border-[#1e1e1e] bg-[#111111] p-3 sm:p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-['JetBrains_Mono'] text-sm text-white">{monthLabel}</h2>
            <div className="flex items-center gap-1">
              <button
                onClick={() => shiftMonth(-1)}
                className="flex h-7 w-7 items-center justify-center rounded text-[#888888] transition-colors hover:bg-[#1a1a1a] hover:text-white"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                onClick={() => { setYear(today.getFullYear()); setMonth(today.getMonth()); }}
                className="rounded px-2 py-1 font-['JetBrains_Mono'] text-[11px] text-[#888888] transition-colors hover:bg-[#1a1a1a] hover:text-white"
              >
                Today
              </button>
              <button
                onClick={() => shiftMonth(1)}
                className="flex h-7 w-7 items-center justify-center rounded text-[#888888] transition-colors hover:bg-[#1a1a1a] hover:text-white"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="mb-1 grid grid-cols-7 gap-1">
            {WEEKDAYS.map((day) => (
              <div
                key={day}
                className="py-1 text-center font-['JetBrains_Mono'] text-[10px] uppercase tracking-wider text-[#555555]"
              >
                {day.slice(0, 1)}
                <span className="hidden sm:inline">{day.slice(1)}</span>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {grid.map((date) => {
              const key = localDateKey(date);
              const inMonth = date.getMonth() === month;
              const dayContests = byLocalDate[key] || [];
              const isToday = key === todayKey;

              return (
                <div
                  key={key}
                  className={`min-h-[64px] rounded border p-1 sm:min-h-[84px] ${
                    isToday ? "border-[#4ade80]/50 bg-[#4ade80]/5" : "border-[#1a1a1a]"
                  } ${inMonth ? "" : "opacity-35"}`}
                >
                  <div className={`mb-1 px-0.5 font-['JetBrains_Mono'] text-[10px] ${
                    isToday ? "text-[#4ade80]" : "text-[#666666]"
                  }`}
                  >
                    {date.getDate()}
                  </div>
                  <div className="flex flex-col gap-0.5">
                    {dayContests.slice(0, 3).map((contest) => {
                      const color = PLATFORM_COLORS[contest.platform] || "#888888";
                      return (
                        <button
                          key={`${key}-${contest.id}`}
                          onClick={() => setSelected(contest)}
                          title={`${contest.name} · ${formatTime(contest.startTime)}`}
                          className="truncate rounded px-1 py-0.5 text-left font-['JetBrains_Mono'] text-[9px] leading-tight transition-opacity hover:opacity-80"
                          style={{ backgroundColor: `${color}22`, color }}
                        >
                          {contest.name}
                        </button>
                      );
                    })}
                    {dayContests.length > 3 && (
                      <span className="px-1 font-['JetBrains_Mono'] text-[9px] text-[#666666]">
                        +{dayContests.length - 3} more
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Upcoming list panel */}
        <div className="rounded border border-[#1e1e1e] bg-[#111111]">
          <div className="flex items-center gap-2 border-b border-[#1e1e1e] px-3 py-2.5">
            <Timer className="h-3.5 w-3.5 text-[#4ade80]" />
            <h2 className="font-['JetBrains_Mono'] text-xs uppercase tracking-widest text-[#888888]">
              What&apos;s next
            </h2>
          </div>

          {loading ? (
            <Spinner label="Loading contests..." />
          ) : upcoming.length === 0 ? (
            <div className="px-3 py-10 text-center font-['Archivo'] text-sm text-[#666666]">
              <CalendarDays className="mx-auto mb-2 h-6 w-6 text-[#333333]" />
              No upcoming contests for these platforms.
            </div>
          ) : (
            <div className="max-h-[560px] overflow-y-auto">
              {upcoming.map((contest) => (
                <ContestRow key={contest.id} contest={contest} onSelect={() => setSelected(contest)} />
              ))}
            </div>
          )}
        </div>
      </div>

      {selected && <ContestDetail contest={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
