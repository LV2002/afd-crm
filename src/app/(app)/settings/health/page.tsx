import { desc, eq, isNull } from "drizzle-orm";

import { AccessDenied } from "@/components/layout/access-denied";
import { Badge } from "@/components/ui/badge";
import { can, getCurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { getMigrationStatus } from "@/lib/db/migration-status";
import { getSchemaDrift } from "@/lib/db/schema-drift";
import { describeDifference } from "@/lib/db/schema-compare";
import { cronRuns, errorEvents } from "@/lib/db/schema";
import { EmailNotConfigured } from "@/components/integrations/email-not-configured";
import {
  NightlyRunPanel,
  type NightlyJobRow,
  type NightlyRun,
} from "./nightly-run";
import { emailConfigured } from "@/lib/email/send";
import { resolveAlertRecipients } from "@/lib/errors/alert-recipients";
import { formatDateIST } from "@/lib/format/date";

import { ResolveButton } from "./resolve-button";
import { TestEmailButton } from "./test-email-button";

export const dynamic = "force-dynamic";

/**
 * What has broken lately.
 *
 * The application used to report nothing about itself: a webhook that
 * started erroring or a page that crashed for one counsellor was
 * invisible until somebody happened to mention it. Everything here is
 * grouped by fault rather than by occurrence, because the same bug firing
 * four hundred times is one thing to fix.
 */
export default async function HealthPage() {
  const user = await getCurrentUser();
  if (!user || !can(user, "settings.manage")) return <AccessDenied />;

  const [open, recentlyFixed, migrations, drift] = await Promise.all([
    db
      .select()
      .from(errorEvents)
      .where(isNull(errorEvents.resolvedAt))
      .orderBy(desc(errorEvents.lastSeenAt))
      .limit(50),
    db
      .select()
      .from(errorEvents)
      .orderBy(desc(errorEvents.resolvedAt))
      .limit(5),
    getMigrationStatus(),
    getSchemaDrift(),
  ]);

  const driftSummary = drift.error ? null : describeDifference(drift);

  const configured = emailConfigured();
  const recipients = await resolveAlertRecipients();

  // Through the direct client, like everything else on this page: it is
  // read by an admin whose scope the RLS policy would allow anyway, and
  // the rest of the panel's data comes the same way.
  const [lastRun] = await db
    .select()
    .from(cronRuns)
    .where(eq(cronRuns.jobKey, "daily"))
    .orderBy(desc(cronRuns.startedAt))
    .limit(1);

  const nightlyRun: NightlyRun | null = lastRun
    ? {
        startedAt: lastRun.startedAt.toISOString(),
        durationMs: lastRun.durationMs,
        ok: lastRun.ok,
        okCount: lastRun.okCount,
        failedCount: lastRun.failedCount,
        skippedCount: lastRun.skippedCount,
        jobs: (lastRun.jobs ?? []) as NightlyJobRow[],
      }
    : null;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-lg font-semibold">Platform health</h2>
        <p className="max-w-2xl text-muted-foreground">
          Everything that has failed — a cron that threw, a webhook that errored, a screen that
          crashed for somebody. Grouped by fault, because the same bug firing four hundred times
          is one thing to fix.
        </p>
      </div>

      <div
        className={
          configured && recipients.length > 0
            ? "rounded-lg border border-success/40 bg-success-subtle p-4"
            : "rounded-lg border border-warning/40 bg-warning-subtle p-4"
        }
      >
        {configured && recipients.length > 0 ? (
          <p className="text-[0.9375rem]">
            <strong>Alerts are on.</strong> Problems are emailed to {recipients.join(", ")} — once
            when a fault first appears, then only when it has happened ten times as often, so a
            fault firing every few seconds cannot fill your inbox.
          </p>
        ) : (
          <p className="text-[0.9375rem]">
            <strong>Nobody is being emailed.</strong>{" "}
            {recipients.length === 0 ? (
              <>
                Put an address in <strong>Settings → Organisation → Send platform alerts to</strong>
                .{" "}
              </>
            ) : null}
            Problems are still recorded below, and still appear in the bell for anyone set to
            receive the <em>Something broke</em> notification.
          </p>
        )}

        {/*
          Always offered, including when the box above is green. "Alerts
          are on" only means two settings are non-empty — a revoked key, a
          typo in the address, an unverified sending domain and a sandbox
          that will only deliver to one inbox all read as "on" from here.
          One real send is the only honest check, and the provider's
          refusal names which of those it is.
        */}
        <TestEmailButton />
      </div>

      {/*
        The two halves of "nobody is being emailed" are different
        problems with different owners: an address is one field on a
        settings screen, and email sending itself needs an account
        somewhere else. They used to be one sentence, which made the
        easy half look as blocked as the hard one.
      */}
      {/*
        Above the fault list and above everything else that is a symptom.
        "Did it run?" is the first question when a number is missing, and
        the answer used to be unavailable from any screen.
      */}
      <section className="flex flex-col gap-3">
        <h2 className="font-medium">The nightly run</h2>
        <NightlyRunPanel run={nightlyRun} />
      </section>

      {!configured && (
        <EmailNotConfigured consequence="Failures are recorded below and appear in the bell for administrators, which needs nothing configured. What is not happening is the email — so a fault at 9pm waits until somebody opens this screen." />
      )}

      {/*
        Above the fault list on purpose. When this is wrong, most of what
        is below it is a symptom: a build that deployed without its
        migrations throws "column x does not exist" on one screen and
        nothing anywhere explains why. Somebody opening this page because
        something broke should read the cause before the effects.
      */}
      <div
        className={
          migrations.pending.length > 0 || migrations.error
            ? "rounded-lg border border-destructive/50 bg-destructive/5 p-4"
            : "rounded-lg border p-4"
        }
      >
        {migrations.error ? (
          <p className="text-[0.9375rem]">
            <strong>The database&rsquo;s migration record could not be read.</strong>{" "}
            {migrations.error} This build expects {migrations.expected} migrations.
          </p>
        ) : migrations.pending.length > 0 ? (
          <p className="text-[0.9375rem]">
            <strong>
              The database is {migrations.pending.length}{" "}
              {migrations.pending.length === 1 ? "migration" : "migrations"} behind this build.
            </strong>{" "}
            It has run {migrations.applied} of {migrations.expected}. Screens that use anything
            added by {migrations.pending.join(", ")} will fail until the migration step runs.
            Re-deploy, and check the build log for the <code>drizzle-kit migrate</code> step.
          </p>
        ) : (
          <p className="text-[0.9375rem]">
            <strong>The database is up to date.</strong> All {migrations.expected} migrations have
            run, so no screen is talking to a table older than the code.
          </p>
        )}
      </div>

      {/*
        Counting migrations was not enough, and this is the evidence.
        On 3 October the banner above said all 78 had run — correctly —
        while `leads.assigned_at` was missing, because migration 0071 was
        recorded as applied with only part of it there. Confirming an
        admission starts with `select *` on `leads`, so it died on a column
        the bookkeeping swore was present. This compares the columns the
        code actually selects against the ones the database actually has.
      */}
      <div
        className={
          driftSummary || drift.error
            ? "rounded-lg border border-destructive/50 bg-destructive/5 p-4"
            : "rounded-lg border p-4"
        }
      >
        {drift.error ? (
          <p className="text-[0.9375rem]">
            <strong>The database&rsquo;s shape could not be checked.</strong> {drift.error}
          </p>
        ) : driftSummary ? (
          <p className="text-[0.9375rem]">
            <strong>The database is not the shape this build expects:</strong> {driftSummary}.
            Any screen that reads one of these will fail outright. This is a migration that was
            recorded as applied without fully running — it needs a repair migration, not a
            re-deploy.
          </p>
        ) : (
          <p className="text-[0.9375rem]">
            <strong>The database matches the code.</strong> All {drift.tablesChecked} tables have
            every column the application expects to read.
          </p>
        )}
      </div>

      <section className="flex flex-col gap-3">
        <h3 className="font-semibold">
          Open problems
          {open.length > 0 && (
            <span className="ml-2 font-normal text-muted-foreground">{open.length}</span>
          )}
        </h3>

        {open.length === 0 ? (
          <p className="text-muted-foreground">Nothing is broken. Genuinely — this list is empty.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {open.map((row) => (
              <div key={row.id} className="flex flex-col gap-2 rounded-lg border bg-card p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="secondary" className="font-mono text-xs">
                        {row.source}
                      </Badge>
                      {row.count > 1 && (
                        <Badge variant={row.count >= 10 ? "destructive" : "secondary"}>
                          {row.count}×
                        </Badge>
                      )}
                    </div>
                    <p className="mt-2 break-words font-medium">{row.message}</p>
                  </div>
                  <ResolveButton errorId={row.id} />
                </div>

                <p className="text-sm text-muted-foreground">
                  First seen {formatDateIST(row.firstSeenAt, "d MMM yyyy, h:mm a")} · last seen{" "}
                  {formatDateIST(row.lastSeenAt, "d MMM yyyy, h:mm a")}
                  {row.notifiedAtCount === null && " · nobody emailed yet"}
                </p>

                {row.context && Object.keys(row.context).length > 0 && (
                  <pre className="overflow-x-auto rounded bg-muted p-2 text-xs">
                    {JSON.stringify(row.context, null, 2)}
                  </pre>
                )}

                {row.stack && (
                  <details>
                    <summary className="cursor-pointer text-sm text-muted-foreground">
                      Technical detail
                    </summary>
                    <pre className="mt-2 overflow-x-auto rounded bg-muted p-2 text-xs">
                      {row.stack}
                    </pre>
                  </details>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {recentlyFixed.some((row) => row.resolvedAt) && (
        <section className="flex flex-col gap-2">
          <h3 className="font-semibold">Recently marked fixed</h3>
          <ul className="flex flex-col gap-1 text-sm text-muted-foreground">
            {recentlyFixed
              .filter((row) => row.resolvedAt)
              .map((row) => (
                <li key={row.id}>
                  <span className="font-mono text-xs">{row.source}</span> — {row.message}{" "}
                  <span className="text-xs">
                    ({formatDateIST(row.resolvedAt, "d MMM yyyy")})
                  </span>
                </li>
              ))}
          </ul>
          <p className="text-sm text-muted-foreground">
            If one of these happens again it opens a new entry above rather than resuming this
            one, so you find out.
          </p>
        </section>
      )}
    </div>
  );
}
