import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router";
import { RefreshCw } from "lucide-react";
import { fetchAdminOverview, type AdminOverview as Overview } from "../../api";
import { ErrorBanner, ProgressBar, Spinner, formatRelativeTime } from "../TrackerUI";
import {
  AdminButton, AdminPanel, AdminStat, DataTable, Pill,
} from "./AdminUI";

export function AdminOverview() {
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setData(await fetchAdminOverview());
    } catch (err: any) {
      setError(err.message || "Could not load the overview");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading && !data) return <Spinner label="Loading overview..." />;
  if (!data) return <ErrorBanner message={error || "No data"} />;

  const { students, users, content, jobs } = data;

  return (
    <AdminPanel
      title="Overview"
      description="System state at a glance."
      actions={<AdminButton onClick={load} busy={loading}><RefreshCw className="h-3 w-3" /> Refresh</AdminButton>}
    >
      {error && <ErrorBanner message={error} />}

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <AdminStat label="Students" value={students.total} hint={`${students.claimed} claimed`} />
        <AdminStat
          label="Accounts"
          value={users.total}
          hint={`${users.admins} admin, ${users.suspended} suspended`}
        />
        <AdminStat label="Problems" value={content.problems} hint={`${content.trackedQuestions} tracked`} />
        <AdminStat
          label="Contests"
          value={content.contests}
          hint={`${content.upcomingContests} upcoming`}
          tone="#60a5fa"
        />
      </div>

      {/*
        Claim adoption is the number that matters operationally: an unclaimed
        record is still editable by anyone who knows the roll number.
      */}
      <div className="mb-4 rounded border border-[#1e1e1e] bg-[#111111] p-4">
        <div className="mb-2 flex items-center justify-between">
          <div>
            <div className="font-['JetBrains_Mono'] text-xs uppercase tracking-widest text-[#666666]">
              Profile claim adoption
            </div>
            <p className="mt-1 font-['Archivo'] text-xs text-[#888888]">
              Unclaimed records are still editable by anyone who knows the roll number.
              Each claim closes one.
            </p>
          </div>
          <div className="text-right">
            <div className="font-['JetBrains_Mono'] text-2xl text-[#4ade80]">
              {students.claimedPercent}%
            </div>
            <div className="font-['JetBrains_Mono'] text-[11px] text-[#666666]">
              {students.claimed} / {students.total}
            </div>
          </div>
        </div>
        <ProgressBar value={students.claimed} max={students.total || 1} className="h-2" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Jobs */}
        <div className="rounded border border-[#1e1e1e] bg-[#111111] p-4">
          <div className="mb-3 font-['JetBrains_Mono'] text-xs uppercase tracking-widest text-[#666666]">
            Scheduled work
          </div>
          <div className="flex flex-col gap-2 font-['Archivo'] text-xs">
            <div className="flex items-center justify-between">
              <span className="text-[#888888]">Last student refresh</span>
              <span className="text-white">{formatRelativeTime(jobs.lastCronRun)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[#888888]">Last contest sync</span>
              <span className="text-white">{formatRelativeTime(jobs.lastContestSync)}</span>
            </div>
          </div>

          {jobs.running.some((job) => job.status === "running") && (
            <div className="mt-3 border-t border-[#1e1e1e] pt-2">
              {jobs.running
                .filter((job) => job.status === "running")
                .map((job) => (
                  <div key={job.name} className="flex items-center justify-between py-0.5">
                    <span className="font-['Archivo'] text-xs text-[#aaaaaa]">{job.label}</span>
                    <Pill tone="info">running</Pill>
                  </div>
                ))}
            </div>
          )}
        </div>

        {/* Content */}
        <div className="rounded border border-[#1e1e1e] bg-[#111111] p-4">
          <div className="mb-3 font-['JetBrains_Mono'] text-xs uppercase tracking-widest text-[#666666]">
            Content
          </div>
          <div className="grid grid-cols-2 gap-y-2 font-['Archivo'] text-xs">
            <span className="text-[#888888]">Sheets</span>
            <span className="text-right text-white">
              {content.sheets} <span className="text-[#666666]">({content.curatedSheets} curated)</span>
            </span>
            <span className="text-[#888888]">Notes</span>
            <span className="text-right text-white">{content.notes}</span>
            <span className="text-[#888888]">Tracked questions</span>
            <span className="text-right text-white">{content.trackedQuestions}</span>
          </div>
        </div>
      </div>

      {/* Leaderboard top 5 */}
      <div className="mt-4">
        <div className="mb-2 font-['JetBrains_Mono'] text-xs uppercase tracking-widest text-[#666666]">
          Top students
        </div>
        <DataTable
          rowKey={(row) => row.rollno}
          rows={data.topStudents}
          empty="No students yet"
          columns={[
            { header: "#", width: "48px", cell: (row) => <span className="text-[#666666]">{row.ranks?.overall || "—"}</span> },
            {
              header: "Student",
              cell: (row) => (
                <Link to={`/student/${row.rollno}`} className="text-white transition-colors hover:text-[#4ade80]">
                  {row.name}
                  <span className="ml-1.5 font-['JetBrains_Mono'] text-[10px] text-[#666666]">{row.rollno}</span>
                </Link>
              ),
            },
            { header: "Branch", cell: (row) => <span className="text-[#888888]">{row.branch} · Y{row.year}</span> },
            {
              header: "Score",
              align: "right",
              cell: (row) => <span className="font-['JetBrains_Mono'] text-[#4ade80]">{row.scores?.total ?? 0}</span>,
            },
          ]}
        />
      </div>

      {/* Recent audit */}
      <div className="mt-4">
        <div className="mb-2 font-['JetBrains_Mono'] text-xs uppercase tracking-widest text-[#666666]">
          Recent admin activity
        </div>
        <DataTable
          rowKey={(row) => row._id}
          rows={data.recentAudit}
          empty="No admin actions recorded yet"
          columns={[
            { header: "Action", cell: (row) => <span className="font-['JetBrains_Mono'] text-[11px]">{row.action}</span> },
            { header: "Target", cell: (row) => <span className="text-[#aaaaaa]">{row.targetLabel || row.targetId || "—"}</span> },
            { header: "By", cell: (row) => <span className="text-[#888888]">{row.actor?.handle || row.actorLabel}</span> },
            {
              header: "When",
              align: "right",
              cell: (row) => <span className="text-[#666666]">{formatRelativeTime(row.createdAt)}</span>,
            },
          ]}
        />
      </div>
    </AdminPanel>
  );
}
