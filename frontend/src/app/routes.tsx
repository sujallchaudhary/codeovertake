import { createBrowserRouter } from "react-router";
import { Layout } from "./components/Layout";
import { Leaderboard } from "./components/Leaderboard";
import { DailyLeaderboard } from "./components/DailyLeaderboard";
import { Register } from "./components/Register";
import { StudentProfile } from "./components/StudentProfile";
import { About } from "./components/About";
import { HeadOn } from "./components/HeadOn";
import { Analytics } from "./components/Analytics";

// Tracker / portfolio / contest-manager features
import { GithubCallback, Login, Signup } from "./components/Auth";
import { Contests } from "./components/Contests";
import { Workspace } from "./components/Workspace";
import { Notes } from "./components/Notes";
import { Revision } from "./components/Revision";
import { Sheets } from "./components/Sheets";
import { SheetDetail } from "./components/SheetDetail";
import { Companies, CompanyKit } from "./components/Companies";
import { Portfolio } from "./components/Portfolio";
import { EditProfile } from "./components/EditProfile";

export const router = createBrowserRouter([
  {
    path: "/",
    Component: Layout,
    children: [
      { index: true, Component: Leaderboard },
      { path: "daily-gainers", Component: DailyLeaderboard },
      { path: "register", Component: Register },
      { path: "student/:rollNo", Component: StudentProfile },
      { path: "headon", Component: HeadOn },
      { path: "analytics", Component: Analytics },
      { path: "about", Component: About },

      // Accounts
      { path: "login", Component: Login },
      { path: "signup", Component: Signup },
      { path: "auth/github/callback", Component: GithubCallback },

      // Question tracker
      { path: "workspace", Component: Workspace },
      { path: "notes", Component: Notes },
      { path: "revision", Component: Revision },

      // Sheets
      { path: "sheets", Component: Sheets },
      { path: "sheets/:slug", Component: SheetDetail },

      // Company interview kits
      { path: "companies", Component: Companies },
      { path: "companies/:slug", Component: CompanyKit },

      // Contest tracker
      { path: "contests", Component: Contests },

      // Portfolio: /portfolio is your own, /u/:handle is anyone's
      { path: "portfolio", Component: Portfolio },
      { path: "u/:handle", Component: Portfolio },
      { path: "settings", Component: EditProfile },
    ],
  },
]);
