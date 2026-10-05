import { Badge } from "@/components/ui/badge";
import type { CronTier } from "@/lib/cron/record-run";
import { formatDateIST } from "@/lib/format/date";

/**
 * One job's outcome, as the `cron_runs.jobs` JSON records it.
 *
 * Every field optional: these rows were written by whichever version of
 * the code ran at the time, and a panel that throws on an older shape
 * would hide the very history it exists to show.
 */
export interface CronJobRow {
  key?: string;
  label?: string;
  status?: string;
  durationMs?: number;
  reason?: string;
  error?: string;
}

export interface CronRun {
  startedAt: string;
  durationMs: number;
  ok: boolean;
  okCount: number;
  failedCount: number;
  skippedCount: number;
  jobs: CronJobRow[];
}

/**
 * One schedule's last run, for any of the three tiers.
 *
 * Parameterised rather than three components, because after the second
 * one the only real difference was the words — and the words are the
 * whole value of this panel, so they live in one table where they can be
 * read side by side.
 *
 * ## The empty states say opposite things
 *
 * No daily run is a **fault**: that schedule ships in `vercel.json` and
 * something is wrong if it has never fired. No frequent or hourly run is
 * **expected** until somebody sets up the scheduler that calls them, so
 * those explain the consequence and point at the guide instead of raising
 * an alarm. Getting this backwards would mean either crying wolf on a
 * fresh install or staying quiet about a dead nightly run.
 *
 * ## Staleness
 *
 * Generous on purpose, and different per tier. A free scheduler skipping
 * a slot under load is ordinary; GitHub's in particular queues scheduled
 * runs at low priority, so a ten-minute schedule genuinely does go
 * twenty-five minutes between runs sometimes. A panel that cries wolf
 * every afternoon is ignored by the time it matters.
 */
interface TierCopy {
  title: string;
  what: string;
  /** Minutes after which the last run is old enough to be worth saying so. */
  staleAfterMinutes: number;
  /** Null when having never run is not a fault. */
  missingIsFault: boolean;
  missing: React.ReactNode;
  stale: React.ReactNode;
}

const COPY: Record<CronTier, TierCopy> = {
  frequent: {
    title: "Every ten minutes",
    what: "WhatsApp automations, scheduled broadcasts, and the response-time sweep.",
    staleAfterMinutes: 45,
    missingIsFault: false,
    missing: (
      <>
        Automations and broadcasts are going out on the daily run only — a broadcast sent at 2pm
        leaves at 10:00 the next morning, and a new-enquiry automation can be a day late. Nothing
        is broken: this schedule is not part of the deployment and needs something outside to call
        it. See <strong>docs/CRON-SETUP.md</strong>. The button below sends whatever is waiting,
        now.
      </>
    ),
    stale: (
      <>
        If this is meant to run every ten minutes, the scheduler has stopped calling. Check it is
        still enabled, and that <code className="font-mono">CRON_SECRET</code> still matches what
        it sends — a mismatch is refused with a 401, which looks like silence from here.
      </>
    ),
  },
  hourly: {
    title: "Hourly",
    what: "Ad spend from Meta and Google, and both retargeting audiences.",
    staleAfterMinutes: 150,
    missingIsFault: false,
    missing: (
      <>
        Ad spend and the retargeting audiences are updating once a day, so the marketing figures
        are this morning&apos;s by the afternoon and a lead who enquired today is not in an
        audience until tomorrow. Not broken — the same outside scheduler runs this one. See{" "}
        <strong>docs/CRON-SETUP.md</strong>.
      </>
    ),
    stale: (
      <>
        Longer ago than an hourly schedule should be. The figures on the marketing screens are as
        old as this timestamp.
      </>
    ),
  },
  daily: {
    title: "Daily, 10:00 IST",
    what: "Fee reminders, temperature recalculation, Google offline conversions — and everything the other two do, as a safety net.",
    staleAfterMinutes: 36 * 60,
    missingIsFault: true,
    missing: (
      <>
        <strong>This one ships with the application, so it should never be empty.</strong> The
        usual cause is <code className="font-mono">CRON_SECRET</code> not being set on the
        deployment: the schedule then calls without the password it expects, the CRM answers
        &quot;not allowed&quot;, and nothing runs — with no failure recorded anywhere, because
        being turned away is not an error. Check <strong>Vercel → Project → Cron Jobs</strong>: a
        run listed with status 401 is this.
      </>
    ),
    stale: (
      <>
        <strong>That is more than a day ago.</strong> It runs at 10:00 IST, so a gap this long
        means the schedule is not firing — check <strong>Vercel → Project → Cron Jobs</strong>.
      </>
    ),
  },
};

export function CronTierPanel({ tier, run }: { tier: CronTier; run: CronRun | null }) {
  const copy = COPY[tier];

  if (!run) {
    return (
      <div
        className={
          copy.missingIsFault
            ? "rounded-lg border border-destructive/50 bg-destructive/5 p-4"
            : "rounded-lg border border-warning/40 bg-warning-subtle p-4"
        }
      >
        <p className="text-[0.9375rem]">
          <strong>No run recorded.</strong> {copy.what}
        </p>
        <p className="mt-2 text-sm text-muted-foreground">{copy.missing}</p>
      </div>
    );
  }

  const minutesAgo = Math.round((Date.now() - new Date(run.startedAt).getTime()) / 60000);
  const stale = minutesAgo > copy.staleAfterMinutes;

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
          {minutesAgo < 24 * 60 && ` — ${describeAgo(minutesAgo)}`}, took{" "}
          {Math.round(run.durationMs / 1000)}s.
        </p>
        <span className="text-sm text-muted-foreground">
          {run.okCount} ran · {run.failedCount} failed
          {run.skippedCount > 0 && ` · ${run.skippedCount} skipped`}
        </span>
      </div>

      {stale && <p className="text-sm">{copy.stale}</p>}

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

function describeAgo(minutes: number): string {
  if (minutes < 1) return "just now";
  if (minutes < 90) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.round(minutes / 60);
  return `${hours} hour${hours === 1 ? "" : "s"} ago`;
}
