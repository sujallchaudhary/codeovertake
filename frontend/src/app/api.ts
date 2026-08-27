const API_BASE = import.meta.env.VITE_API_URL || "/api";

/**
 * Supplies the bearer token for authenticated endpoints.
 *
 * Clerk session tokens are short-lived and refreshed in the background, so we
 * ask for one per request rather than caching a string. AuthContext installs a
 * provider backed by Clerk's `getToken()`; there is deliberately no localStorage
 * copy, because Clerk owns session persistence.
 */
type TokenProvider = () => Promise<string | null>;

let tokenProvider: TokenProvider | null = null;

export function setTokenProvider(provider: TokenProvider | null) {
  tokenProvider = provider;
}

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options?.headers as Record<string, string> | undefined),
  };

  if (tokenProvider) {
    // A failure here means "not signed in", not "request failed" — public
    // endpoints must still work, so we fall through without a header.
    const token = await tokenProvider().catch(() => null);
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${url}`, { ...options, headers });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const err: any = new Error(body.error || body.message || res.statusText);
    err.status = res.status;
    err.errors = body.errors; // validation errors array
    throw err;
  }
  // 204s and empty bodies would otherwise blow up on res.json()
  if (res.status === 204) return undefined as T;
  return res.json();
}

/** Shared helper for the many list endpoints that take arbitrary query params. */
function toQuery(params: Record<string, unknown> = {}) {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    qs.set(key, String(value));
  });
  return qs.toString();
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


/* ==========================================================================
 * Codolio-style features: accounts, tracker, sheets, kits, portfolio, contests
 * ========================================================================== */

// ---- Auth ----

/**
 * Our local mirror of the Clerk account. Clerk owns credentials, social
 * providers and MFA; everything here is data this app owns, plus a cache of the
 * Clerk profile fields.
 */
export interface AuthUser {
  _id: string;
  clerkUserId: string;
  email: string;
  verifiedEmails: string[];
  handle: string;
  name: string;
  avatarUrl: string;
  headline: string;
  about: string;
  location: string;
  socials: { website: string; linkedin: string; twitter: string };
  /** Only ever set by a verified claim — see the claim endpoints below. */
  rollno: string | null;
  rollnoClaimedAt: string | null;
  platforms: Record<string, {
    username: string;
    verified: boolean;
    stats: Record<string, any>;
    score: number;
    lastFetchedAt: string | null;
    lastFetchFailed: boolean;
  }>;
  githubAuth?: { login: string; connectedAt: string | null };
  education: any[];
  experience: any[];
  projects: any[];
  cScore: { dsa: number; cp: number; dev: number; total: number; balance?: number; updatedAt: string | null };
  revision: {
    streak: number;
    longestStreak: number;
    retentionRating: number;
    totalRevisions: number;
  };
  isPublic: boolean;
  createdAt: string;
}

/** Whether this deployment has Clerk wired up, and the claim email domain. */
export async function fetchAuthConfig() {
  return request<{ clerkConfigured: boolean; instituteEmailDomain: string | null }>("/auth/config");
}

export async function fetchMe() {
  return request<{ user: AuthUser }>("/auth/me");
}

export async function updateAccount(data: Partial<AuthUser> & { handle?: string }) {
  return request<{ user: AuthUser }>("/auth/me", { method: "PUT", body: JSON.stringify(data) });
}

/**
 * Pulls the latest profile and social connections from Clerk immediately,
 * instead of waiting for the `user.updated` webhook. Useful right after linking
 * a provider, and in local development where webhooks cannot reach the server.
 */
export async function syncAccountFromClerk() {
  return request<{ user: AuthUser }>("/auth/sync", { method: "POST" });
}

export async function checkHandle(handle: string) {
  return request<{ handle: string; available: boolean; reason: string | null }>(
    `/auth/check-handle?handle=${encodeURIComponent(handle)}`
  );
}

export async function fetchExtensionToken() {
  return request<{ extensionToken: string }>("/auth/extension-token");
}

export async function rotateExtensionToken() {
  return request<{ extensionToken: string }>("/auth/extension-token/rotate", { method: "POST" });
}

// ---- Contests (Event Tracker) ----

export interface Contest {
  id: string;
  platform: string;
  name: string;
  url: string;
  registrationUrl: string;
  startTime: string;
  endTime: string;
  durationSeconds: number;
  contestType: string;
  ratedRange: string;
  status: "upcoming" | "ongoing" | "finished";
  googleCalendarUrl: string;
}

export async function fetchContests(params: {
  from?: string; to?: string; platforms?: string; status?: string; limit?: number;
} = {}) {
  return request<{ contests: Contest[]; platforms: Array<{ key: string; label: string }> }>(
    `/contests?${toQuery(params)}`
  );
}

export async function fetchUpcomingContests(params: { platforms?: string; limit?: number } = {}) {
  return request<{ contests: Contest[] }>(`/contests/upcoming?${toQuery(params)}`);
}

export async function fetchContestCalendar(year: number, month: number, platforms?: string) {
  return request<{
    year: number;
    month: number;
    contests: Contest[];
    byDate: Record<string, string[]>;
  }>(`/contests/calendar?${toQuery({ year, month, platforms })}`);
}

// ---- Problems ----

export interface Problem {
  _id: string;
  id?: string;
  platform: string;
  slug: string;
  title: string;
  url: string;
  difficulty: "easy" | "medium" | "hard" | "unrated";
  rating: number;
  topics: string[];
  companies?: Array<{ name: string; slug: string; frequency: number; buckets: string[] }>;
  isPremium: boolean;
  acceptanceRate: number;
}

export async function searchProblems(params: {
  q?: string; platform?: string; difficulty?: string; topic?: string; limit?: number;
} = {}) {
  return request<{ problems: Problem[]; source: string }>(`/problems/search?${toQuery(params)}`);
}

export async function resolveProblemUrl(url: string) {
  return request<{ problem: Problem }>("/problems/resolve", {
    method: "POST",
    body: JSON.stringify({ url }),
  });
}

export async function fetchProblemTopics() {
  return request<{ topics: string[] }>("/problems/topics");
}

export async function fetchProblemPlatforms() {
  return request<{
    platforms: Array<{ key: string; label: string }>;
    labels: Record<string, string>;
  }>("/problems/platforms");
}

// ---- Workspace (Question Tracker) ----

export interface TrackedQuestion {
  id: string;
  _id: string;
  problem: Problem;
  status: "solved" | "unsolved";
  solvedAt: string | null;
  starred: boolean;
  tags: string[];
  source: string;
  sourceSheet?: { title: string; slug: string } | null;
  memoryScore: number;
  isDue: boolean;
  revision: {
    repetitions: number;
    intervalDays: number;
    easeFactor: number;
    stabilityDays: number;
    lastRating: string | null;
    lastRevisedAt: string | null;
    dueAt: string | null;
    reviewCount: number;
  };
  createdAt: string;
}

export interface WorkspaceQuery {
  status?: string;
  starred?: boolean | string;
  tag?: string;
  topic?: string;
  difficulty?: string;
  platform?: string;
  search?: string;
  sortBy?: string;
  order?: string;
  page?: number;
  limit?: number;
}

export async function fetchWorkspace(params: WorkspaceQuery = {}) {
  return request<{
    questions: TrackedQuestion[];
    pagination: { page: number; limit: number; total: number; pages: number };
  }>(`/workspace?${toQuery(params as Record<string, unknown>)}`);
}

export interface WorkspaceStats {
  total: number;
  solved: number;
  unsolved: number;
  starred: number;
  difficulty: Record<string, number>;
  difficultySolved: Record<string, number>;
  platforms: Array<{ platform: string; total: number; solved: number }>;
  topics: Array<{ topic: string; total: number; solved: number }>;
  retention: {
    rating: number;
    label: string;
    streak: number;
    longestStreak: number;
    totalRevisions: number;
  };
}

export async function fetchWorkspaceStats() {
  return request<WorkspaceStats>("/workspace/stats");
}

export async function fetchWorkspaceTags() {
  return request<{ tags: Array<{ name: string; count: number }> }>("/workspace/tags");
}

export async function addToWorkspace(data: {
  url?: string; problemId?: string; status?: string; starred?: boolean; tags?: string[];
}) {
  return request<{ question: TrackedQuestion; created: boolean }>("/workspace", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function fetchWorkspaceQuestion(id: string) {
  return request<{ question: TrackedQuestion; notes: Note[] }>(`/workspace/${id}`);
}

export async function updateWorkspaceQuestion(
  id: string,
  data: { starred?: boolean; tags?: string[]; status?: string }
) {
  return request<{ question: TrackedQuestion }>(`/workspace/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export async function setQuestionStatus(id: string, status: "solved" | "unsolved") {
  return request<{ question: TrackedQuestion }>(`/workspace/${id}/status`, {
    method: "PUT",
    body: JSON.stringify({ status }),
  });
}

export async function removeFromWorkspace(id: string) {
  return request<{ message: string; id: string }>(`/workspace/${id}`, { method: "DELETE" });
}

// ---- Notes (linked notes) ----

export interface Note {
  _id: string;
  id?: string;
  title: string;
  content: string;
  linkedProblems: Problem[] | string[];
  tags: string[];
  pinned: boolean;
  isGeneral: boolean;
  createdAt: string;
  updatedAt: string;
}

export async function fetchNotes(params: {
  q?: string; general?: boolean | string; problemId?: string; tag?: string; page?: number; limit?: number;
} = {}) {
  return request<{
    notes: Note[];
    pagination: { page: number; limit: number; total: number; pages: number };
  }>(`/notes?${toQuery(params as Record<string, unknown>)}`);
}

export async function fetchNotesForProblem(problemId: string) {
  return request<{ notes: Note[] }>(`/notes/for-problem/${problemId}`);
}

export async function createNote(data: {
  title: string; content?: string; linkedProblems?: string[]; tags?: string[]; pinned?: boolean;
}) {
  return request<{ note: Note }>("/notes", { method: "POST", body: JSON.stringify(data) });
}

export async function fetchNote(id: string) {
  return request<{ note: Note }>(`/notes/${id}`);
}

export async function updateNote(id: string, data: Partial<{
  title: string; content: string; linkedProblems: string[]; tags: string[]; pinned: boolean;
}>) {
  return request<{ note: Note }>(`/notes/${id}`, { method: "PUT", body: JSON.stringify(data) });
}

export async function deleteNote(id: string) {
  return request<{ message: string; id: string }>(`/notes/${id}`, { method: "DELETE" });
}

export async function linkNoteToProblem(noteId: string, problem: string) {
  return request<{ note: Note }>(`/notes/${noteId}/links`, {
    method: "POST",
    body: JSON.stringify({ problem }),
  });
}

export async function unlinkNoteFromProblem(noteId: string, problemId: string) {
  return request<{ note: Note }>(`/notes/${noteId}/links/${problemId}`, { method: "DELETE" });
}

export async function fetchNoteTags() {
  return request<{ tags: Array<{ name: string; count: number }> }>("/notes/tags");
}

// ---- Revision (spaced repetition) ----

export type RevisionRating = "struggled" | "tough" | "got-it" | "nailed-it";

export interface RevisionQueue {
  locked: boolean;
  unlockAt?: number;
  solvedCount: number;
  remaining?: number;
  dateKey: string;
  queueSize: number;
  items: Array<{
    trackedQuestionId: string;
    problem: Problem;
    memoryScoreAtBuild: number;
    done: boolean;
    rating: string | null;
  }>;
  doneCount?: number;
  total?: number;
  completed?: boolean;
  ratings?: Array<{ value: RevisionRating; label: string }>;
}

export async function fetchRevisionQueue() {
  return request<RevisionQueue>("/revision/queue");
}

export interface RevisionStats {
  retention: {
    rating: number;
    label: string;
    solvedTracked: number;
    buckets: { strong: number; fading: number; weak: number; critical: number };
  };
  streak: number;
  longestStreak: number;
  totalRevisions: number;
  dueNow: number;
  todayCompleted: boolean;
  todayDone: number;
  heatmap: Record<string, number>;
  forecast: Array<{ days: number; rating: number }>;
}

export async function fetchRevisionStats() {
  return request<RevisionStats>("/revision/stats");
}

export async function fetchDueQuestions(limit = 50) {
  return request<{ questions: TrackedQuestion[] }>(`/revision/due?limit=${limit}`);
}

export async function fetchRecentRevisions(limit = 20) {
  return request<{ revisions: any[] }>(`/revision/recent?limit=${limit}`);
}

export async function rateRevision(trackedQuestionId: string, rating: RevisionRating) {
  return request<{
    question: { id: string; revision: any; memoryScore: number };
    nextReviewInDays: number;
    nextReviewAt: string;
    retention: { rating: number; label: string };
    queueCompleted: boolean;
    streak?: number;
  }>(`/revision/${trackedQuestionId}/rate`, {
    method: "POST",
    body: JSON.stringify({ rating }),
  });
}

// ---- Sheets ----

export interface SheetQuestion {
  problem: Problem;
  order: number;
  hint: string;
  status: "solved" | "unsolved";
  starred: boolean;
  tags: string[];
  trackedQuestionId: string | null;
}

export interface SheetSubsection {
  id: string;
  title: string;
  order: number;
  questions: SheetQuestion[];
}

export interface SheetSection {
  id: string;
  title: string;
  order: number;
  questions: SheetQuestion[];
  subsections: SheetSubsection[];
}

export interface SheetSummary {
  _id: string;
  id: string;
  title: string;
  slug: string;
  description: string;
  category: string;
  visibility: string;
  isCurated: boolean;
  curator: string;
  tags: string[];
  icon: string;
  owner?: { name: string; handle: string; avatarUrl: string } | null;
  questionCount: number;
  followerCount: number;
  isFollowing: boolean;
  isOwner: boolean;
  progress: { total: number; solved: number; percent: number } | null;
}

export interface SheetDetail extends Omit<SheetSummary, "progress" | "isFollowing" | "isOwner"> {
  questions: SheetQuestion[];
  sections: SheetSection[];
  collaborators: Array<{ email: string; addedAt: string }>;
}

export interface SheetResponse {
  sheet: SheetDetail;
  permissions: { canEdit: boolean; canTrack: boolean; isFollowing: boolean; isOwner: boolean };
  progress: {
    total: number;
    solved: number;
    percent: number;
    byDifficulty: Record<string, { total: number; solved: number }>;
  };
}

export async function fetchSheets(params: {
  scope?: "explore" | "mine" | "followed"; category?: string; q?: string; page?: number; limit?: number;
} = {}) {
  return request<{
    sheets: SheetSummary[];
    pagination: { page: number; limit: number; total: number; pages: number };
    categories: string[];
  }>(`/sheets?${toQuery(params)}`);
}

export async function fetchSheet(idOrSlug: string) {
  return request<SheetResponse>(`/sheets/${encodeURIComponent(idOrSlug)}`);
}

export async function createSheet(data: {
  title: string; description?: string; visibility?: string; tags?: string[]; icon?: string;
}) {
  return request<SheetResponse>("/sheets", { method: "POST", body: JSON.stringify(data) });
}

export async function updateSheet(idOrSlug: string, data: Partial<{
  title: string; description: string; visibility: string; tags: string[]; icon: string;
}>) {
  return request<SheetResponse>(`/sheets/${encodeURIComponent(idOrSlug)}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export async function deleteSheet(idOrSlug: string) {
  return request<{ message: string; id: string }>(`/sheets/${encodeURIComponent(idOrSlug)}`, {
    method: "DELETE",
  });
}

export async function addSheetSection(idOrSlug: string, data: { title: string; parentSectionId?: string }) {
  return request<SheetResponse>(`/sheets/${encodeURIComponent(idOrSlug)}/sections`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function renameSheetSection(
  idOrSlug: string,
  sectionId: string,
  data: { title: string; subsectionId?: string }
) {
  return request<SheetResponse>(`/sheets/${encodeURIComponent(idOrSlug)}/sections/${sectionId}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export async function deleteSheetSection(idOrSlug: string, sectionId: string, subsectionId?: string) {
  return request<SheetResponse>(
    `/sheets/${encodeURIComponent(idOrSlug)}/sections/${sectionId}?${toQuery({ subsectionId })}`,
    { method: "DELETE" }
  );
}

export async function addSheetQuestion(idOrSlug: string, data: {
  url?: string; problemId?: string; sectionId?: string; subsectionId?: string; hint?: string;
}) {
  return request<SheetResponse>(`/sheets/${encodeURIComponent(idOrSlug)}/questions`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function removeSheetQuestion(idOrSlug: string, problemId: string, location: {
  sectionId?: string; subsectionId?: string;
} = {}) {
  return request<SheetResponse>(
    `/sheets/${encodeURIComponent(idOrSlug)}/questions/${problemId}?${toQuery(location)}`,
    { method: "DELETE" }
  );
}

export async function moveSheetQuestion(idOrSlug: string, data: {
  problemId: string;
  fromSectionId?: string | null;
  fromSubsectionId?: string | null;
  toSectionId?: string | null;
  toSubsectionId?: string | null;
  toIndex?: number;
}) {
  return request<SheetResponse>(`/sheets/${encodeURIComponent(idOrSlug)}/questions/move`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export async function importSheetQuestions(idOrSlug: string, csv: string) {
  return request<{
    imported: number;
    skipped: number;
    totalRows: number;
    failures: Array<{ url: string; message: string }>;
    sheet: SheetDetail;
  }>(`/sheets/${encodeURIComponent(idOrSlug)}/import`, {
    method: "POST",
    body: JSON.stringify({ csv }),
  });
}

export async function trackSheetQuestion(idOrSlug: string, problemId: string, data: {
  status?: string; starred?: boolean; tags?: string[];
}) {
  return request<{ question: TrackedQuestion }>(
    `/sheets/${encodeURIComponent(idOrSlug)}/questions/${problemId}/track`,
    { method: "PUT", body: JSON.stringify(data) }
  );
}

export async function followSheet(idOrSlug: string) {
  return request<{ message: string; isFollowing: boolean; questionsAdded?: number }>(
    `/sheets/${encodeURIComponent(idOrSlug)}/follow`,
    { method: "POST" }
  );
}

export async function unfollowSheet(idOrSlug: string) {
  return request<{ message: string; isFollowing: boolean }>(
    `/sheets/${encodeURIComponent(idOrSlug)}/follow`,
    { method: "DELETE" }
  );
}

export async function addSheetCollaborator(idOrSlug: string, email: string) {
  return request<{ message: string; collaborators: Array<{ email: string; addedAt: string }> }>(
    `/sheets/${encodeURIComponent(idOrSlug)}/collaborators`,
    { method: "POST", body: JSON.stringify({ email }) }
  );
}

export async function removeSheetCollaborator(idOrSlug: string, email: string) {
  return request<{ message: string; collaborators: Array<{ email: string; addedAt: string }> }>(
    `/sheets/${encodeURIComponent(idOrSlug)}/collaborators/${encodeURIComponent(email)}`,
    { method: "DELETE" }
  );
}

// ---- Company interview kits ----

export interface CompanySummary {
  slug: string;
  name: string;
  total: number;
  difficulty: { easy: number; medium: number; hard: number };
  recent45: number;
  recent6m: number;
}

export async function fetchCompanies(params: { q?: string; page?: number; limit?: number } = {}) {
  return request<{
    companies: CompanySummary[];
    pagination: { page: number; limit: number; total: number; pages: number };
    buckets: Array<{ value: string; label: string }>;
  }>(`/companies?${toQuery(params)}`);
}

export async function fetchCompanyKit(slug: string, params: {
  bucket?: string; difficulty?: string; topic?: string; sortBy?: string; page?: number; limit?: number;
} = {}) {
  return request<{
    company: { slug: string; name: string };
    bucket: string;
    buckets: Array<{ value: string; label: string; count: number }>;
    problems: Array<Problem & {
      id: string; frequency: number; status: string; starred: boolean; trackedQuestionId: string | null;
    }>;
    progress: { solvedOnPage: number; total: number };
    pagination: { page: number; limit: number; total: number; pages: number };
  }>(`/companies/${encodeURIComponent(slug)}?${toQuery(params)}`);
}

// ---- Portfolio (Profile Tracker) ----

export interface PortfolioPlatformMeta {
  key: string;
  label: string;
  statsSupported: boolean;
  countsTowardsLeaderboard: boolean;
  verificationField: string;
  profileStats: Array<{ label: string; statKey: string }>;
  profileUrlTemplate: string;
}

export async function fetchPortfolioPlatforms() {
  return request<{ platforms: PortfolioPlatformMeta[] }>("/portfolio/platforms");
}

export interface Portfolio {
  profile: {
    handle: string; name: string; avatarUrl: string; headline: string; about: string;
    location: string; socials: { website: string; linkedin: string; twitter: string };
    rollno: string | null; createdAt: string;
  };
  devCard: { unlocked: boolean; verifiedPlatforms: string[] };
  cScore: { dsa: number; cp: number; dev: number; total: number; balance?: number; updatedAt: string | null };
  platforms: Array<{
    key: string; label: string; username: string; verified: boolean; statsSupported: boolean;
    stats: Record<string, any>; score: number; profileUrl: string;
    profileStats: Array<{ label: string; statKey: string }>;
    lastFetchedAt: string | null; lastFetchFailed: boolean;
  }>;
  projects: any[];
  education: any[];
  experience: any[];
  practice: {
    tracked: number; solved: number; retentionRating: number;
    retentionLabel: string; revisionStreak: number;
  };
  leaderboard: any | null;
  isOwner: boolean;
  sync: { synced: boolean; lastSyncedAt: string; retryInSeconds: number } | null;
}

export async function fetchPortfolio(handle: string) {
  return request<Portfolio>(`/portfolio/u/${encodeURIComponent(handle)}`);
}

export async function syncPortfolio(force = false) {
  return request<{
    synced: boolean; cooldown: boolean; retryInSeconds?: number;
    lastSyncedAt: string; cScore: any; platforms?: Record<string, any>;
  }>("/portfolio/sync", { method: "POST", body: JSON.stringify({ force }) });
}

export async function setPortfolioPlatform(platform: string, username: string) {
  return request<{
    platform: string; username: string; verified: boolean; stats: any; score: number;
    verification: { code: string; field: string };
  }>(`/portfolio/platforms/${platform}`, { method: "PUT", body: JSON.stringify({ username }) });
}

export async function fetchPlatformVerification(platform: string) {
  return request<{
    platform: string; label: string; username: string; verified: boolean;
    code: string; field: string; instructions: string;
  }>(`/portfolio/platforms/${platform}/verification`);
}

export async function verifyPlatform(platform: string) {
  return request<{ platform: string; verified: boolean; method?: string }>(
    `/portfolio/platforms/${platform}/verify`,
    { method: "POST" }
  );
}

export async function removePortfolioPlatform(platform: string) {
  return request<{ platform: string; removed: boolean; cScore: any }>(
    `/portfolio/platforms/${platform}`,
    { method: "DELETE" }
  );
}

export async function fetchGithubRepos() {
  return request<{
    repos: Array<{
      name: string; fullName: string; description: string; url: string; homepage: string;
      language: string; topics: string[]; stars: number; forks: number;
      updatedAt: string; isPrivate: boolean; alreadyAdded: boolean;
    }>;
  }>("/portfolio/github/repos");
}

export async function addProject(data: Record<string, unknown>) {
  return request<{ projects: any[] }>("/portfolio/projects", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function updateProject(projectId: string, data: Record<string, unknown>) {
  return request<{ project: any }>(`/portfolio/projects/${projectId}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export async function deleteProject(projectId: string) {
  return request<{ message: string; id: string }>(`/portfolio/projects/${projectId}`, {
    method: "DELETE",
  });
}

export async function reorderProjects(order: string[]) {
  return request<{ projects: any[] }>("/portfolio/projects/reorder", {
    method: "PUT",
    body: JSON.stringify({ order }),
  });
}

export async function fetchProjectPage(handle: string, projectId: string) {
  return request<{
    project: any;
    owner: { name: string; handle: string; avatarUrl: string; headline: string };
  }>(`/portfolio/u/${encodeURIComponent(handle)}/projects/${projectId}`);
}

export async function upvoteProject(handle: string, projectId: string) {
  return request<{ upvoted: boolean; upvotes: number }>(
    `/portfolio/u/${encodeURIComponent(handle)}/projects/${projectId}/upvote`,
    { method: "POST" }
  );
}

export async function addEducation(data: Record<string, unknown>) {
  return request<{ education: any[] }>("/portfolio/education", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function updateEducation(itemId: string, data: Record<string, unknown>) {
  return request<{ education: any[] }>(`/portfolio/education/${itemId}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export async function deleteEducation(itemId: string) {
  return request<{ education: any[] }>(`/portfolio/education/${itemId}`, { method: "DELETE" });
}

export async function addExperience(data: Record<string, unknown>) {
  return request<{ experience: any[] }>("/portfolio/experience", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function updateExperience(itemId: string, data: Record<string, unknown>) {
  return request<{ experience: any[] }>(`/portfolio/experience/${itemId}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export async function deleteExperience(itemId: string) {
  return request<{ experience: any[] }>(`/portfolio/experience/${itemId}`, { method: "DELETE" });
}

export async function fetchCScoreLeaderboard(params: { page?: number; limit?: number } = {}) {
  return request<{
    users: Array<{
      rank: number; handle: string; name: string; avatarUrl: string; headline: string;
      cScore: { dsa: number; cp: number; dev: number; total: number };
      verifiedPlatforms: string[];
    }>;
    pagination: { page: number; limit: number; total: number; pages: number };
  }>(`/portfolio/leaderboard?${toQuery(params)}`);
}


// ---- Claiming a leaderboard profile ----

/**
 * The leaderboard's `Student` records predate accounts, so most have no owner.
 * These endpoints let a signed-in user prove a roll number is theirs. See
 * backend/services/claimService.js for the three proof paths.
 */
export interface ClaimProofOption {
  platform: string;
  label: string;
  /** Masked so probing roll numbers cannot harvest someone's handles. */
  maskedUsername: string;
  verificationField: string;
  /** True when this handle is already verified on the caller's portfolio. */
  alreadyVerified: boolean;
}

export interface ClaimStatus {
  rollno: string;
  name: string;
  branch: string;
  year: number;
  claimed: boolean;
  isMine: boolean;
  claimedBy: { handle: string; name: string } | null;
  claimedAt: string | null;
  proofOptions: ClaimProofOption[];
  instituteEmail: { available: boolean; email?: string; domain?: string | null };
  pendingClaim: {
    platform: string;
    code: string;
    field: string;
    expiresAt: string;
  } | null;
}

export interface ClaimResult {
  claimed: boolean;
  method: string;
  rollno: string;
  message: string;
}

export async function fetchClaimStatus(rollno: string) {
  return request<ClaimStatus>(`/claims/${encodeURIComponent(rollno)}`);
}

export async function fetchMyClaim() {
  return request<{ claimed: boolean; student: any | null }>("/claims/mine");
}

/** Instant path: the record's handle is already verified on the portfolio. */
export async function claimWithVerifiedPlatform(rollno: string, platform: string) {
  return request<ClaimResult>(`/claims/${encodeURIComponent(rollno)}/claim-verified`, {
    method: "POST",
    body: JSON.stringify({ platform }),
  });
}

/** Step 1 of the code path: issue a one-time code for a platform on the record. */
export async function startClaim(rollno: string, platform: string) {
  return request<{
    rollno: string;
    platform: string;
    label: string;
    maskedUsername: string;
    code: string;
    field: string;
    expiresAt: string;
    instructions: string;
  }>(`/claims/${encodeURIComponent(rollno)}/start`, {
    method: "POST",
    body: JSON.stringify({ platform }),
  });
}

/** Step 2: we read the platform profile back and look for the code. */
export async function verifyClaim(rollno: string) {
  return request<ClaimResult>(`/claims/${encodeURIComponent(rollno)}/verify`, { method: "POST" });
}

/** Fallback path: a Clerk-verified institute email plus a name match. */
export async function claimWithInstituteEmail(rollno: string) {
  return request<ClaimResult>(`/claims/${encodeURIComponent(rollno)}/claim-email`, {
    method: "POST",
  });
}

export async function releaseClaim(rollno: string) {
  return request<{ released: boolean; rollno: string }>(`/claims/${encodeURIComponent(rollno)}`, {
    method: "DELETE",
  });
}
