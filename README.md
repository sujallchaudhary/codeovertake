# CodeOvertake

A unified coding leaderboard for NSUT students, plus a personal practice tracker
and portfolio builder. Ranks profiles across **GitHub**, **LeetCode**,
**Codeforces** and **CodeChef** from live platform data, and gives every user a
workspace, sheets, spaced-repetition revision, company kits, a contest calendar
and a recruiter-ready portfolio.

**CodeOvertake = Leaderboard + Tracker + Portfolio + Contest Manager**

## Features

### Leaderboard

- **Multi-Platform Scoring** — Aggregates stats from 4 platforms into a single score (max 4000)
- **Live Leaderboard** — Overall, year-wise, and branch-wise rankings with search, filters, and infinite scroll
- **Platform Leaderboards** — Dedicated tabs with platform-specific stats (repos, stars, problems solved, ratings, etc.)
- **Student Profiles** — Detailed breakdown, platform links, DiceBear avatars, score history chart, profile completeness
- **Top Gainers** — Daily spotlight on students climbing the fastest
- **Real-Time Validation** — Username validation with live preview cards during registration
- **Automated Updates** — Cron job fetches fresh data daily with per-platform rate-limit-aware concurrency
- **History Tracking** — Daily snapshots for trend analysis
- **CSV Seeding** — Bulk import students from CSV with GitHub username extraction
- **About Page** — Transparent scoring formulas and ranking system explained

### Question Tracker (My Workspace)

- **One catalog, every platform** — Paste a link from LeetCode, Codeforces,
  CodeChef, GeeksforGeeks, AtCoder, HackerRank, InterviewBit, Code360 or SPOJ and
  the title, difficulty and topics are fetched for you
- **Solve once, reflected everywhere** — Status lives on your tracked question,
  so marking a problem solved updates every sheet that contains it
- **Custom tags and stars** — Model your own workflow (`Tricky`, `Attempted`,
  `Revise next week`) and filter by status, tag, topic, difficulty or platform

### Linked notes

- **Write once, see everywhere** — A note can be linked to many problems, so a
  "sliding window template" written on one question appears on all of them
- **Standalone notes** — Cheat sheets and revision summaries with no problem attached

### Spaced-repetition revision

- **Daily queue of 5** — The questions whose memory has drained the most,
  unlocking once you have 20 solved, stable until midnight
- **Four confidence ratings** — Struggling snaps the interval back to tomorrow;
  confident answers stretch it further out (SM-2 derived)
- **Retention Rating** — Per-question memory modelled as exponential decay
  (`exp(-days / stability)`), averaged into a single 0–100 reading, with a
  four-week "if you stop revising" forecast
- **Streaks** — Built from days where you finished the whole queue

### Sheets

- **Curated library** — Blind 75, DP Mastery, Graph Mastery, CP-31, Quick
  Revision and GfG Essentials ship with the app
- **Custom sheets** — Topic → subtopic hierarchy, drag-free reordering, public or
  private, with per-question progress
- **Follow to track** — Following a public sheet copies its questions into your
  workspace; unfollowing keeps everything you solved
- **Collaborators** — Invite by email to co-edit the question list. They never
  see your progress and you never see theirs
- **Bulk import** — Upload a CSV with a `problemUrl` column (optional `topic` /
  `subTopic`) and the whole structure is built for you

### Company interview kits

- Curated question banks per company with **All-Time**, **Last 6 Months** and
  **Last 45 Days** preparation modes
- GeeksforGeeks company tags are imported automatically when a GfG problem is resolved

### Portfolio (Profile Tracker)

- **One link instead of five** — `/u/<handle>` aggregates every platform you connect
- **C-Score** — A 0–1000 metric across DSA, Competitive Programming and
  Development that rewards being balanced rather than spiking in one pillar
- **Verification** — Prove ownership by pasting a one-time code into a specific
  profile field. No passwords, ever. Verified profiles unlock the Dev Card and
  the C-Score leaderboard
- **Projects** — Pick a repository from GitHub, add tech stack, screenshots and a
  demo link, reorder them, and collect upvotes
- **On-demand sync** — Stats refresh when you open your own profile, throttled to
  once every 15 minutes
- **GitHub SSO** — OAuth sign-in that also verifies your development pillar

### Contest tracker

- Live schedules from **LeetCode**, **Codeforces**, **CodeChef** and **AtCoder**
- Month calendar plus a chronological "what's next" panel, per-platform filters,
  countdowns, registration links and one-click **Add to Google Calendar**

