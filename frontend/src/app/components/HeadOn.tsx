import { useState, useEffect, useRef, useMemo } from "react";
import { Link } from "react-router";
import { Search, X, Plus, Trophy, Minus, Crown } from "lucide-react";
import { searchStudents, fetchStudent, fetchHeatmap } from "../api";
import { GithubIcon, LeetcodeIcon, CodeforcesIcon, CodechefIcon } from "./PlatformIcons";
import { CombinedHeatmap } from "./Heatmap";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";

const MOMENTUM_COLORS = ["#4ade80", "#60a5fa", "#f472b6", "#facc15", "#c084fc", "#fb923c"];

/**
 * Compute momentum: 7-day rolling sum of total activity across all platforms.
 * Returns sorted array of { date, count } for the last ~365 days.
 */
function computeMomentum(
  heatmap: Record<string, Record<string, number>> | undefined,
  windowDays = 7
): { date: string; value: number }[] {
  if (!heatmap) return [];
  // Merge all platforms into one date→count map
  const merged: Record<string, number> = {};
  for (const platformData of Object.values(heatmap)) {
    for (const [date, count] of Object.entries(platformData)) {
      merged[date] = (merged[date] || 0) + count;
    }
  }
  const dates = Object.keys(merged).sort();
  if (dates.length === 0) return [];

  // Build full date range from first date to last date
  const start = new Date(dates[0]);
  const end = new Date(dates[dates.length - 1]);
  const allDates: string[] = [];
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    allDates.push(d.toISOString().slice(0, 10));
  }

  // 7-day rolling sum
  const result: { date: string; value: number }[] = [];
  let windowSum = 0;
  for (let i = 0; i < allDates.length; i++) {
    windowSum += merged[allDates[i]] || 0;
    if (i >= windowDays) {
      windowSum -= merged[allDates[i - windowDays]] || 0;
    }
    // Only emit weekly data points to keep chart readable
    if (i >= windowDays - 1 && i % 7 === 0) {
      result.push({ date: allDates[i], value: windowSum });
    }
  }
  return result;
}

const PLATFORM_CONFIGS = [
  {
    key: "github",
    label: "GitHub",
    icon: <GithubIcon />,
    stats: [
      { label: "Repos", get: (s: any) => s.github?.stats?.publicRepos ?? 0 },
      { label: "Stars", get: (s: any) => s.github?.stats?.totalStars ?? 0 },
      { label: "Followers", get: (s: any) => s.github?.stats?.followers ?? 0 },
      { label: "Contributions", get: (s: any) => s.github?.stats?.contributions ?? 0 },
    ],
  },
  {
    key: "leetcode",
    label: "LeetCode",
    icon: <LeetcodeIcon />,
    stats: [
      { label: "Easy", get: (s: any) => s.leetcode?.stats?.easySolved ?? 0 },
      { label: "Medium", get: (s: any) => s.leetcode?.stats?.mediumSolved ?? 0 },
      { label: "Hard", get: (s: any) => s.leetcode?.stats?.hardSolved ?? 0 },
      { label: "Total Solved", get: (s: any) => s.leetcode?.stats?.totalSolved ?? 0 },
      { label: "Contest Rating", get: (s: any) => s.leetcode?.stats?.contestRating ?? 0 },
    ],
  },
  {
    key: "codeforces",
    label: "Codeforces",
    icon: <CodeforcesIcon />,
    stats: [
      { label: "Rating", get: (s: any) => s.codeforces?.stats?.rating ?? 0 },
      { label: "Max Rating", get: (s: any) => s.codeforces?.stats?.maxRating ?? 0 },
      { label: "Problems Solved", get: (s: any) => s.codeforces?.stats?.problemsSolved ?? 0 },
    ],
  },
  {
    key: "codechef",
    label: "CodeChef",
    icon: <CodechefIcon />,
    stats: [
      { label: "Rating", get: (s: any) => s.codechef?.stats?.currentRating ?? 0 },
      { label: "Max Rating", get: (s: any) => s.codechef?.stats?.highestRating ?? 0 },
      { label: "Stars", get: (s: any) => s.codechef?.stats?.stars ?? 0 },
      { label: "Problems Solved", get: (s: any) => s.codechef?.stats?.totalProblemsSolved ?? 0 },
    ],
  },
];

