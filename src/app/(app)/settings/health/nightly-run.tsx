import { Badge } from "@/components/ui/badge";
import { formatDateIST } from "@/lib/format/date";

export interface NightlyJobRow {
  key?: string;
  label?: string;
  status?: string;
  durationMs?: number;
  reason?: string;
  error?: string;
}

export interface NightlyRun {
  startedAt: string;
  durationMs: number;
  ok: boolean;
  okCount: number;
  failedCount: number;
  skippedCount: number;
  jobs: NightlyJobRow[];
}

/**
 * What the nightly job did, the last time it ran.
 *
 * The screen this sits on already listed every failure. What it could not
 * say was whether the nightly run had happened at all — which is the first
 * question when a number is missing, and the one the CRM had no answer to.
 *
 * The empty state is the important half. No recorded run does not mean
 * "nothing went wrong"; it means no invocation ever reached the handler,
 * and on this hosting that has exactly one common cause.
 */
export function NightlyRunPanel({ run }: { run: NightlyRun | null }) {
  if (!run) {
    return (
      <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-4">
        <p className="text-[0.9375rem]">
          <strong>No nightly run has ever been recorded.</strong> Everything that happens
          overnight — the response-time sweep, fee reminders, ad spend, retargeting — happens in
          one scheduled run, and nothing has reached it.
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          The usual cause is <code className="font-mono">CRON_SECRET</code> not being set on the
          deployment. The schedule then calls the CRM without the password it expects, the CRM
          answers &quot;not allowed&quot;, and nothing runs — with no failure recorded anywhere,
          because being turned away is not an error. Check{" "}
          <strong>Vercel → Project → Cron Jobs</strong>: a run listed with status 401 is this.
        </p>
      </div>
    );
  }

  const stale = Date.now() - new Date(run.startedAt).getTime() > 36 * 60 * 60 * 1000;

  return (
    <div
      className={
        run.ok && !stale
          ? "flex flex-col gap-3 rounded-lg border p-4"
          : "flex flex-col gap-3 rounded-lg border border-warning/40 bg-warning-subtle p-4"
      }
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-[0.9375rem]">
          <strong>Last run:</strong> {formatDateIST(run.startedAt, "d MMM yyyy, h:mm a")}, took{" "}
          {Math.round(run.durationMs / 1000)}s.
        </p>
        <span className="text-sm text-muted-foreground">
          {run.okCount} ran · {run.failedCount} failed · {run.skippedCount} skipped
        </span>
      </div>

      {stale && (
        <p className="text-sm">
          <strong>That is more than a day ago.</strong> It runs at 10:00 IST, so a gap this long
          means the schedule is not firing — check <strong>Vercel → Project → Cron Jobs</strong>.
        </p>
      )}

      <ul className="flex flex-col gap-1.5">
        {run.jobs.map((job, index) => (
          <li key={job.key ?? index} className="flex flex-wrap items-baseline gap-2 text-sm">
            <Badge
              variant={
                job.status === "failed"
                  ? "destructive"
                  : job.status === "skipped"
                    ? "secondary"
                    : "outline"
              }
            >
              {job.status ?? "unknown"}
            </Badge>
            <span className="font-medium">{job.label ?? job.key}</span>
            {/*
              The reason is the whole point for a job that "ran" and did
              nothing. "Meta ad spend — ok" and "Meta ad spend — ok,
              nothing to do: not-configured" are the difference between
              looking at the code and pasting in a token.
            */}
            {(job.reason || job.error) && (
              <span className="text-muted-foreground">— {job.error ?? job.reason}</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