### Browser extension

- MV3 extension that saves the problem you are looking at straight into your
  workspace — as solved, starred, tagged, into a sheet, with a note. See
  [`extension/README.md`](extension/README.md)

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Backend | Node.js, Express, MongoDB (Mongoose) |
| Frontend | React, React Router, TypeScript, Vite |
| Auth | JWT (jsonwebtoken) + bcrypt, GitHub OAuth |
| Styling | Tailwind CSS, JetBrains Mono + Archivo fonts |
| Charts | Recharts |
| Icons | Lucide React |
| Avatars | DiceBear API |
| Scheduling | node-cron |
| Extension | Chrome/Firefox Manifest V3 |

## Project Structure

```
codeovertake/
├── backend/
│   ├── config/db.js              # MongoDB connection
│   ├── models/
│   │   ├── Student.js            # Leaderboard student (profiles, stats, scores, ranks)
│   │   ├── Snapshot.js           # Daily score snapshots
│   │   ├── User.js               # Account + portfolio (platforms, projects, C-Score)
│   │   ├── Problem.js            # Shared problem catalog (+ company tags)
│   │   ├── TrackedQuestion.js    # User <-> problem join + revision schedule
│   │   ├── Note.js               # Notes, linkable to many problems
│   │   ├── RevisionQueue.js      # Materialized daily queue
│   │   ├── RevisionLog.js        # Append-only revision history
│   │   ├── Sheet.js              # Sheets with topic/subtopic hierarchy
│   │   ├── SheetFollow.js        # Follow-to-track join
│   │   └── Contest.js            # Aggregated contest schedule
│   ├── platforms/                # Stats adapters (registry, two-tier)
│   │   ├── github.js  leetcode.js  codeforces.js  codechef.js
│   │   ├── atcoder.js            # Portfolio-only, full stats
│   │   ├── linkOnly.js           # GeeksforGeeks + HackerRank (no stats API)
│   │   └── verification.js       # Reads the per-platform verification field
│   ├── contests/                 # Contest-source registry (4 sources)
│   ├── problems/metadata.js      # Problem metadata fetchers per platform
│   ├── services/                 # All business logic
│   │   ├── studentService.js  leaderboardService.js  rankingService.js
│   │   ├── authService.js  portfolioService.js
│   │   ├── problemService.js  workspaceService.js  noteService.js
│   │   ├── revisionService.js  sheetService.js  companyService.js
│   │   └── contestService.js
│   ├── controllers/              # Thin route handlers
│   ├── routes/                   # Express routes + validators
│   ├── middlewares/              # Errors, validation, async wrapper, auth
│   ├── utils/
│   │   ├── problemUrl.js         # Problem URL parsing for 11 platforms
│   │   ├── spacedRepetition.js   # Scheduling + memory-decay maths (pure)
│   │   ├── csv.js  concurrency.js  jwt.js  httpError.js
│   ├── cron/updateData.js        # Parallel batch data fetcher
│   ├── scripts/
│   │   ├── seedContent.js        # Curated sheets + company kits
│   │   ├── data/                 # Sheet and company-kit definitions
│   │   └── runUpdate.js          # Manual data refresh trigger
│   ├── server.js                 # Express server entry
│   └── .env.example
├── extension/                    # Manifest V3 browser extension
│   ├── manifest.json  background.js  shared.js
│   ├── popup.html  popup.js  popup.css
│   └── options.html  options.js
└── frontend/
    └── src/
        ├── main.tsx              # App entry
        └── app/
            ├── api.ts            # API client (typed, token-aware)
            ├── AuthContext.tsx   # Session provider
            ├── routes.tsx        # React Router config
            └── components/
                ├── Layout.tsx        # Navbar + account menu + footer
                ├── Leaderboard.tsx   # Leaderboard with tabs, filters, infinite scroll
                ├── Register.tsx      # Two-step registration with validation
                ├── StudentProfile.tsx  About.tsx  HeadOn.tsx  Analytics.tsx
                ├── Auth.tsx          # Login / signup / GitHub callback
                ├── Workspace.tsx     # Question tracker
                ├── AddQuestionModal.tsx  QuestionDetail.tsx
                ├── Notes.tsx         # Linked notes
                ├── Revision.tsx      # Daily queue + retention
                ├── Sheets.tsx  SheetDetail.tsx
                ├── Companies.tsx     # Company kits + kit detail
                ├── Portfolio.tsx  EditProfile.tsx
                ├── Contests.tsx      # Calendar + list + filters
                ├── TrackerUI.tsx     # Shared badges, gates, helpers
                └── PlatformIcons.tsx # SVG platform icons
```

