import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, Clock, Loader2, Play, RefreshCw, XCircle } from "lucide-react";
import { fetchAdminJobs, runAdminJob, type AdminJob } from "../../api";
import { ErrorBanner, Spinner, formatRelativeTime } from "../TrackerUI";
import { AdminButton, AdminPanel, ConfirmButton, DangerNotice, Pill } from "./AdminUI";

/**
 * Jobs whose cost is high enough that a stray click is a real problem: a full
 * student refresh hits four platform APIs once per student, so it is rate-limit
 * relevant and takes minutes. Those get a two-step confirm button; the cheap
 * ones fire on a single click.
 */
const EXPENSIVE_JOBS: Record<string, string> = {
  "student-update": "Hits every platform API once per student and takes minutes. "
    + "The nightly cron already does this — only run it manually if you need fresh data now.",
  analytics: "Discards today's analytics cache and rebuilds it from every student record.",
};

const STATUS_TONE = {
  idle: "neutral",
  running: "info",
  succeeded: "good",
  failed: "bad",
} as const;

function StatusIcon({ status }: { status: AdminJob["status"] }) {
  if (status === "running") return <Loader2 className="h-3.5 w-3.5 animate-spin text-[#60a5fa]" />;
  if (status === "succeeded") return <CheckCircle2 className="h-3.5 w-3.5 text-[#4ade80]" />;
  if (status === "failed") return <XCircle className="h-3.5 w-3.5 text-[#ff6666]" />;
  return <Clock className="h-3.5 w-3.5 text-[#555555]" />;
}

/** Wall-clock duration of a finished run, or elapsed time of a running one. */
function duration(job: AdminJob) {
  if (!job.startedAt) return null;
  const start = new Date(job.startedAt).getTime();
  const end = job.finishedAt ? new Date(job.finishedAt).getTime() : Date.now();
  const seconds = Math.max(0, Math.round((end - start) / 1000));
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

function JobCard({
  job, onRun, disabled,
}: { job: AdminJob; onRun: () => Promise<void>; disabled: boolean }) {
  const warning = EXPENSIVE_JOBS[job.name];
  const running = job.status === "running";

  return (
    <div
      className={`rounded border bg-[#111111] p-4 transition-colors ${
        running ? "border-[#60a5fa]/40" : "border-[#1e1e1e]"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-[200px] flex-1">
          <div className="flex items-center gap-2">
            <StatusIcon status={job.status} />
            <h3 className="font-['JetBrains_Mono'] text-sm text-white">{job.label}</h3>
            <Pill tone={STATUS_TONE[job.status]}>{job.status}</Pill>
          </div>
          <p className="mt-1.5 font-['Archivo'] text-xs leading-relaxed text-[#888888]">
            {job.description}
          </p>
          <div className="mt-1 font-['JetBrains_Mono'] text-[10px] text-[#555555]">{job.name}</div>
        </div>

        <div className="shrink-0">
          {warning ? (
            <ConfirmButton
              danger={false}
              confirmLabel="Run it?"
              disabled={disabled || running}
              title={warning}
              onConfirm={onRun}
            >
              <Play className="h-3 w-3" /> Run
            </ConfirmButton>
          ) : (
            <AdminButton onClick={onRun} disabled={disabled || running}>
              <Play className="h-3 w-3" /> Run
            </AdminButton>
          )}
        </div>
      </div>

      {warning && (
        <p className="mt-2 font-['Archivo'] text-[11px] leading-relaxed text-[#997744]">
          {warning}
        </p>
      )}

      {job.startedAt && (
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-[#1a1a1a] pt-2 font-['JetBrains_Mono'] text-[10px] text-[#666666]">
          <span>started {formatRelativeTime(job.startedAt)}</span>
          {job.finishedAt && <span>finished {formatRelativeTime(job.finishedAt)}</span>}
          <span>took {duration(job)}</span>
        </div>
      )}

      {job.error && (
        <pre className="mt-2 overflow-x-auto rounded border border-[#ff4444]/30 bg-[#ff4444]/5 px-2.5 py-2 font-['JetBrains_Mono'] text-[10px] leading-relaxed text-[#ff8888]">
          {job.error}
        </pre>
      )}

      {job.result && Object.keys(job.result).length > 0 && (
        <pre className="mt-2 overflow-x-auto rounded border border-[#1e1e1e] bg-[#0a0a0a] px-2.5 py-2 font-['JetBrains_Mono'] text-[10px] leading-relaxed text-[#aaaaaa]">
          {JSON.stringify(job.result, null, 2)}
        </pre>
      )}
    </div>
  );
}

export function AdminJobs() {
  const [jobs, setJobs] = useState<AdminJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  // Kept in a ref so the polling effect does not restart on every tick
  const anyRunning = jobs.some((job) => job.status === "running");
  const anyRunningRef = useRef(anyRunning);
  anyRunningRef.current = anyRunning;

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const res = await fetchAdminJobs();
      setJobs(res.jobs);
      if (!quiet) setError("");
    } catch (err: any) {
      setError(err.message || "Could not load the job list");
    } finally {
      if (!quiet) setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  /**
   * Poll only while something is running. Job state is per-process and in-memory,
   * so there is nothing to watch when everything is idle and polling forever would
   * just be background noise.
   */
  useEffect(() => {
    if (!anyRunning) return undefined;
    const timer = setInterval(() => { load(true); }, 3000);
    return () => clearInterval(timer);
  }, [anyRunning, load]);

  async function run(job: AdminJob) {
    setError("");
    setNotice("");
    try {
      const res = await runAdminJob(job.name);
      setNotice(`${res.label} started. This page will follow its progress.`);
      await load(true);
    } catch (err: any) {
      setError(err.message || `Could not start ${job.label}`);
    }
  }

  if (loading && jobs.length === 0) return <Spinner label="Loading jobs..." />;

  return (
    <AdminPanel
      title="Background jobs"
      description="Trigger the same work the cron scheduler does, on demand."
      actions={(
        <AdminButton onClick={() => load()} busy={loading}>
          <RefreshCw className="h-3 w-3" /> Refresh
        </AdminButton>
      )}
    >
      {error && <ErrorBanner message={error} />}

      {notice && (
        <div className="mb-4 rounded border border-[#4ade80]/30 bg-[#4ade80]/5 px-3 py-2 font-['Archivo'] text-xs text-[#4ade80]">
          {notice}
        </div>
      )}

      <DangerNotice>
        Job state lives in the API process memory, not the database: it is progress
        reporting, not a queue. A restart or a deploy clears this list, and in a
        multi-instance setup you only see the instance you happen to be talking to.
        Every start is written to the audit log regardless.
      </DangerNotice>

      <div className="grid gap-3">
        {jobs.map((job) => (
          <JobCard key={job.name} job={job} onRun={() => run(job)} disabled={loading} />
        ))}
      </div>
    </AdminPanel>
  );
}
