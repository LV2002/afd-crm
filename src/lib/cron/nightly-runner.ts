import "server-only";

/**
 * One nightly run, every job in order.
 *
 * ## Why an orchestrator at all
 *
 * Ten cron routes existed and `vercel.json` scheduled eight of them, each on
 * a different day of the week — a workaround for Vercel's Hobby plan, which
 * allows very few scheduled jobs. Two consequences nobody wanted:
 *
 *   - **Retargeting was weekly.** Meta's audience refreshed on Wednesdays and
 *     Google's on Fridays, so a lead who arrived on Thursday waited six days
 *     to see an ad. The sync itself was always correct; only its schedule was
 *     wrong.
 *   - **`google-conversions` and `whatsapp-flows` were never scheduled at
 *     all.** They were built, they worked when called by hand, and nothing
 *     ever called them.
 *
 * One entry in `vercel.json` that runs everything solves both, and it is
 * still literally one scheduled job a day — which is the constraint that
 * produced the day-of-the-week spread in the first place.
 *
 * ## Sequential, not parallel
 *
 * `lib/db/client.ts` runs a pool of one connection. Firing ten jobs at once
 * would queue them on that single connection anyway, while multiplying the
 * external API calls in flight and inviting rate limits from Meta and Google
 * together. Sequential is both simpler and, here, no slower.
 *
 * ## Isolation, and why the route still fails
 *
 * A job that throws is recorded and the run continues: Google being down
 * must not stop the SLA sweep from flagging a lead nobody has answered. But
 * the *route* reports failure afterwards, because a run where three jobs
 * broke is not a healthy run, and the platform's own retry and the alert
 * email both depend on it saying so.
 */

export interface NightlyJob {
  /** Stable key, used in the response and in any alert. */
  key: string;
  /** What it is, in words a person reading an alert email would recognise. */
  label: string;
  /** Resolves to a note worth showing — "nothing to do: not-configured" — or null. */
  run: () => Promise<string | null | void>;
  /**
   * Roughly how long this job takes at AFD's volume, in milliseconds. Used
   * only to decide whether there is time to start it — never to cut it off
   * part-way, which would leave an external platform half-updated.
   */
  estimateMs: number;
}

export type JobStatus = "ok" | "failed" | "skipped";

export interface JobResult {
  key: string;
  label: string;
  status: JobStatus;
  durationMs: number;
  /** Present on a failure. The message only — a stack in a JSON response helps nobody. */
  error?: string;
  /** Why it was skipped, when it was. */
  reason?: string;
}

export interface NightlyResult {
  startedAt: string;
  durationMs: number;
  ok: boolean;
  jobs: JobResult[];
  summary: { ok: number; failed: number; skipped: number };
}

export interface RunNightlyOptions {
  jobs: readonly NightlyJob[];
  /**
   * Total time the run may take. Vercel kills the function at
   * `maxDuration` regardless, and being killed means no report at all — so
   * the budget is deliberately below it, and a job that would not fit is
   * skipped rather than started.
   */
  budgetMs: number;
  /** Injected so the tests do not depend on a clock. */
  now?: () => number;
}

/**
 * Runs each job in order until the budget is spent.
 *
 * A skipped job is not a lost job. Every one of these is incremental — the
 * retargeting sync diffs against what it last sent, the spend sync upserts
 * by date, the sweeps look at current state — so tomorrow's run covers
 * whatever today's could not reach. That is why the order matters more than
 * the budget: the jobs whose value decays within a day come first.
 */
export async function runNightly(options: RunNightlyOptions): Promise<NightlyResult> {
  const clock = options.now ?? (() => Date.now());
  const startedAtMs = clock();
  const startedAt = new Date(startedAtMs).toISOString();
  const results: JobResult[] = [];

  for (const job of options.jobs) {
    const elapsed = clock() - startedAtMs;
    const remaining = options.budgetMs - elapsed;

    // No time to start it. Recorded as skipped with the numbers, so a run
    // that is consistently running out says so rather than looking like the
    // job silently stopped existing.
    if (remaining < job.estimateMs) {
      results.push({
        key: job.key,
        label: job.label,
        status: "skipped",
        durationMs: 0,
        reason: `out of time — ${Math.max(0, Math.round(remaining / 1000))}s left, needs about ${Math.round(
          job.estimateMs / 1000,
        )}s`,
      });
      continue;
    }

    const jobStart = clock();
    try {
      const note = (await job.run()) ?? null;
      results.push({
        key: job.key,
        label: job.label,
        status: "ok",
        durationMs: clock() - jobStart,
        ...(note ? { reason: note } : {}),
      });
    } catch (error) {
      results.push({
        key: job.key,
        label: job.label,
        status: "failed",
        durationMs: clock() - jobStart,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const summary = {
    ok: results.filter((row) => row.status === "ok").length,
    failed: results.filter((row) => row.status === "failed").length,
    skipped: results.filter((row) => row.status === "skipped").length,
  };

  return {
    startedAt,
    durationMs: clock() - startedAtMs,
    ok: summary.failed === 0,
    jobs: results,
    summary,
  };
}

/**
 * A route handler that answered with a non-2xx, turned into a throw.
 *
 * Every cron route returns a `Response` rather than throwing, including on
 * failure — so calling one and ignoring the status would record a broken job
 * as "ok". This is what makes the orchestrator notice.
 *
 * A 200 carrying `{ error }` is deliberately treated as success: the routes
 * use that shape for "this integration is not configured", which is a normal
 * state on a fresh instance and not something to alert anybody about.
 */
export async function expectOk(label: string, response: Response): Promise<string | null> {
  if (response.ok) {
    // A 200 is not always "it did something". The ad-spend and retargeting
    // routes answer `{ skipped: "not-configured" }` when their credentials
    // are absent, which is correct and is also the single likeliest reason
    // a number never appears on a screen. Kept and shown rather than
    // flattened into "ok", because the two look identical from outside and
    // only one of them needs somebody to go and paste a token in.
    try {
      const body: unknown = await response.clone().json();
      if (body && typeof body === "object") {
        const record = body as Record<string, unknown>;
        if (typeof record.skipped === "string") return `nothing to do: ${record.skipped}`;
        if (typeof record.error === "string") return `reported: ${record.error}`;
      }
    } catch {
      // Not JSON, or no body. Nothing to add.
    }
    return null;
  }
  let detail = "";
  try {
    detail = (await response.clone().text()).slice(0, 300);
  } catch {
    // A body that cannot be read is not the interesting part of the failure.
  }
  throw new Error(`${label} returned ${response.status}${detail ? `: ${detail}` : ""}`);
}
