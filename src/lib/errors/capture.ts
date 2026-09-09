import "server-only";

import { and, eq, isNull, sql } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { errorEvents } from "@/lib/db/schema";
import { alertRecipients, composeEmail, sendEmail } from "@/lib/email/send";

import { alertSubject, fingerprintError, shouldAlert } from "./fingerprint";

/**
 * Recording that something broke, and telling somebody.
 *
 * Nothing in this system reported its own failures. A webhook that
 * started erroring, a cron that threw, a page that crashed — the first
 * anybody knew was a counsellor saying "leads stopped coming in", days or
 * weeks later.
 *
 * ## The two rules
 *
 * **Never throw.** This is called from inside the thing that already went
 * wrong — a catch block in a cron, an error boundary, a webhook handler.
 * A reporting failure that takes down the request it was reporting on is
 * strictly worse than no reporting, so everything here is wrapped and
 * everything returns quietly.
 *
 * **Never flood.** An email on the first occurrence, then only when the
 * count reaches ten times what was last reported. A fault firing every
 * few seconds produces about one message per order of magnitude instead
 * of one per failure — which is the difference between an alert somebody
 * reads and a filter rule that hides all of them forever.
 */

export interface CaptureInput {
  /** Where it happened: `cron:payment-reminders`, `webhook:whatsapp`, `action:saveFeePlan`, `page`. */
  source: string;
  error: unknown;
  /** Anything useful for finding it again. Never credentials, never a full record. */
  context?: Record<string, unknown>;
}

function describe(error: unknown): { message: string; stack: string | null } {
  if (error instanceof Error) {
    return { message: error.message || error.name, stack: error.stack ?? null };
  }
  if (typeof error === "string") return { message: error, stack: null };
  try {
    return { message: JSON.stringify(error).slice(0, 500), stack: null };
  } catch {
    return { message: "An unserialisable error", stack: null };
  }
}

export async function captureError(input: CaptureInput): Promise<void> {
  const { message, stack } = describe(input.error);
  const fingerprint = fingerprintError(input.source, message);

  // Always on the console too. Vercel's own logs are where somebody looks
  // when the database is the thing that is broken, which is exactly when
  // the rest of this cannot help.
  console.error(`[${input.source}] ${message}`, input.context ?? {});

  try {
    // One statement: insert, or bump the existing open row. Two failures
    // arriving at the same moment must not race into two rows, and the
    // partial unique index is what makes the upsert land.
    const [row] = await db
      .insert(errorEvents)
      .values({
        fingerprint,
        source: input.source,
        message: message.slice(0, 2000),
        stack: stack?.slice(0, 8000) ?? null,
        context: input.context ?? null,
      })
      .onConflictDoUpdate({
        target: errorEvents.fingerprint,
        targetWhere: isNull(errorEvents.resolvedAt),
        set: {
          count: sql`${errorEvents.count} + 1`,
          lastSeenAt: new Date(),
          // The newest occurrence's detail replaces the oldest: when
          // somebody finally looks, the most recent context is the one
          // that helps.
          message: message.slice(0, 2000),
          stack: stack?.slice(0, 8000) ?? null,
          context: input.context ?? null,
        },
      })
      .returning({
        id: errorEvents.id,
        count: errorEvents.count,
        notifiedAtCount: errorEvents.notifiedAtCount,
      });

    if (!row) return;
    if (!shouldAlert(row.count, row.notifiedAtCount)) return;

    const recipients = alertRecipients();
    if (recipients.length === 0) return;

    const { text, html } = composeEmail({
      heading: row.count === 1 ? "Something broke in the CRM" : `Still breaking — ${row.count} times now`,
      lines: [
        `Where: ${input.source}`,
        `What: ${message.slice(0, 400)}`,
        row.count === 1
          ? "This is the first time it has happened."
          : `First seen earlier; it has now happened ${row.count} times.`,
        input.context && Object.keys(input.context).length > 0
          ? `Context: ${JSON.stringify(input.context).slice(0, 400)}`
          : "",
      ].filter(Boolean),
      actionLabel: "See recent problems",
      actionPath: "/settings/health",
      footer:
        "You will not get another email about this one until it has happened ten times as often.",
    });

    const sent = await sendEmail({
      to: recipients,
      subject: alertSubject(input.source, message, row.count),
      text,
      html,
    });

    // Only record that people were told if they actually were. Otherwise a
    // mail provider outage silently converts the first occurrence into a
    // failure nobody will ever be emailed about.
    if (sent.ok) {
      await db
        .update(errorEvents)
        .set({ notifiedAtCount: row.count })
        .where(eq(errorEvents.id, row.id));
    }
  } catch (reportingFailure) {
    // Deliberately terminal. See the rule at the top.
    console.error("captureError itself failed", reportingFailure);
  }
}

/**
 * Wraps a cron or webhook handler so a throw is recorded rather than
 * disappearing into a 500 nobody reads.
 *
 * Re-throws afterwards on purpose: Vercel's retry and the platform's own
 * error reporting both depend on the route actually failing, and
 * swallowing it here would make a broken job look healthy.
 */
export async function reportingFailures<T>(source: string, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    await captureError({ source, error });
    throw error;
  }
}

/** Marks a problem fixed. A fingerprint that returns afterwards opens a fresh row. */
export async function resolveError(id: string, note: string | null): Promise<void> {
  await db
    .update(errorEvents)
    .set({ resolvedAt: new Date(), resolvedNote: note })
    .where(and(eq(errorEvents.id, id), isNull(errorEvents.resolvedAt)));
}
