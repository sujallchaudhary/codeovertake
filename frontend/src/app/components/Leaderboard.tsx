import { useState, useEffect, useCallback, useRef } from "react";
import { Link, useSearchParams } from "react-router";
import { Search, Rocket, Zap, TrendingUp, ArrowUpRight, Loader2, ArrowUpDown, ArrowUp, ArrowDown, ChevronDown, ChevronUp, TrendingDown, Minus } from "lucide-react";
import { platforms, type Platform } from "../mockData";
import { fetchLeaderboard, fetchPlatformLeaderboard, fetchFilters, fetchTopGainers } from "../api";
import { GithubIcon, LeetcodeIcon, CodeforcesIcon, CodechefIcon } from "./PlatformIcons";

const ITEMS_PER_PAGE = 20;

// Platform stat columns for sorting
const platformColumns: Record<string, { label: string; statKey: string; getValue: (s: any) => any }[]> = {
  github: [
    { label: "Repos", statKey: "github.stats.publicRepos", getValue: (s) => s.github?.stats?.publicRepos ?? 0 },
    { label: "Stars", statKey: "github.stats.totalStars", getValue: (s) => s.github?.stats?.totalStars ?? 0 },
    { label: "Followers", statKey: "github.stats.followers", getValue: (s) => s.github?.stats?.followers ?? 0 },
    { label: "Contributions", statKey: "github.stats.contributions", getValue: (s) => s.github?.stats?.contributions ?? 0 },
  ],
  leetcode: [
    { label: "Easy", statKey: "leetcode.stats.easySolved", getValue: (s) => s.leetcode?.stats?.easySolved ?? 0 },
    { label: "Medium", statKey: "leetcode.stats.mediumSolved", getValue: (s) => s.leetcode?.stats?.mediumSolved ?? 0 },
    { label: "Hard", statKey: "leetcode.stats.hardSolved", getValue: (s) => s.leetcode?.stats?.hardSolved ?? 0 },
    { label: "Total", statKey: "leetcode.stats.totalSolved", getValue: (s) => s.leetcode?.stats?.totalSolved ?? 0 },
    { label: "Contest", statKey: "leetcode.stats.contestRating", getValue: (s) => s.leetcode?.stats?.contestRating ?? 0 },
  ],
  codeforces: [
    { label: "Rating", statKey: "codeforces.stats.rating", getValue: (s) => s.codeforces?.stats?.rating ?? 0 },
    { label: "Max Rating", statKey: "codeforces.stats.maxRating", getValue: (s) => s.codeforces?.stats?.maxRating ?? 0 },
    { label: "Rank", statKey: "codeforces.stats.rank", getValue: (s) => s.codeforces?.stats?.rank ?? "—" },
    { label: "Solved", statKey: "codeforces.stats.problemsSolved", getValue: (s) => s.codeforces?.stats?.problemsSolved ?? 0 },
  ],
  codechef: [
    { label: "Rating", statKey: "codechef.stats.currentRating", getValue: (s) => s.codechef?.stats?.currentRating ?? 0 },
    { label: "Max Rating", statKey: "codechef.stats.highestRating", getValue: (s) => s.codechef?.stats?.highestRating ?? 0 },
    { label: "Stars", statKey: "codechef.stats.stars", getValue: (s) => s.codechef?.stats?.stars ?? 0 },
    { label: "Solved", statKey: "codechef.stats.totalProblemsSolved", getValue: (s) => s.codechef?.stats?.totalProblemsSolved ?? 0 },
  ],
};

type TabType = "all" | Platform;

