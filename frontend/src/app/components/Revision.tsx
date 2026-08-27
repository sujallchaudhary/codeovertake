import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router";
import {
  Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import {
  BatteryLow, Brain, CheckCircle2, ExternalLink, Flame, Lock, RotateCcw, Trophy,
} from "lucide-react";
import {
  fetchRevisionQueue, fetchRevisionStats, rateRevision,
  type RevisionQueue, type RevisionRating, type RevisionStats,
} from "../api";
import { CustomChartTooltip } from "./ChartUtils";
import {
  DifficultyBadge, EmptyState, ErrorBanner, PageHeader, PlatformGlyph, ProgressBar,
  RequireAuth, Spinner, StatCard, retentionColor,
} from "./TrackerUI";
import { Heatmap } from "./Heatmap";

/**
 * Confidence buttons. The wording and ordering mirror the spaced-repetition
 * model on the backend: struggling snaps the interval back to tomorrow, while
 * "Nailed it" stretches it furthest.
 */
const RATING_BUTTONS: Array<{
  value: RevisionRating; label: string; hint: string; color: string;
}> = [
  { value: "struggled", label: "Struggled", hint: "See it again tomorrow", color: "#ff4444" },
  { value: "tough", label: "Tough", hint: "Short interval", color: "#fb923c" },
  { value: "got-it", label: "Got it", hint: "Normal interval", color: "#f59e0b" },
  { value: "nailed-it", label: "Nailed it", hint: "Longest interval", color: "#4ade80" },
];

function RetentionGauge({ rating, label }: { rating: number; label: string }) {
  const color = retentionColor(rating);
  return (
    <div className="rounded border border-[#1e1e1e] bg-[#111111] p-5">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <div className="font-['JetBrains_Mono'] text-[10px] uppercase tracking-widest text-[#666666]">
            Retention Rating
          </div>
          <div className="mt-1 font-['JetBrains_Mono'] text-4xl" style={{ color }}>
            {rating}%
          </div>
          <div className="mt-0.5 font-['Archivo'] text-xs capitalize" style={{ color }}>{label}</div>
        </div>
        <Brain className="h-8 w-8" style={{ color }} strokeWidth={1.5} />
      </div>
      <ProgressBar value={rating} max={100} color={color} className="h-2" />
      <p className="mt-3 font-['Archivo'] text-xs leading-relaxed text-[#888888]">
        {rating >= 70
          ? "Most of what you have solved is genuinely sticking. Keep the queue going."
          : rating >= 50
            ? "Some questions are starting to fade. Clear your daily queue to top them back up."
            : "A lot has faded. Slow down on new questions and revise what you already solved."}
      </p>
    </div>
  );
}

function RevisionInner() {
  const [queue, setQueue] = useState<RevisionQueue | null>(null);
  const [stats, setStats] = useState<RevisionStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [rating, setRating] = useState(false);
  const [lastResult, setLastResult] = useState<{ days: number; label: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [q, s] = await Promise.all([fetchRevisionQueue(), fetchRevisionStats()]);
      setQueue(q);
      setStats(s);
      // Jump to the first item that still needs rating
      const firstPending = (q.items || []).findIndex((i) => !i.done);
      setActiveIndex(firstPending === -1 ? 0 : firstPending);
    } catch (err: any) {
      setError(err.message || "Could not load your revision queue");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function submitRating(value: RevisionRating) {
    if (!queue || rating) return;
    const item = queue.items[activeIndex];
    if (!item) return;

    setRating(true);
    setError("");
    try {
      const res = await rateRevision(item.trackedQuestionId, value);
      setLastResult({
        days: res.nextReviewInDays,
        label: RATING_BUTTONS.find((b) => b.value === value)?.label || value,
      });

      // Reflect it locally, then advance to the next pending card
      const updatedItems = queue.items.map((i, idx) => (
        idx === activeIndex ? { ...i, done: true, rating: value } : i
      ));
      const nextPending = updatedItems.findIndex((i) => !i.done);
      setQueue({
        ...queue,
        items: updatedItems,
        doneCount: updatedItems.filter((i) => i.done).length,
        completed: nextPending === -1,
      });
      if (nextPending !== -1) setActiveIndex(nextPending);

      // Refresh the aggregates (retention, streak) in the background
      fetchRevisionStats().then(setStats).catch(() => {});
    } catch (err: any) {
      setError(err.message || "Could not save that rating");
    } finally {
      setRating(false);
    }
  }

  if (loading) return <Spinner label="Loading your revision queue..." />;

  const forecastData = (stats?.forecast || []).map((point) => ({
    label: point.days === 0 ? "Today" : `+${point.days}d`,
    retention: point.rating,
  }));

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <PageHeader
        title="Daily Revision"
        subtitle="Revisit questions right before you forget them."
        actions={(
          <Link
            to="/workspace"
            className="rounded border border-[#1e1e1e] px-3 py-2 font-['JetBrains_Mono'] text-xs text-white transition-colors hover:border-[#4ade80]"
          >
            Back to workspace
          </Link>
        )}
      />

      {error && <ErrorBanner message={error} />}

      {/* Stats row */}
      {stats && (
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard
            label="Streak"
            value={stats.streak}
            hint={`best ${stats.longestStreak}`}
            color="#f59e0b"
          />
          <StatCard label="Due now" value={stats.dueNow} hint="questions fading" color="#fb923c" />
          <StatCard label="Revisions" value={stats.totalRevisions} hint="all time" />
          <StatCard
            label="Tracked solved"
            value={stats.retention.solvedTracked}
            hint="in the decay model"
          />
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
        {/* Queue */}
        <div>
          {queue?.locked ? (
            <EmptyState
              icon={<Lock className="h-8 w-8" strokeWidth={1.5} />}
              title="Daily queue unlocks at 20 solved questions"
              description={`You have ${queue.solvedCount} solved so far — ${queue.remaining} to go. The scheduler needs a bit of history before it can pick what you are closest to forgetting.`}
              action={(
                <Link
                  to="/workspace"
                  className="rounded bg-[#4ade80] px-4 py-2 font-['JetBrains_Mono'] text-sm text-black transition-opacity hover:opacity-90"
                >
                  Add more questions
                </Link>
              )}
            />
          ) : !queue || queue.items.length === 0 ? (
            <EmptyState
              icon={<CheckCircle2 className="h-8 w-8" strokeWidth={1.5} />}
              title="Nothing to revise right now"
              description="Your memory is topped up. Come back tomorrow for a fresh queue."
            />
          ) : queue.completed ? (
            <div className="rounded border border-[#4ade80]/30 bg-[#4ade80]/5 p-8 text-center">
              <Trophy className="mx-auto mb-3 h-10 w-10 text-[#4ade80]" strokeWidth={1.5} />
              <h3 className="font-['JetBrains_Mono'] text-base text-white">
                Queue complete for today
              </h3>
              <p className="mx-auto mt-2 max-w-md font-['Archivo'] text-sm leading-relaxed text-[#aaaaaa]">
                You revised all {queue.items.length} questions. Your streak is safe and your
                retention has been topped back up. A new queue appears at midnight.
              </p>
              {stats && (
                <div className="mt-4 flex items-center justify-center gap-2 font-['JetBrains_Mono'] text-sm text-[#f59e0b]">
                  <Flame className="h-4 w-4" />
                  {stats.streak} day streak
                </div>
              )}
            </div>
          ) : (
            <>
              {/* Progress through today's queue */}
              <div className="mb-4">
                <div className="mb-1.5 flex items-center justify-between font-['JetBrains_Mono'] text-xs text-[#888888]">
                  <span>Today&apos;s queue</span>
                  <span>{queue.doneCount || 0} / {queue.items.length}</span>
                </div>
                <ProgressBar value={queue.doneCount || 0} max={queue.items.length} />
              </div>

              {/* Card stack indicator */}
              <div className="mb-3 flex gap-1.5">
                {queue.items.map((item, idx) => (
                  <button
                    key={item.trackedQuestionId}
                    onClick={() => setActiveIndex(idx)}
                    className={`h-1.5 flex-1 rounded-full transition-colors ${
                      item.done
                        ? "bg-[#4ade80]"
                        : idx === activeIndex
                          ? "bg-[#888888]"
                          : "bg-[#1e1e1e]"
                    }`}
                    title={item.problem?.title}
                  />
                ))}
              </div>

              {/* Active card */}
              {(() => {
                const item = queue.items[activeIndex];
                if (!item) return null;
                return (
                  <div className="rounded border border-[#1e1e1e] bg-[#111111] p-5">
                    <div className="mb-3 flex items-center gap-2">
                      <PlatformGlyph platform={item.problem.platform} />
                      <DifficultyBadge difficulty={item.problem.difficulty} />
                      <span
                        className="ml-auto flex items-center gap-1 font-['JetBrains_Mono'] text-[11px]"
                        style={{ color: retentionColor(item.memoryScoreAtBuild) }}
                        title="How much of this question you are estimated to still recall"
                      >
                        <BatteryLow className="h-3.5 w-3.5" />
                        {item.memoryScoreAtBuild}% recall
                      </span>
                    </div>

                    <h3 className="font-['Archivo'] text-lg leading-snug text-white">
                      {item.problem.title}
                    </h3>

                    {item.problem.topics?.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {item.problem.topics.slice(0, 4).map((topic) => (
                          <span
                            key={topic}
                            className="rounded bg-[#1a1a1a] px-1.5 py-0.5 font-['Archivo'] text-[11px] text-[#aaaaaa]"
                          >
                            {topic}
                          </span>
                        ))}
                      </div>
                    )}

                    <a
                      href={item.problem.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-4 inline-flex items-center gap-1.5 rounded border border-[#1e1e1e] px-3 py-2 font-['JetBrains_Mono'] text-xs text-white transition-colors hover:border-[#4ade80]"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      Attempt it again
                    </a>

                    <div className="mt-5 border-t border-[#1e1e1e] pt-4">
                      <p className="mb-3 font-['Archivo'] text-sm text-[#aaaaaa]">
                        How confident do you feel about this one now?
                      </p>
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                        {RATING_BUTTONS.map((button) => (
                          <button
                            key={button.value}
                            onClick={() => submitRating(button.value)}
                            disabled={rating}
                            className="flex flex-col items-center gap-0.5 rounded border px-2 py-2.5 transition-colors disabled:opacity-50"
                            style={{ borderColor: `${button.color}55` }}
                          >
                            <span
                              className="font-['JetBrains_Mono'] text-xs"
                              style={{ color: button.color }}
                            >
                              {button.label}
                            </span>
                            <span className="font-['Archivo'] text-[10px] text-[#666666]">
                              {button.hint}
                            </span>
                          </button>
                        ))}
                      </div>

                      {lastResult && (
                        <p className="mt-3 text-center font-['JetBrains_Mono'] text-[11px] text-[#4ade80]">
                          Rated &quot;{lastResult.label}&quot; — next review in {lastResult.days} day
                          {lastResult.days === 1 ? "" : "s"}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })()}
            </>
          )}
        </div>

        {/* Sidebar */}
        <div className="flex flex-col gap-4">
          {stats && <RetentionGauge rating={stats.retention.rating} label={stats.retention.label} />}

          {/* Memory buckets */}
          {stats && (
            <div className="rounded border border-[#1e1e1e] bg-[#111111] p-4">
              <div className="mb-3 font-['JetBrains_Mono'] text-[10px] uppercase tracking-widest text-[#666666]">
                Memory breakdown
              </div>
              <div className="flex flex-col gap-2">
                {([
                  { key: "strong", label: "Strong (70%+)", color: "#4ade80" },
                  { key: "fading", label: "Fading (50-70%)", color: "#f59e0b" },
                  { key: "weak", label: "Weak (25-50%)", color: "#fb923c" },
                  { key: "critical", label: "Critical (<25%)", color: "#ff4444" },
                ] as const).map((bucket) => {
                  const count = stats.retention.buckets[bucket.key];
                  return (
                    <div key={bucket.key} className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: bucket.color }} />
                      <span className="flex-1 font-['Archivo'] text-xs text-[#aaaaaa]">{bucket.label}</span>
                      <span className="font-['JetBrains_Mono'] text-xs" style={{ color: bucket.color }}>
                        {count}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Decay forecast */}
          {forecastData.length > 0 && (
            <div className="rounded border border-[#1e1e1e] bg-[#111111] p-4">
              <div className="mb-1 font-['JetBrains_Mono'] text-[10px] uppercase tracking-widest text-[#666666]">
                If you stop revising
              </div>
              <p className="mb-3 font-['Archivo'] text-xs text-[#888888]">
                Projected retention over the next four weeks with no further revision.
              </p>
              <div className="h-36">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={forecastData} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e1e1e" vertical={false} />
                    <XAxis
                      dataKey="label"
                      tick={{ fill: "#666666", fontSize: 10 }}
                      axisLine={{ stroke: "#1e1e1e" }}
                      tickLine={false}
                    />
                    <YAxis
                      domain={[0, 100]}
                      tick={{ fill: "#666666", fontSize: 10 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip content={<CustomChartTooltip valueFormatter={(v: any) => `${v}%`} />} />
                    <Area
                      type="monotone"
                      dataKey="retention"
                      stroke="#4ade80"
                      fill="#4ade80"
                      fillOpacity={0.15}
                      strokeWidth={2}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Revision heatmap */}
          {stats && Object.keys(stats.heatmap).length > 0 && (
            <div className="rounded border border-[#1e1e1e] bg-[#111111] p-4">
              <div className="mb-3 flex items-center gap-1.5 font-['JetBrains_Mono'] text-[10px] uppercase tracking-widest text-[#666666]">
                <RotateCcw className="h-3 w-3" />
                Revision activity
              </div>
              <Heatmap data={stats.heatmap} color="#4ade80" compact />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function Revision() {
  return (
    <RequireAuth feature="Daily Revision">
      <RevisionInner />
    </RequireAuth>
  );
}
