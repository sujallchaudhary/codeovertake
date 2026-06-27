const API_BASE = import.meta.env.VITE_API_URL || "/api";

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${url}`, {
    headers: { "Content-Type": "application/json", ...options?.headers },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const err: any = new Error(body.error || body.message || res.statusText);
    err.status = res.status;
    err.errors = body.errors; // validation errors array
    throw err;
  }
  return res.json();
}

// ---- Leaderboard ----

export interface LeaderboardQuery {
  year?: number | string;
  branch?: string;
  search?: string;
  sortBy?: string;
  order?: string;
  page?: number;
  limit?: number;
}

export async function fetchLeaderboard(params: LeaderboardQuery = {}) {
  const qs = new URLSearchParams();
  if (params.year) qs.set("year", String(params.year));
  if (params.branch) qs.set("branch", params.branch);
  if (params.search) qs.set("search", params.search);
  if (params.sortBy) qs.set("sortBy", params.sortBy);
  if (params.order) qs.set("order", params.order);
  if (params.page) qs.set("page", String(params.page));
  if (params.limit) qs.set("limit", String(params.limit));
  return request<{ students: any[]; pagination: { page: number; limit: number; total: number; pages: number } }>(
    `/leaderboard?${qs}`
  );
}

export async function fetchPlatformLeaderboard(platform: string, params: LeaderboardQuery = {}) {
  const qs = new URLSearchParams();
  if (params.year) qs.set("year", String(params.year));
  if (params.branch) qs.set("branch", params.branch);
  if (params.search) qs.set("search", params.search);
  if (params.sortBy) qs.set("sortBy", params.sortBy);
  if (params.order) qs.set("order", params.order);
  if (params.page) qs.set("page", String(params.page));
  if (params.limit) qs.set("limit", String(params.limit));
  return request<{ students: any[]; pagination: { page: number; limit: number; total: number; pages: number } }>(
    `/leaderboard/${platform}?${qs}`
  );
}

export async function fetchTopGainers(params: LeaderboardQuery = {}) {
  const qs = new URLSearchParams();
  
  if (params.year) qs.set("year", String(params.year));
  if (params.branch) qs.set("branch", params.branch);
  if (params.search) qs.set("search", params.search);
  if (params.page) qs.set("page", String(params.page));

  qs.set("limit", String(params.limit || 50));

  return request<{
    gainers: Array<{
      rollno: string;
      name: string;
      branch: string;
      year: number;
      gain: number;
      currentScore: number;
      previousScore: number;
    }>;
    pagination: { page: number; limit: number; total: number; pages: number };
    period: { from: string; to: string };
  }>(`/leaderboard/top-gainers?${qs}`);
}

export async function fetchFilters() {
  return request<{
    years: number[];
    branches: string[];
    platforms: Array<{
      key: string;
      label: string;
      headers: Array<{ label: string; statKey: string }>;
      profileStats: Array<{ label: string; statKey: string }>;
      profileUrl: string | null;
    }>;
  }>("/leaderboard/filters");
}

// ---- Analytics ----

export interface AnalyticsOverview {
  summary: {
    totalStudents: number;
    linkedStudents: number;
    linkedPercentage: number;
    averageTotalScore: number;
    medianTotalScore: number;
    maxTotalScore: number;
    averageDeltaFromPreviousSnapshot: number;
    latestSnapshotDate: string | null;
  };
  platformCoverage: Array<{
    platform: "github" | "leetcode" | "codeforces" | "codechef";
    linkedCount: number;
    linkedPercentage: number;
    averageScore: number;
  }>;
  branchDistribution: Array<{ branch: string; count: number; averageScore: number }>;
  yearDistribution: Array<{ year: number; count: number; averageScore: number }>;
  scoreDistribution: Array<{ range: string; count: number }>;
  trend: Array<{
    date: string;
    avgTotal: number;
    maxTotal: number;
    avgGithub: number;
    avgLeetcode: number;
    avgCodeforces: number;
    avgCodechef: number;
    students: number;
  }>;
  topStudents: Array<{
    rollno: string;
    name: string;
    branch: string;
    year: number;
    totalScore: number;
    overallRank: number | null;
  }>;
  registrationsTrend: Array<{ date: string; count: number }>;
  platformEngagement: Array<{ platforms: number; count: number }>;
  platformStatAverages: {
    github: { avgRepos: number; avgStars: number; avgFollowers: number; avgContributions: number };
    leetcode: { avgTotalSolved: number; avgEasySolved: number; avgMediumSolved: number; avgHardSolved: number; avgContestRating: number };
    codeforces: { avgRating: number; avgMaxRating: number; avgProblemsSolved: number };
    codechef: { avgCurrentRating: number; avgHighestRating: number; avgProblemsSolved: number };
  };
  topPerPlatform: Array<{
    platform: string;
    student: { rollno: string; name: string; username: string; score: number } | null;
  }>;
  scoreBellCurve: Array<{ score: number; students: number }>;
}

export async function fetchAnalyticsOverview(date?: string) {
  const qs = date ? `?date=${encodeURIComponent(date)}` : "";
  return request<AnalyticsOverview>(`/analytics/overview${qs}`);
}

export async function fetchAnalyticsDates() {
  return request<{ dates: string[] }>("/analytics/dates");
}

// ---- Students ----

export async function searchStudents(q: string) {
  return request<{
    results: Array<{
      rollno: string;
      name: string;
      branch: string;
      year: number;
      exists: boolean;
    }>;
  }>(`/students/search?q=${encodeURIComponent(q)}`);
}

export async function validatePlatformUsername(platform: string, username: string) {
  return request<{ valid: boolean; stats?: Record<string, any> }>(
    `/students/validate-username/${encodeURIComponent(platform)}/${encodeURIComponent(username)}`
  );
}

export async function lookupStudent(rollno: string) {
  return request<{
    exists: boolean;
    student: {
      rollno: string;
      name: string;
      branch: string;
      branchFull?: string;
      year: number | null;
      github?: string;
      leetcode?: string;
      codeforces?: string;
      codechef?: string;
    };
  }>(`/students/lookup/${encodeURIComponent(rollno)}`);
}

export async function registerStudent(data: {
  rollno: string;
  name: string;
  branch: string;
  year: string | number;
  github?: string;
  leetcode?: string;
  codeforces?: string;
  codechef?: string;
}) {
  return request<{ message: string; student: any }>("/students/register", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function fetchStudent(rollno: string) {
  return request<any>(`/students/${encodeURIComponent(rollno)}`);
}

export async function updateUsernames(
  rollno: string,
  usernames: { github?: string; leetcode?: string; codeforces?: string; codechef?: string }
) {
  return request<{ message: string; student: any }>(`/students/${encodeURIComponent(rollno)}/usernames`, {
    method: "PUT",
    body: JSON.stringify(usernames),
  });
}

export async function restoreUsernames(rollno: string, index: number) {
  return request<{ message: string; student: any }>(`/students/${encodeURIComponent(rollno)}/restore`, {
    method: "POST",
    body: JSON.stringify({ index }),
  });
}

export async function fetchStudentHistory(rollno: string, days = 30) {
  return request<{
    rollno: string;
    snapshots: Array<{
      date: string;
      scores: { github: number; leetcode: number; codeforces: number; codechef: number; total: number };
      ranks?: { overall: number; yearWise: number; branchWise: number };
    }>;
  }>(`/students/${encodeURIComponent(rollno)}/history?days=${days}`);
}

export async function fetchHeatmap(rollno: string) {
  return request<Record<string, Record<string, number>>>(`/students/${encodeURIComponent(rollno)}/heatmap`);
}

export async function fetchBranches() {
  return request<any>("/students/branches");
}

// ---- Results (CGPA) ----

export interface StudentResults {
  rollNo: string;
  name: string;
  branch_code: string;
  year_of_study: string;
  cgpa: number;
  rank: number;
  branch_rank: number;
  percentile: number;
  credits_completed: number;
  semesters: Array<{
    semester: string;
    sgpa: number;
    credits_registered: number | string;
    credits_secured: number | string;
    subjects: Array<{
      subject_code: string;
      grade: string;
      marks: number | string;
    }>;
  }>;
}

const RESULTHUB_API_BASE = "https://api.resulthubnsut.com";

export async function fetchStudentResults(rollno: string): Promise<StudentResults | null> {
  try {
    const res = await fetch(`${RESULTHUB_API_BASE}/api/nsut/students/${encodeURIComponent(rollno)}`);
    if (!res.ok) return null;
    const json = await res.json();
    if (!json.success) return null;
    return json.data;
  } catch {
    return null;
  }
}

// ---- Contributors ----

export const fetchContributors = async () => {
  try {
    return await request<any[]>("/contributors");
  } catch (error) {
    console.error("Failed to fetch contributors:", error);
    return [];
  }
};
