import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router";
import {
  Activity, BadgeCheck, Database, FileText, LayoutDashboard, ScrollText, ShieldOff, Users,
} from "lucide-react";
import { fetchAdminWhoami } from "../../api";
import { useAuth } from "../../AuthContext";
import { EmptyState, PageHeader, RequireAuth, Spinner } from "../TrackerUI";
import { AdminOverview } from "./AdminOverview";
import { AdminStudents } from "./AdminStudents";
import { AdminUsers } from "./AdminUsers";
import { AdminClaims } from "./AdminClaims";
import { AdminContent } from "./AdminContent";
import { AdminJobs } from "./AdminJobs";
import { AdminAudit } from "./AdminAudit";

type Tab = "overview" | "students" | "users" | "claims" | "content" | "jobs" | "audit";

const TABS: Array<{ key: Tab; label: string; icon: typeof Users }> = [
  { key: "overview", label: "Overview", icon: LayoutDashboard },
  { key: "students", label: "Students", icon: Database },
  { key: "users", label: "Accounts", icon: Users },
  { key: "claims", label: "Claims", icon: BadgeCheck },
  { key: "content", label: "Content", icon: FileText },
  { key: "jobs", label: "Jobs", icon: Activity },
  { key: "audit", label: "Audit", icon: ScrollText },
];

function NotAuthorised() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <EmptyState
        icon={<ShieldOff className="h-8 w-8" strokeWidth={1.5} />}
        title="Not authorised"
        description={
          "This area is for maintainers. If you should have access, ask an existing admin to "
          + "promote your account, or add your verified email to ADMIN_EMAILS on the server "
          + "and sign in again."
        }
        action={(
          <Link
            to="/"
            className="rounded border border-[#1e1e1e] px-4 py-2 font-['JetBrains_Mono'] text-sm text-white transition-colors hover:border-[#4ade80]"
          >
            Back to the leaderboard
          </Link>
        )}
      />
    </div>
  );
}

function AdminInner() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const tab = (params.get("tab") as Tab) || "overview";

  /**
   * `user.isAdmin` comes from the cached /auth/me payload, which is good enough to
   * paint the shell immediately. But the real authority is the server, and a role
   * can have been revoked since that payload was fetched — so confirm with
   * /admin/whoami before rendering anything that would otherwise 403 in six
   * places at once.
   */
  const [confirmed, setConfirmed] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchAdminWhoami()
      .then((res) => { if (!cancelled) setConfirmed(res.isAdmin); })
      .catch(() => { if (!cancelled) setConfirmed(false); });
    return () => { cancelled = true; };
  }, [user?._id]);

  if (confirmed === null) {
    // Paint the shell straight away for someone the cached payload says is an
    // admin; make everyone else wait rather than flashing a panel they cannot use.
    if (!user?.isAdmin) return <Spinner label="Checking your permissions..." />;
  } else if (!confirmed) {
    return <NotAuthorised />;
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <PageHeader
        title="Admin"
        subtitle="Students, accounts, claims, content and background jobs. Everything here is logged."
      />

      <div className="mb-5 flex flex-wrap gap-1 rounded bg-[#111111] p-1">
        {TABS.map((entry) => {
          const Icon = entry.icon;
          return (
            <button
              key={entry.key}
              onClick={() => {
                const next = new URLSearchParams(params);
                if (entry.key === "overview") next.delete("tab");
                else next.set("tab", entry.key);
                setParams(next, { replace: true });
              }}
              className={`flex items-center gap-1.5 rounded px-3 py-1.5 font-['JetBrains_Mono'] text-xs transition-colors ${
                tab === entry.key ? "bg-[#1e1e1e] text-white" : "text-[#888888] hover:text-white"
              }`}
            >
              <Icon className="h-3 w-3" />
              {entry.label}
            </button>
          );
        })}
      </div>

      {tab === "overview" && <AdminOverview />}
      {tab === "students" && <AdminStudents />}
      {tab === "users" && <AdminUsers />}
      {tab === "claims" && <AdminClaims />}
      {tab === "content" && <AdminContent />}
      {tab === "jobs" && <AdminJobs />}
      {tab === "audit" && <AdminAudit />}
    </div>
  );
}

export function Admin() {
  return (
    <RequireAuth feature="the admin panel">
      <AdminInner />
    </RequireAuth>
  );
}
