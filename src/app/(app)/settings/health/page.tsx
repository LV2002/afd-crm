import { desc, isNull } from "drizzle-orm";

import { AccessDenied } from "@/components/layout/access-denied";
import { Badge } from "@/components/ui/badge";
import { can, getCurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { errorEvents } from "@/lib/db/schema";
import { alertRecipients, emailConfigured } from "@/lib/email/send";
import { formatDateIST } from "@/lib/format/date";

import { ResolveButton } from "./resolve-button";

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

  const [open, recentlyFixed] = await Promise.all([
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
  ]);

  const configured = emailConfigured();
  const recipients = alertRecipients();

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
            {configured
              ? "Set ALERT_EMAIL_TO to the addresses that should hear about failures."
              : "Set RESEND_API_KEY and EMAIL_FROM to turn email on, then ALERT_EMAIL_TO for who hears about failures."}{" "}
            Problems are still recorded below.
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