export function Leaderboard() {
  const [searchParams, setSearchParams] = useSearchParams();

  // Initialize state from URL search params
  const [activeTab, setActiveTab] = useState<TabType>(() => (searchParams.get("tab") as TabType) || "all");
  // displayTab tracks which tab's columns to render — updated after data arrives
  const [displayTab, setDisplayTab] = useState<TabType>(() => (searchParams.get("tab") as TabType) || "all");
  const [searchQuery, setSearchQuery] = useState(() => searchParams.get("search") || "");
  const [selectedYear, setSelectedYear] = useState<number | "all">(() => {
    const y = searchParams.get("year");
    return y ? Number(y) : "all";
  });
  const [selectedBranch, setSelectedBranch] = useState<string>(() => searchParams.get("branch") || "all");
  const [currentPage, setCurrentPage] = useState(1);
  const [students, setStudents] = useState<any[]>([]);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [initialLoad, setInitialLoad] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [fading, setFading] = useState(false);
  const [filterYears, setFilterYears] = useState<number[]>([]);
  const [filterBranches, setFilterBranches] = useState<string[]>([]);
  const [platformMeta, setPlatformMeta] = useState<any[]>([]);
  const fetchIdRef = useRef(0);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [gainersPeriod, setGainersPeriod] = useState<{ from: string; to: string } | null>(null);
  const [sortBy, setSortBy] = useState<string | undefined>(() => searchParams.get("sortBy") || undefined);
  const [sortOrder, setSortOrder] = useState<"desc" | "asc">(() => (searchParams.get("order") as "desc" | "asc") || "desc");

  // Sync filter state to URL search params
  useEffect(() => {
    const params: Record<string, string> = {};
    if (activeTab !== "all") params.tab = activeTab;
    if (searchQuery) params.search = searchQuery;
    if (selectedYear !== "all") params.year = String(selectedYear);
    if (selectedBranch !== "all") params.branch = selectedBranch;
    if (sortBy) params.sortBy = sortBy;
    if (sortOrder !== "desc") params.order = sortOrder;
    setSearchParams(params, { replace: true });
  }, [activeTab, searchQuery, selectedYear, selectedBranch, sortBy, sortOrder]);

  // Load filter options and a top gainer once
  useEffect(() => {
    fetchFilters().then((data) => {
      setFilterYears(data.years);
      setFilterBranches(data.branches);
      setPlatformMeta(data.platforms);
    }).catch(() => {});

    fetchTopGainers({ limit: 1 }).then((data) => {
      setGainersPeriod(data.period);
    }).catch(() => {});
  }, []);

  // Fetch leaderboard data — append mode for infinite scroll
  const loadData = useCallback(async (append = false) => {
    const id = ++fetchIdRef.current;
    if (append) {
      setLoadingMore(true);
    } else {
      setFading(true);
    }
    try {
      const page = append ? currentPage : 1;
      const params: any = { page, limit: ITEMS_PER_PAGE };
      if (selectedYear !== "all") params.year = selectedYear;
      if (selectedBranch !== "all") params.branch = selectedBranch;
      if (searchQuery) params.search = searchQuery;
      if (sortBy) params.sortBy = sortBy;
      if (sortOrder) params.order = sortOrder;

      let result;
      if (activeTab === "all") {
        result = await fetchLeaderboard(params);
      } else {
        result = await fetchPlatformLeaderboard(activeTab, params);
      }
      if (id !== fetchIdRef.current) return; // stale request

      // When using default score sort, sort by stored rank to ensure consistent ordering
      if (!sortBy) {
        const hasFilters = selectedYear !== "all" || selectedBranch !== "all";
        const getRank = (s: any) => {
          if (activeTab === "all") {
            if (selectedBranch !== "all" && selectedYear !== "all") return s.ranks?.branchWise ?? 9999;
            if (selectedYear !== "all") return s.ranks?.yearWise ?? 9999;
            return s.ranks?.overall ?? 9999;
          }
          if (hasFilters) return s.filteredRank ?? 9999;
          return s.ranks?.[activeTab] ?? 9999;
        };
        result.students.sort((a: any, b: any) => getRank(a) - getRank(b));
      }

      if (append) {
        setStudents((prev) => [...prev, ...result.students]);
      } else {
        setStudents(result.students);
      }
      setTotalPages(result.pagination.pages);
      setTotalCount(result.pagination.total);
      setDisplayTab(activeTab);
    } catch {
      if (id !== fetchIdRef.current) return;
      if (!append) {
        setStudents([]);
        setTotalPages(1);
        setTotalCount(0);
      }
      setDisplayTab(activeTab);
    }
    setInitialLoad(false);
    setFading(false);
    setLoadingMore(false);
  }, [activeTab, searchQuery, selectedYear, selectedBranch, currentPage, sortBy, sortOrder]);

  // Initial load and filter changes — reset to page 1
  useEffect(() => {
    setCurrentPage(1);
    loadData(false);
  }, [activeTab, searchQuery, selectedYear, selectedBranch, sortBy, sortOrder]);

  // Reset sort when tab changes
  useEffect(() => {
    setSortBy(undefined);
    setSortOrder("desc");
  }, [activeTab]);

  // Load more when page increments
  useEffect(() => {
    if (currentPage > 1) {
      loadData(true);
    }
  }, [currentPage]);

  // Infinite scroll — IntersectionObserver on sentinel
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !loadingMore && currentPage < totalPages) {
          setCurrentPage((p) => p + 1);
        }
      },
      { rootMargin: "200px" }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [loadingMore, currentPage, totalPages]);

  const getPlatformIcon = (platform: Platform) => {
    switch (platform) {
      case "github":
        return <GithubIcon />;
      case "leetcode":
        return <LeetcodeIcon />;
      case "codeforces":
        return <CodeforcesIcon />;
      case "codechef":
        return <CodechefIcon />;
    }
  };

  const handleSort = (statKey: string) => {
    if (sortBy === statKey) {
      // Toggle order, or clear sort if already ascending
      if (sortOrder === "desc") {
        setSortOrder("asc");
      } else {
        setSortBy(undefined);
        setSortOrder("desc");
      }
    } else {
      setSortBy(statKey);
      setSortOrder("desc");
    }
  };

  const SortHeader = ({ label, statKey }: { label: string; statKey: string }) => (
    <th
      className="cursor-pointer select-none px-4 py-3 text-xs font-medium uppercase tracking-wider text-[#888888] transition-colors hover:text-white"
      onClick={() => handleSort(statKey)}
    >
      <div className="flex items-center gap-1">
        {label}
        {sortBy === statKey ? (
          sortOrder === "desc" ? <ArrowDown className="h-3 w-3 text-[#4ade80]" /> : <ArrowUp className="h-3 w-3 text-[#4ade80]" />
        ) : (
          <ArrowUpDown className="h-3 w-3 opacity-40" />
        )}
      </div>
    </th>
  );

  return (
    <div className="mx-auto max-w-7xl px-3 py-6 sm:px-6 sm:py-8 lg:px-8">
      {/* Global CTA Banner */}
      <div className="mb-4 flex flex-col gap-3 rounded border border-[#1e1e1e] bg-[#111111] px-4 py-3 sm:mb-6 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div className="flex items-center gap-3 text-sm">
          <Rocket className="hidden h-4 w-4 flex-shrink-0 text-[#888888] sm:block" />
          <span className="text-[#888888]">
            <span className="font-['JetBrains_Mono'] text-white">{totalCount}</span> students ranked.
            Not on the leaderboard yet?
          </span>
        </div>
        <Link
          to="/register"
          className="flex w-full items-center justify-center gap-2 rounded bg-[#4ade80] px-4 py-1.5 font-['Archivo'] text-sm text-[#0a0a0a] transition-opacity hover:opacity-90 sm:w-auto"
        >
          <Zap className="h-3.5 w-3.5" />
          Claim Your Spot
        </Link>
      </div>

      {/* Daily Gainers CTA Banner */}
      <div className="mb-6 flex items-center justify-between rounded border border-[#1e1e1e] bg-[#111111] p-3 sm:mb-8 sm:p-4">
        <div className="flex items-center gap-2 sm:gap-3">
          <TrendingUp className="h-4 w-4 text-[#4ade80] sm:h-5 sm:w-5" />
          <div>
            <h2 className="font-['JetBrains_Mono'] text-xs uppercase tracking-wider text-[#888888] sm:text-sm">
              Daily Gainers
            </h2>
            {gainersPeriod && (
              <div className="mt-0.5 text-[10px] text-[#666666] sm:text-xs">
                {gainersPeriod.from} → {gainersPeriod.to}
              </div>
            )}
          </div>
        </div>
        
        <Link
          to="/daily-gainers"
          className="flex flex-shrink-0 items-center justify-center rounded border border-[#333333] bg-[#1a1a1a] px-3 py-1.5 font-['Archivo'] text-xs text-white transition-colors hover:border-[#4ade80] hover:text-[#4ade80] sm:px-4 sm:py-2 sm:text-sm"
        >
          <span className="sm:hidden">View</span>
          <span className="hidden sm:inline">View Full List</span>
          <span className="ml-1">→</span>
        </Link>
      </div>

      {/* Page Title */}
      <h1 className="mb-6 font-['JetBrains_Mono'] text-2xl tracking-tight sm:mb-8 sm:text-3xl">
        Coding <span className="text-[#4ade80]">Leaderboard</span>
      </h1>

      {/* Platform Tabs */}
      <div className="no-scrollbar -mx-3 mb-6 flex gap-1 overflow-x-auto border-b border-[#1e1e1e] px-3 font-['Archivo'] sm:mx-0 sm:px-0">
        <button
          onClick={() => setActiveTab("all")}
          className={`relative flex items-center gap-2 whitespace-nowrap border-b-2 px-4 py-3 text-sm transition-colors ${
            activeTab === "all"
              ? "border-[#4ade80] text-[#4ade80]"
              : "border-transparent text-[#888888] hover:text-white"
          }`}
        >
          All Combined
        </button>
        {platforms.map((platform) => (
          <button
            key={platform}
            onClick={() => setActiveTab(platform)}
            className={`relative flex items-center gap-2 whitespace-nowrap border-b-2 px-4 py-3 text-sm transition-colors ${
              activeTab === platform
                ? "border-[#4ade80] text-[#4ade80]"
                : "border-transparent text-[#888888] hover:text-white"
            }`}
          >
            <span className="h-4 w-4">{getPlatformIcon(platform)}</span>
            {platform.charAt(0).toUpperCase() + platform.slice(1)}
          </button>
        ))}
      </div>

      {/* Filter Bar */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:gap-4">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#888888]" />
          <input
            type="text"
            placeholder="Search by name or roll no..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-10 w-full rounded border border-[#1e1e1e] bg-[#111111] pl-10 pr-4 text-sm text-white placeholder-[#888888] outline-none transition-colors focus:border-[#333333]"
          />
        </div>

        <div className="grid grid-cols-2 gap-3 sm:flex sm:gap-4">
          {/* Year Dropdown */}
          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(e.target.value === "all" ? "all" : Number(e.target.value))}
            className="h-10 rounded border border-[#1e1e1e] bg-[#111111] px-3 text-sm text-white outline-none transition-colors focus:border-[#333333] sm:px-4"
          >
            <option value="all">All Years</option>
            {filterYears.map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </select>

          {/* Branch Dropdown */}
          <select
            value={selectedBranch}
            onChange={(e) => setSelectedBranch(e.target.value)}
            className="h-10 rounded border border-[#1e1e1e] bg-[#111111] px-3 text-sm text-white outline-none transition-colors focus:border-[#333333] sm:px-4"
          >
            <option value="all">All Branches</option>
            {filterBranches.map((branch) => (
              <option key={branch} value={branch}>
                {branch}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Sort Buttons (platform tabs only) */}
      {activeTab !== "all" && platformColumns[activeTab] && (
        <div className="no-scrollbar -mx-3 mb-4 flex gap-2 overflow-x-auto px-3 sm:mx-0 sm:mb-6 sm:flex-wrap sm:px-0">
          <button
            onClick={() => { setSortBy(undefined); setSortOrder("desc"); }}
            className={`flex-shrink-0 rounded-full border px-3 py-1.5 font-['JetBrains_Mono'] text-xs transition-colors ${
              !sortBy
                ? "border-[#4ade80] bg-[#4ade80] text-[#0a0a0a]"
                : "border-[#1e1e1e] text-[#888888] hover:border-[#333333] hover:text-white"
            }`}
          >
            Score
          </button>
          {platformColumns[activeTab].map((col) => (
            <button
              key={col.statKey}
              onClick={() => handleSort(col.statKey)}
              className={`flex items-center gap-1 flex-shrink-0 rounded-full border px-3 py-1.5 font-['JetBrains_Mono'] text-xs transition-colors ${
                sortBy === col.statKey
                  ? "border-[#4ade80] bg-[#4ade80] text-[#0a0a0a]"
                  : "border-[#1e1e1e] text-[#888888] hover:border-[#333333] hover:text-white"
              }`}
            >
              {col.label}
              {sortBy === col.statKey && (
                sortOrder === "desc" ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" />
              )}
            </button>
          ))}
        </div>
      )}

      {/* Mobile Card View */}
      <div className={`space-y-3 sm:hidden transition-opacity duration-200 ${fading ? "opacity-40" : "opacity-100"}`}>
        {initialLoad ? (
          <div className="rounded border border-[#1e1e1e] bg-[#111111] p-8 text-center text-[#888888]">Loading...</div>
        ) : students.length === 0 ? (
          <div className="rounded border border-[#1e1e1e] bg-[#111111] p-8 text-center">
            <div className="text-[#888888]">No students found</div>
            {searchQuery && (
              <div className="mt-3">
                <div className="mb-2 text-sm text-[#666666]">You&apos;re not on the leaderboard yet.</div>
                <Link to="/register" className="inline-flex items-center gap-2 rounded bg-[#4ade80] px-4 py-2 text-sm text-[#0a0a0a]">
                  <Zap className="h-3.5 w-3.5" /> Claim Your Spot
                </Link>
              </div>
            )}
          </div>
        ) : (
          students.map((student, idx) => {
            const hasFilters = selectedYear !== "all" || selectedBranch !== "all";
            const rank = sortBy && searchQuery
              ? "—"
              : sortBy
              ? idx + 1
              : displayTab === "all"
              ? (selectedBranch !== "all" && selectedYear !== "all"
                ? student.ranks?.branchWise
                : selectedYear !== "all"
                ? student.ranks?.yearWise
                : student.ranks?.overall)
              || idx + 1
              : hasFilters
              ? student.filteredRank || idx + 1
              : student.ranks?.[displayTab] || idx + 1;
            return (
              <Link
                key={`${student.rollno}-${idx}`}
                to={`/student/${student.rollno}`}
                className="block rounded border border-[#1e1e1e] bg-[#111111] p-4 transition-colors hover:border-[#333333]"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded bg-[#1e1e1e] font-['JetBrains_Mono'] text-sm text-[#888888]">
                      {rank}
                    </div>
                    <div>
                      <div className="font-['Archivo'] text-sm" title={student.name}>{student.name.length > 15 ? student.name.slice(0, 15) + "..." : student.name}</div>
                      <div className="mt-0.5 font-['JetBrains_Mono'] text-xs text-[#888888]">{student.rollno}</div>
                      <div className="mt-0.5 text-xs text-[#666666]">{student.branch} • {student.year}</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-['JetBrains_Mono'] text-lg text-[#4ade80]">
                      {displayTab === "all" ? (student.scores?.total ?? 0) : (student.scores?.[displayTab] ?? 0)}
                    </div>
                    <div className="text-[10px] text-[#666666]">{displayTab === "all" ? "Total" : "Score"}</div>
                  </div>
                </div>
                {displayTab === "all" && (
                  <div className="mt-3 grid grid-cols-4 gap-2 border-t border-[#1e1e1e] pt-3">
                    {platforms.map((p) => (
                      <div key={p} className="text-center">
                        <div className="mx-auto mb-1 h-3.5 w-3.5 text-[#888888]">{getPlatformIcon(p)}</div>
                        <div className="font-['JetBrains_Mono'] text-xs">{student.scores?.[p] ?? "—"}</div>
                      </div>
                    ))}
                  </div>
                )}
                {displayTab === "github" && student.github?.stats && (
                  <div className="mt-3 grid grid-cols-4 gap-2 border-t border-[#1e1e1e] pt-3 text-center text-xs">
                    <div><div className="text-[#666666]">Repos</div><div className="font-['JetBrains_Mono']">{student.github.stats.publicRepos ?? 0}</div></div>
                    <div><div className="text-[#666666]">Stars</div><div className="font-['JetBrains_Mono']">{student.github.stats.totalStars ?? 0}</div></div>
                    <div><div className="text-[#666666]">Followers</div><div className="font-['JetBrains_Mono']">{student.github.stats.followers ?? 0}</div></div>
                    <div><div className="text-[#666666]">Contribs</div><div className="font-['JetBrains_Mono']">{student.github.stats.contributions ?? 0}</div></div>
                  </div>
                )}
                {displayTab === "leetcode" && student.leetcode?.stats && (
                  <div className="mt-3 grid grid-cols-5 gap-2 border-t border-[#1e1e1e] pt-3 text-center text-xs">
                    <div><div className="text-[#666666]">Easy</div><div className="font-['JetBrains_Mono']">{student.leetcode.stats.easySolved ?? 0}</div></div>
                    <div><div className="text-[#666666]">Med</div><div className="font-['JetBrains_Mono']">{student.leetcode.stats.mediumSolved ?? 0}</div></div>
                    <div><div className="text-[#666666]">Hard</div><div className="font-['JetBrains_Mono']">{student.leetcode.stats.hardSolved ?? 0}</div></div>
                    <div><div className="text-[#666666]">Total</div><div className="font-['JetBrains_Mono']">{student.leetcode.stats.totalSolved ?? 0}</div></div>
                    <div><div className="text-[#666666]">Contest</div><div className="font-['JetBrains_Mono']">{student.leetcode.stats.contestRating ?? 0}</div></div>
                  </div>
                )}
                {displayTab === "codeforces" && student.codeforces?.stats && (
                  <div className="mt-3 grid grid-cols-4 gap-2 border-t border-[#1e1e1e] pt-3 text-center text-xs">
                    <div><div className="text-[#666666]">Rating</div><div className="font-['JetBrains_Mono']">{student.codeforces.stats.rating ?? 0}</div></div>
                    <div><div className="text-[#666666]">Max</div><div className="font-['JetBrains_Mono']">{student.codeforces.stats.maxRating ?? 0}</div></div>
                    <div><div className="text-[#666666]">Rank</div><div className="font-['JetBrains_Mono'] truncate">{student.codeforces.stats.rank ?? "—"}</div></div>
                    <div><div className="text-[#666666]">Solved</div><div className="font-['JetBrains_Mono']">{student.codeforces.stats.problemsSolved ?? 0}</div></div>
                  </div>
                )}
                {displayTab === "codechef" && student.codechef?.stats && (
                  <div className="mt-3 grid grid-cols-4 gap-2 border-t border-[#1e1e1e] pt-3 text-center text-xs">
                    <div><div className="text-[#666666]">Rating</div><div className="font-['JetBrains_Mono']">{student.codechef.stats.currentRating ?? 0}</div></div>
                    <div><div className="text-[#666666]">Max</div><div className="font-['JetBrains_Mono']">{student.codechef.stats.highestRating ?? 0}</div></div>
                    <div><div className="text-[#666666]">Stars</div><div className="font-['JetBrains_Mono']">{student.codechef.stats.stars ?? 0}★</div></div>
                    <div><div className="text-[#666666]">Solved</div><div className="font-['JetBrains_Mono']">{student.codechef.stats.totalProblemsSolved ?? 0}</div></div>
                  </div>
                )}
              </Link>
            );
          })
        )}
      </div>

      {/* Desktop Data Table */}
      <div
        className={`hidden overflow-x-auto overflow-y-visible rounded border border-[#1e1e1e] transition-opacity duration-200 sm:block ${fading ? "opacity-40" : "opacity-100"}`}
      >
        <table className="w-full text-left text-sm">
          <thead className="border-b border-[#1e1e1e] bg-[#111111] font-['JetBrains_Mono']">
            {displayTab === "all" ? (
              <tr>
                <th className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-[#888888]">#</th>
                <th className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-[#888888]">Name</th>
                <th className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-[#888888]">Roll No</th>
                <th className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-[#888888]">Branch</th>
                <th className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-[#888888]">Year</th>
                <th className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-[#888888]">GitHub</th>
                <th className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-[#888888]">LeetCode</th>
                <th className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-[#888888]">Codeforces</th>
                <th className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-[#888888]">CodeChef</th>
                <th className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-[#888888]">Total</th>
              </tr>
            ) : (
              <tr>
                <th className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-[#888888]">#</th>
                <th className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-[#888888]">Name</th>
                <th className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-[#888888]">Roll No</th>
                <th className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-[#888888]">Branch</th>
                <th className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-[#888888]">Year</th>
                {platformColumns[displayTab]?.map((col) => (
                  <SortHeader key={col.statKey} label={col.label} statKey={col.statKey} />
                ))}
                <SortHeader label="Score" statKey={`scores.${displayTab}`} />
              </tr>
            )}
          </thead>
          <tbody className="divide-y divide-[#1e1e1e] font-['Archivo']">
            {initialLoad ? (
              <tr>
                <td colSpan={10} className="px-4 py-8 text-center text-[#888888]">
                  Loading...
                </td>
              </tr>
            ) : students.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-4 py-8 text-center">
                  <div className="space-y-3">
                    <div className="text-[#888888]">No students found</div>
                    {searchQuery && (
                      <div>
                        <div className="mb-2 text-sm text-[#666666]">You&apos;re not on the leaderboard yet.</div>
                        <Link
                          to="/register"
                          className="inline-flex items-center gap-2 rounded bg-[#4ade80] px-4 py-2 text-sm text-[#0a0a0a] transition-opacity hover:opacity-90"
                        >
                          <Zap className="h-3.5 w-3.5" />
                          Claim Your Spot
                        </Link>
                      </div>
                    )}
                  </div>
                </td>
              </tr>
            ) : (
              students.map((student, idx) => {
                const hasFilters = selectedYear !== "all" || selectedBranch !== "all";
                const rank = sortBy && searchQuery
                  ? "—"
                  : sortBy
                  ? idx + 1
                  : displayTab === "all"
                  ? (selectedBranch !== "all" && selectedYear !== "all"
                    ? idx + 1 
                    : selectedBranch !== "all"
                    ? student.ranks?.branchWise
                    : selectedYear !== "all"
                    ? student.ranks?.yearWise
                    : student.ranks?.overall)
                  || idx + 1
                  : hasFilters
                  ? student.filteredRank || idx + 1
                  : student.ranks?.[displayTab] || idx + 1;

                const rankChange =  (
                  displayTab === "all"
                    ? (selectedBranch !== "all" && selectedYear !== "all"
                        ? null
                        : selectedBranch !== "all"
                        ? student.branchRankChange
                        : selectedYear !== "all"
                        ? student.yearRankChange
                        : student.rankChange)
                    : student.rankChange
                    ) ?? 0;
                
                return (
                  <tr key={`${student.rollno}-${idx}`} className="transition-colors hover:bg-[#111111]">
                    <td className="px-4 py-3 font-['JetBrains_Mono'] text-[#888888]">
                     <div className="flex items-center gap-2">
                       <span>{rank}</span>
    
                       <div className={`flex items-center text-[10px] ${rankChange > 0 ? "text-[#4ade80]" : rankChange < 0 ? "text-[#f87171]" : "text-[#555555]"}`}>
                         {rankChange > 0 ? (
                           <>
                             <TrendingUp className="h-3 w-3 mr-0.5" />
                             {Math.abs(rankChange)}
                           </>
                         ) : rankChange < 0 ? (
                           <>
                             <TrendingDown className="h-3 w-3 mr-0.5" />
                             {Math.abs(rankChange)}
                           </>
                         ) : (
                           <Minus className="text-gray-400" size={15} strokeWidth={4} />
                         )}
                       </div>
                     </div>
                   </td>

                    <td className="w-[160px] max-w-[160px] px-4 py-3">
                      <Link
                        to={`/student/${student.rollno}`}
                        className="block transition-colors hover:text-white hover:underline"
                        title={student.name}
                      >
                        {student.name.length > 15 ? student.name.slice(0, 15) + "..." : student.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 font-['JetBrains_Mono'] text-[#888888]">{student.rollno}</td>
                    <td className="px-4 py-3 text-[#888888]">{student.branch}</td>
                    <td className="px-4 py-3 text-[#888888]">{student.year}</td>
                    {displayTab === "all" ? (
                      <>
                        <td className="px-4 py-3 font-['JetBrains_Mono']">
                          {student.scores?.github ?? "—"}
                        </td>
                        <td className="px-4 py-3 font-['JetBrains_Mono']">
                          {student.scores?.leetcode ?? "—"}
                        </td>
                        <td className="px-4 py-3 font-['JetBrains_Mono']">
                          {student.scores?.codeforces ?? "—"}
                        </td>
                        <td className="px-4 py-3 font-['JetBrains_Mono']">
                          {student.scores?.codechef ?? "—"}
                        </td>
                        <td className="px-4 py-3 font-['JetBrains_Mono'] text-[#4ade80]">{student.scores?.total ?? 0}</td>
                      </>
                    ) : platformColumns[displayTab] ? (
                      <>
                        {platformColumns[displayTab].map((col) => {
                          const val = col.getValue(student);
                          return (
                            <td
                              key={col.statKey}
                              className={`px-4 py-3 font-['JetBrains_Mono'] ${sortBy === col.statKey ? "text-[#4ade80]" : ""}`}
                            >
                              {displayTab === "codechef" && col.label === "Stars" ? `${val}★` : val}
                            </td>
                          );
                        })}
                        <td className={`px-4 py-3 font-['JetBrains_Mono'] ${!sortBy || sortBy === `scores.${displayTab}` ? "text-[#4ade80]" : ""}`}>
                          {student.scores?.[displayTab] ?? 0}
                        </td>
                      </>
                    ) : null}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Search result CTA */}
      {searchQuery && students.length > 0 && (
        <div className="mt-4 flex flex-col gap-2 rounded border border-[#1e1e1e] bg-[#111111] px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <span className="text-sm text-[#888888]">
            Found yourself? Your profile might be incomplete.
          </span>
          <Link
            to="/register"
            className="flex items-center gap-2 text-sm text-white transition-opacity hover:opacity-80"
          >
            Complete Profile →
          </Link>
        </div>
      )}

      {/* Infinite scroll sentinel */}
      <div ref={sentinelRef} className="py-1" />
      {loadingMore && (
        <div className="flex items-center justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-[#888888]" />
          <span className="ml-2 font-['Archivo'] text-sm text-[#888888]">Loading more...</span>
        </div>
      )}
      {!loadingMore && students.length > 0 && currentPage >= totalPages && (
        <div className="py-6 text-center font-['Archivo'] text-xs text-[#666666]">
          Showing all {totalCount} students
        </div>
      )}
    </div>
  );
}
