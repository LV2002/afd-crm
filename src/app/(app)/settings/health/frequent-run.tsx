import { Badge } from "@/components/ui/badge";
import { formatDateIST } from "@/lib/format/date";

import type { NightlyRun } from "./nightly-run";

/**
 * Whether the frequent schedule is actually calling us, and when it last did.
 *
 * Split from `NightlyRunPanel` rather than parameterised, because the two
 * empty states say opposite things. No nightly run is a fault: that
 * schedule ships in `vercel.json` and something is wrong if it has never
 * fired. No frequent run is **normal** — it needs an outside scheduler
 * that an institute may simply not have set up — so this one explains the
 * consequence and how to get one, instead of raising an alarm.
 *
 * The staleness threshold is deliberately generous. A ten-minute schedule
 * that has not run for half an hour is broken, but a free scheduler
 * skipping a slot under load is ordinary, and a panel that cries wolf
 * every afternoon gets ignored by the time it matters.
 */
export function FrequentRunPanel({ run }: { run: NightlyRun | null }) {
  if (!run) {
    return (
      <div className="rounded-lg border border-warning/40 bg-warning-subtle p-4">
        <p className="text-[0.9375rem]">
          <strong>No frequent run has been recorded.</strong> Automations and broadcasts are
          therefore going out on the nightly run only — a broadcast sent at 2pm leaves at 10:00
          the next morning, and the first message of a new-enquiry automation can be a day late.
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          Nothing is broken; this schedule is not part of the deployment. It needs something
          outside to call <code className="font-mono">/api/cron/frequent</code> every ten minutes
          with the same secret. See <strong>docs/CRON-SETUP.md</strong> — it takes about five
          minutes and costs nothing. Meanwhile the button below sends whatever is waiting, now.
        </p>
      </div>
    );
  }

  const minutesAgo = Math.round((Date.now() - new Date(run.startedAt).getTime()) / 60000);
  const stale = minutesAgo > 45;

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
          <strong>Last run:</strong> {formatDateIST(run.startedAt, "d MMM yyyy, h:mm a")}
          {minutesAgo < 90 && ` — ${minutesAgo} minute${minutesAgo === 1 ? "" : "s"} ago`}, took{" "}
          {Math.round(run.durationMs / 1000)}s.
        </p>
        <span className="text-sm text-muted-foreground">
          {run.okCount} ran · {run.failedCount} failed
        </span>
      </div>

      {stale && (
        <p className="text-sm">
          <strong>That is longer ago than a frequent schedule should be.</strong> If it is meant
          to run every ten minutes, the scheduler has stopped calling — check it is still enabled,
          and that <code className="font-mono">CRON_SECRET</code> still matches what it sends.
        </p>
      )}

      <ul className="flex flex-col gap-1.5">
        {run.jobs.map((job, index) => (
          <li key={job.key ?? index} className="flex flex-wrap items-baseline gap-2 text-sm">
            <Badge variant={job.status === "failed" ? "destructive" : "outline"}>
              {job.status ?? "unknown"}
            </Badge>
            <span className="font-medium">{job.label ?? job.key}</span>
            {(job.reason || job.error) && (
              <span className="text-muted-foreground">— {job.error ?? job.reason}</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