export function HeadOn() {
  const [players, setPlayers] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [loadingRollno, setLoadingRollno] = useState<string | null>(null);
  const [showSearch, setShowSearch] = useState(false);
  const [playerHeatmaps, setPlayerHeatmaps] = useState<Record<string, Record<string, Record<string, number>>>>({});
  const searchRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Close search dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowSearch(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Debounced search
  useEffect(() => {
    if (!searchQuery || searchQuery.length < 2) {
      setSearchResults([]);
      return;
    }
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const data = await searchStudents(searchQuery);
        // Filter out already added players
        const addedRollNos = new Set(players.map((p) => p.rollno));
        setSearchResults(data.results.filter((r) => r.exists && !addedRollNos.has(r.rollno)));
      } catch {
        setSearchResults([]);
      }
      setSearching(false);
    }, 300);
  }, [searchQuery, players]);

  const addPlayer = async (rollno: string) => {
    setLoadingRollno(rollno);
    try {
      const student = await fetchStudent(rollno);
      setPlayers((prev) => [...prev, student]);
      setSearchQuery("");
      setSearchResults([]);
      setShowSearch(false);
      // Fetch heatmap in background
      fetchHeatmap(rollno)
        .then((data) => setPlayerHeatmaps((prev) => ({ ...prev, [rollno]: data })))
        .catch(() => {});
    } catch {
      // ignore
    }
    setLoadingRollno(null);
  };

  const removePlayer = (rollno: string) => {
    setPlayers((prev) => prev.filter((p) => p.rollno !== rollno));
    setPlayerHeatmaps((prev) => {
      const copy = { ...prev };
      delete copy[rollno];
      return copy;
    });
  };

  const getWinner = (getValue: (s: any) => number) => {
    if (players.length < 2) return null;
    let maxVal = -1;
    let winnerId = "";
    let tie = false;
    for (const p of players) {
      const v = getValue(p);
      if (v > maxVal) {
        maxVal = v;
        winnerId = p.rollno;
        tie = false;
      } else if (v === maxVal) {
        tie = true;
      }
    }
    return tie ? null : winnerId;
  };

  // Count platform wins per player
  const platformWins: Record<string, number> = {};
  if (players.length >= 2) {
    for (const p of players) platformWins[p.rollno] = 0;
    for (const platform of PLATFORM_CONFIGS) {
      const winner = getWinner((s) => s.scores?.[platform.key] ?? 0);
      if (winner) platformWins[winner]++;
    }
  }

  const overallWinner = getWinner((s) => s.scores?.total ?? 0);

  // Compute momentum data for the chart
  const momentumChartData = useMemo(() => {
    if (players.length < 2 || Object.keys(playerHeatmaps).length === 0) return [];
    const perPlayer = players.map((p) => ({
      rollno: p.rollno,
      name: p.name.split(" ")[0],
      data: computeMomentum(playerHeatmaps[p.rollno]),
    }));
    // Collect all unique dates across players
    const allDates = new Set<string>();
    for (const pd of perPlayer) for (const d of pd.data) allDates.add(d.date);
    const sortedDates = [...allDates].sort();
    // Build chart rows
    return sortedDates.map((date) => {
      const row: Record<string, any> = { date };
      for (const pd of perPlayer) {
        const entry = pd.data.find((d) => d.date === date);
        row[pd.rollno] = entry?.value ?? null;
      }
      return row;
    });
  }, [players, playerHeatmaps]);

  return (
    <div className="mx-auto max-w-7xl px-3 py-6 sm:px-6 sm:py-8 lg:px-8">
      {/* Header */}
      <div className="mb-6 sm:mb-8">
        <h1 className="mb-2 font-['JetBrains_Mono'] text-2xl tracking-tight sm:text-3xl">
          Head<span className="text-[#4ade80]">On</span>
        </h1>
        <p className="text-sm text-[#666666]">Compare students head-to-head across all platforms</p>
      </div>

      {/* Player Cards + Add Button */}
      <div className="mb-6 flex flex-wrap items-start gap-3 sm:mb-8 sm:gap-4">
        {players.map((player) => (
          <div
            key={player.rollno}
            className={`relative rounded border p-3 sm:p-4 transition-colors ${
              overallWinner === player.rollno
                ? "border-[#4ade80]/40 bg-[#4ade80]/5"
                : "border-[#1e1e1e] bg-[#111111]"
            }`}
          >
            <button
              onClick={() => removePlayer(player.rollno)}
              className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-[#333333] text-[#888888] transition-colors hover:bg-red-500/20 hover:text-red-400"
            >
              <X className="h-3 w-3" />
            </button>
            <div className="flex items-center gap-3">
              <img
                src={`https://api.dicebear.com/9.x/identicon/svg?seed=${player.rollno}`}
                alt=""
                className="h-10 w-10 rounded border border-[#1e1e1e] sm:h-12 sm:w-12"
              />
              <div>
                <div className="flex items-center gap-2">
                  <Link to={`/student/${player.rollno}`} className="font-['Archivo'] text-sm hover:underline sm:text-base">
                    {player.name}
                  </Link>
                  {overallWinner === player.rollno && <Crown className="h-4 w-4 text-yellow-500" />}
                </div>
                <div className="font-['JetBrains_Mono'] text-xs text-[#888888]">{player.rollno}</div>
                <div className="text-[10px] text-[#666666]">{player.branch} • {player.year}</div>
              </div>
            </div>
          </div>
        ))}

        {/* Add Player */}
        <div ref={searchRef} className="relative">
          <button
            onClick={() => setShowSearch(!showSearch)}
            className="flex h-[74px] w-[74px] flex-col items-center justify-center gap-1 rounded border border-dashed border-[#333333] text-[#888888] transition-colors hover:border-[#4ade80] hover:text-[#4ade80] sm:h-[84px] sm:w-[84px]"
          >
            <Plus className="h-5 w-5" />
            <span className="text-[10px]">Add</span>
          </button>

          {showSearch && (
            <div className="absolute left-0 top-full z-50 mt-2 w-72 rounded border border-[#1e1e1e] bg-[#111111] p-3 shadow-xl sm:w-80">
              <div className="relative mb-2">
                <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#888888]" />
                <input
                  type="text"
                  autoFocus
                  placeholder="Search by name or roll no..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-9 w-full rounded border border-[#1e1e1e] bg-[#0a0a0a] pl-9 pr-3 text-sm text-white placeholder-[#888888] outline-none focus:border-[#333333]"
                />
              </div>
              {searching && <div className="py-3 text-center text-xs text-[#888888]">Searching...</div>}
              {!searching && searchResults.length === 0 && searchQuery.length >= 2 && (
                <div className="py-3 text-center text-xs text-[#888888]">No registered students found</div>
              )}
              {searchResults.map((r) => (
                <button
                  key={r.rollno}
                  onClick={() => addPlayer(r.rollno)}
                  disabled={loadingRollno === r.rollno}
                  className="flex w-full items-center gap-3 rounded px-2 py-2 text-left transition-colors hover:bg-[#1e1e1e] disabled:opacity-50"
                >
                  <img
                    src={`https://api.dicebear.com/9.x/identicon/svg?seed=${r.rollno}`}
                    alt=""
                    className="h-8 w-8 rounded border border-[#1e1e1e]"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm">{r.name}</div>
                    <div className="font-['JetBrains_Mono'] text-[10px] text-[#888888]">
                      {r.rollno} • {r.branch} • {r.year}
                    </div>
                  </div>
                  {loadingRollno === r.rollno ? (
                    <span className="text-xs text-[#888888]">...</span>
                  ) : (
                    <Plus className="h-4 w-4 flex-shrink-0 text-[#888888]" />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Empty State */}
      {players.length < 2 && (
        <div className="mb-8 rounded border border-[#1e1e1e] bg-[#111111] p-8 text-center sm:p-12">
          <Trophy className="mx-auto mb-4 h-10 w-10 text-[#333333]" />
          <p className="font-['JetBrains_Mono'] text-sm text-[#888888]">
            Add {players.length === 0 ? "at least 2" : "1 more"} student{players.length === 0 ? "s" : ""} to start the battle
          </p>
        </div>
      )}

      {/* Comparison */}
      {players.length >= 2 && (
        <div className="space-y-4 sm:space-y-6">
          {/* Total Score */}
          <div className="rounded border border-[#1e1e1e] bg-[#111111] p-4 sm:p-6">
            <h2 className="mb-4 font-['JetBrains_Mono'] text-xs uppercase tracking-wider text-[#888888]">
              Total Score
            </h2>
            <div className="space-y-3">
              {players
                .slice()
                .sort((a, b) => (b.scores?.total ?? 0) - (a.scores?.total ?? 0))
                .map((player, i) => {
                  const score = player.scores?.total ?? 0;
                  const maxScore = Math.max(...players.map((p) => p.scores?.total ?? 0));
                  const pct = maxScore > 0 ? (score / maxScore) * 100 : 0;
                  const isWinner = overallWinner === player.rollno;
                  return (
                    <div key={player.rollno} className="flex items-center gap-3 sm:gap-4">
                      <div className="w-28 flex-shrink-0 truncate text-sm sm:w-36">
                        <span className="flex items-center gap-1.5">
                          {isWinner && <Crown className="h-3.5 w-3.5 flex-shrink-0 text-yellow-500" />}
                          {player.name}
                        </span>
                      </div>
                      <div className="flex-1">
                        <div className="h-6 overflow-hidden rounded bg-[#1e1e1e]">
                          <div
                            className={`flex h-full items-center rounded pl-2 font-['JetBrains_Mono'] text-xs transition-all ${
                              isWinner ? "bg-[#4ade80]/20 text-[#4ade80]" : "bg-[#333333]/50 text-white"
                            }`}
                            style={{ width: `${Math.max(pct, 8)}%` }}
                          >
                            {score}
                          </div>
                        </div>
                      </div>
                      <div className="w-12 text-right font-['JetBrains_Mono'] text-xs text-[#888888]">
                        {platformWins[player.rollno] ?? 0}W
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>

          {/* Platform Sections */}
          {PLATFORM_CONFIGS.map((platform) => {
            const hasAny = players.some((p) => p[platform.key]?.hasUsername);
            if (!hasAny) return null;
            const platformWinner = getWinner((s) => s.scores?.[platform.key] ?? 0);

            return (
              <div key={platform.key} className="rounded border border-[#1e1e1e] bg-[#111111]">
                {/* Platform Header */}
                <div className="flex items-center gap-2 border-b border-[#1e1e1e] px-4 py-3 sm:px-6">
                  <span className="h-4 w-4">{platform.icon}</span>
                  <span className="font-['JetBrains_Mono'] text-sm">{platform.label}</span>
                </div>

                {/* Score Bars */}
                <div className="border-b border-[#1e1e1e] px-4 py-3 sm:px-6">
                  <div className="space-y-2">
                    {players
                      .slice()
                      .sort((a, b) => (b.scores?.[platform.key] ?? 0) - (a.scores?.[platform.key] ?? 0))
                      .map((player) => {
                        const score = player.scores?.[platform.key] ?? 0;
                        const maxScore = Math.max(...players.map((p) => p.scores?.[platform.key] ?? 0));
                        const pct = maxScore > 0 ? (score / maxScore) * 100 : 0;
                        const isWinner = platformWinner === player.rollno;
                        return (
                          <div key={player.rollno} className="flex items-center gap-3">
                            <div className="w-28 flex-shrink-0 truncate text-xs sm:w-36">{player.name}</div>
                            <div className="flex-1">
                              <div className="h-5 overflow-hidden rounded bg-[#1e1e1e]">
                                <div
                                  className={`flex h-full items-center rounded pl-2 font-['JetBrains_Mono'] text-[10px] transition-all ${
                                    isWinner ? "bg-[#4ade80]/20 text-[#4ade80]" : "bg-[#333333]/50 text-white"
                                  }`}
                                  style={{ width: `${Math.max(pct, 10)}%` }}
                                >
                                  {score}
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </div>

                {/* Stat Comparison Table */}
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-[#1e1e1e]">
                        <th className="px-4 py-2 text-left font-['JetBrains_Mono'] text-[10px] uppercase tracking-wider text-[#888888] sm:px-6">
                          Stat
                        </th>
                        {players.map((p) => (
                          <th
                            key={p.rollno}
                            className="px-3 py-2 text-center font-['JetBrains_Mono'] text-[10px] uppercase tracking-wider text-[#888888]"
                          >
                            {p.name.split(" ")[0]}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#1e1e1e]">
                      {platform.stats.map((stat) => {
                        const statWinner = getWinner(stat.get);
                        return (
                          <tr key={stat.label}>
                            <td className="px-4 py-2 text-xs text-[#888888] sm:px-6">{stat.label}</td>
                            {players.map((p) => {
                              const val = stat.get(p);
                              const isWin = statWinner === p.rollno;
                              return (
                                <td
                                  key={p.rollno}
                                  className={`px-3 py-2 text-center font-['JetBrains_Mono'] text-xs ${
                                    isWin ? "text-[#4ade80]" : "text-white"
                                  }`}
                                >
                                  {val}
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}

          {/* Momentum Chart */}
          {momentumChartData.length > 0 && (
            <div className="rounded border border-[#1e1e1e] bg-[#111111] p-4 sm:p-6">
              <h2 className="mb-1 font-['JetBrains_Mono'] text-xs uppercase tracking-wider text-[#888888]">
                Momentum
              </h2>
              <p className="mb-4 text-[10px] text-[#666666]">7-day rolling activity across all platforms</p>
              <div className="h-64 sm:h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={momentumChartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e1e1e" />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 10, fill: "#888888" }}
                      tickFormatter={(d: string) => {
                        const dt = new Date(d);
                        return dt.toLocaleDateString("en-US", { month: "short", day: "numeric" });
                      }}
                      interval="preserveStartEnd"
                      minTickGap={40}
                      stroke="#333333"
                    />
                    <YAxis
                      tick={{ fontSize: 10, fill: "#888888" }}
                      stroke="#333333"
                      allowDecimals={false}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#111111",
                        border: "1px solid #1e1e1e",
                        borderRadius: "4px",
                        fontSize: "12px",
                      }}
                      labelFormatter={(d: string) => {
                        const dt = new Date(d);
                        return dt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
                      }}
                    />
                    <Legend
                      wrapperStyle={{ fontSize: "11px", fontFamily: "JetBrains Mono" }}
                    />
                    {players.map((p, i) => (
                      <Line
                        key={p.rollno}
                        type="monotone"
                        dataKey={p.rollno}
                        name={p.name.split(" ")[0]}
                        stroke={MOMENTUM_COLORS[i % MOMENTUM_COLORS.length]}
                        strokeWidth={2}
                        dot={false}
                        connectNulls
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Activity Heatmaps Comparison */}
          {Object.keys(playerHeatmaps).length > 0 && (
            <div className="rounded border border-[#1e1e1e] bg-[#111111]">
              <div className="border-b border-[#1e1e1e] px-4 py-3 sm:px-6">
                <span className="font-['JetBrains_Mono'] text-sm">Activity Heatmaps</span>
              </div>
              <div className="space-y-4 p-4 sm:p-6">
                {players.map((player) => {
                  const heatmap = playerHeatmaps[player.rollno];
                  if (!heatmap || Object.keys(heatmap).length === 0) return null;
                  return (
                    <div key={`heatmap-${player.rollno}`}>
                      <div className="mb-2 font-['Archivo'] text-xs text-[#888888]">{player.name}</div>
                      <CombinedHeatmap platformData={heatmap} compact />
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