## Setup

### Prerequisites

- Node.js 18+
- MongoDB (local or Atlas/Cosmos)
- pnpm (frontend)

### Backend

```bash
cd backend
cp .env.example .env
# Edit .env with your MongoDB URI and GitHub token
npm install
npm run dev
```

Runs on `http://localhost:5000`.

### Frontend

```bash
cd frontend
pnpm install
pnpm dev
```

Runs on `http://localhost:5173`.

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `PORT` | Server port | No (default: 5000) |
| `MONGODB_URI` | MongoDB connection string | Yes |
| `GITHUB_TOKEN` | GitHub PAT (for contributions data + higher rate limits) | Recommended |
| `CRON_SCHEDULE` | Cron expression for data updates | No (default: 12 AM IST) |
| `FRONTEND_URL` | CORS allowed origin | No (default: http://localhost:5173) |
| `NSUT_API_URL` | External API for student lookup by roll number | No |
| `JWT_SECRET` | Signing secret for session tokens | **Yes** (for accounts) |
| `JWT_EXPIRES_IN` | Session lifetime | No (default: 30d) |
| `GITHUB_OAUTH_CLIENT_ID` | GitHub OAuth app client id | No (enables GitHub SSO) |
| `GITHUB_OAUTH_CLIENT_SECRET` | GitHub OAuth app client secret | No |
| `GITHUB_OAUTH_REDIRECT_URI` | OAuth callback, e.g. `http://localhost:5173/auth/github/callback` | No |
| `CONTEST_CRON_SCHEDULE` | Cron expression for contest sync | No (default: every 6h) |

Browser-extension origins (`chrome-extension://…`) are allowed through CORS
automatically, since the extension id differs per install.

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/students/search?q=` | Search students by name/roll number |
| GET | `/api/students/lookup/:rollno` | Lookup student details |
| POST | `/api/students/register` | Register a new student |
| GET | `/api/students/:rollno` | Get full student profile |
| PUT | `/api/students/:rollno/usernames` | Update platform usernames |
| POST | `/api/students/:rollno/restore` | Restore previous usernames |
| GET | `/api/students/:rollno/history` | Get score history snapshots |
| GET | `/api/students/validate-username/:platform/:username` | Validate platform username |
| GET | `/api/students/branches` | Get available branches |
| GET | `/api/leaderboard` | Combined leaderboard (paginated) |
| GET | `/api/leaderboard/:platform` | Platform-specific leaderboard |
| GET | `/api/leaderboard/filters` | Available filter options (years, branches) |
| GET | `/api/leaderboard/top-gainers` | Top score gainers between snapshots |
| GET | `/api/analytics/overview` | Aggregated analytics across students and snapshots |
| POST | `/api/admin/update` | Manually trigger data refresh |

### Accounts

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/signup` · `/api/auth/login` | Email + password accounts |
| GET | `/api/auth/me` · PUT `/api/auth/me` | Read / update the signed-in account |
| GET | `/api/auth/github/url` · POST `/api/auth/github/callback` | GitHub SSO |
| GET | `/api/auth/extension-token` | Pairing token for the browser extension |

### Tracker

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/problems/search` | Search the shared problem catalog (tops up from LeetCode) |
| POST | `/api/problems/resolve` | Resolve a problem URL, fetching metadata |
| GET/POST | `/api/workspace` | List / add tracked questions |
| PUT | `/api/workspace/:id` · `/api/workspace/:id/status` | Star, tag, mark solved |
| GET | `/api/workspace/stats` · `/api/workspace/tags` | Dashboard counters and tag facets |
| GET/POST | `/api/notes` | Linked and standalone notes |
| GET | `/api/notes/for-problem/:problemId` | Every note visible on a problem |
| GET | `/api/revision/queue` · `/api/revision/stats` | Daily queue, retention, forecast |
| POST | `/api/revision/:id/rate` | Record a revision and reschedule |

### Sheets, kits and portfolio

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/sheets?scope=explore\|mine\|followed` | Sheet library |
| GET | `/api/sheets/:idOrSlug` | Full sheet with your progress |
| POST | `/api/sheets/:idOrSlug/sections` · `/questions` · `/import` | Build a sheet |
| POST/DELETE | `/api/sheets/:idOrSlug/follow` | Follow to unlock tracking |
| POST/DELETE | `/api/sheets/:idOrSlug/collaborators` | Co-edit by email |
| GET | `/api/companies` · `/api/companies/:slug` | Company interview kits |
| GET | `/api/portfolio/u/:handle` | Public portfolio |
| POST | `/api/portfolio/sync` | On-demand stats refresh (15 min cooldown) |
| PUT | `/api/portfolio/platforms/:platform` | Connect a platform handle |
| POST | `/api/portfolio/platforms/:platform/verify` | Verify ownership by code |
| GET | `/api/portfolio/leaderboard` | C-Score leaderboard (verified only) |
| GET | `/api/contests` · `/upcoming` · `/calendar` | Contest tracker |

## Scoring System

Each platform contributes up to **1000 points** (max total: 4000). Exponential curves reward early effort; linear scaling for ratings.

| Platform | Component | Max | Type |
|----------|-----------|-----|------|
| **GitHub** | Contributions | 800 | Exponential |
| | Stars | 100 | Exponential |
| | Public Repos | 50 | Exponential |
| | Followers | 50 | Exponential |
| **LeetCode** | Weighted Solved (Easy×1 + Med×3 + Hard×6) | 700 | Exponential |
| | Contest Rating | 300 | Linear |
| **Codeforces** | Problems Solved | 500 | Exponential |
| | Current Rating | 400 | Linear |
| | Peak Rating | 100 | Linear |
| **CodeChef** | Problems Solved | 500 | Exponential |
| | Current Rating | 400 | Linear |
| | Highest Rating | 100 | Linear |

## Data Update Pipeline

The update system uses **per-platform parallel streams** with rate-limit-aware concurrency:

| Platform | Concurrency | Delay | Rate Limit |
|----------|-------------|-------|------------|
| GitHub | 15 workers | 0ms | 5000 req/hr (with token) |
| LeetCode | 5 workers | 200ms | ~20-30 req/min |
| Codeforces | 2 workers | 1000ms | ~1 req/2s |
| CodeChef | 3 workers | 500ms | Conservative (scraping) |

All platforms fetch simultaneously. Total time ≈ slowest platform, not the sum.

## Platform tiers

The platform registry is deliberately two-tiered (`backend/platforms/index.js`):

- **Leaderboard platforms** — GitHub, LeetCode, Codeforces, CodeChef. These are
  the only ones that count towards the NSUT score, so existing rankings stay
  comparable.
- **Portfolio platforms** — the four above plus **AtCoder** (full stats),
  **GeeksforGeeks** and **HackerRank**.

GeeksforGeeks and HackerRank are registered as *link-only*: both render user
profiles entirely client-side and expose no usable public stats API, so the
handle is stored and shown as a link but nothing is auto-fetched. Shipping
scrapers that silently return zeros would drag real scores down, so they are
explicitly opted out via `statsSupported: false`. GeeksforGeeks **problems** are
still fully trackable — its practice API returns title, difficulty and company
tags.

## Scoring

Alongside the 4000-point leaderboard score, each account has a **C-Score**
(0–1000) covering the three pillars Codolio-style portfolios care about:

| Pillar | Platforms | Weight |
|--------|-----------|--------|
| DSA | LeetCode, GeeksforGeeks, HackerRank, InterviewBit, Code360 | 45% |
| CP | Codeforces, CodeChef, AtCoder | 30% |
| Dev | GitHub | 25% |

Each pillar takes your **best** platform (so linking three CP sites does not
triple-count the same skill), and the weighted blend is multiplied by a balance
factor worth up to **+15%** — which is what makes the score reward breadth.

## Scripts

```bash
# Seed the curated sheets and company kits (idempotent, safe to re-run)
npm run seed:content --prefix backend
npm run seed:sheets --prefix backend      # sheets only
npm run seed:companies --prefix backend   # company kits only
npm run seed:catalog --prefix backend     # bulk-import the LeetCode + Codeforces catalogs

# Manually run data update + ranking calculation
node backend/scripts/runUpdate.js
```

## Built By

**Sujal Chaudhary** — NSUT, CSAI, Batch of 2028
- [Portfolio](https://sujal.info)
- [LinkedIn](https://sujal.info/linkedin)
- [GitHub](https://sujal.info/github)
