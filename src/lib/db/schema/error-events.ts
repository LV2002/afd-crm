import { sql } from "drizzle-orm";
import { index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

import { idColumn } from "./_helpers";

/**
 * What has broken, and whether anybody was told.
 *
 * Nothing in this system reported its own failures. A webhook that
 * started erroring, a cron that threw, a page that crashed — the first
 * anybody knew was a counsellor saying "leads stopped coming in", days
 * or weeks later.
 *
 * Grouped by `fingerprint` rather than stored per occurrence: the same
 * bug firing four hundred times is one thing to fix, and four hundred
 * rows is a table nobody opens twice. `count`, `first_seen_at` and
 * `last_seen_at` carry what the individual rows would have said.
 *
 * `notified_at_count` is the anti-flood mechanism, and is the reason
 * these alerts stay useful: an email goes out on the first occurrence and
 * then only when the count reaches ten times what was last reported. See
 * `lib/errors/fingerprint.ts`.
 */
export const errorEvents = pgTable(
  "error_events",
  {
    id: idColumn(),
    /** Stable id for "this kind of failure, from this place". */
    fingerprint: text("fingerprint").notNull(),
    /** Where it happened: `cron:payment-reminders`, `webhook:whatsapp`, `action:saveFeePlan`, `page`. */
    source: text("source").notNull(),
    message: text("message").notNull(),
    stack: text("stack"),
    /** Anything the caller knew — a lead id, a broadcast id, the URL. Never credentials. */
    context: jsonb("context").$type<Record<string, unknown>>(),
    count: integer("count").notNull().default(1),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    /** The count at which an email last went out. Null means nobody has been told. */
    notifiedAtCount: integer("notified_at_count"),
    /**
     * Marked fixed by a person. A fingerprint that returns after this
     * gets a fresh row — a bug coming back is news, and burying it in the
     * count of the one somebody closed last month is how it stays buried.
     */
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    resolvedNote: text("resolved_note"),
  },
  (t) => [
    // One OPEN row per fingerprint. Closing one and having it come back
    // creates a fresh row, which is the point — a bug returning is news.
    uniqueIndex("error_events_open_fingerprint_uq")
      .on(t.fingerprint)
      .where(sql`resolved_at is null`),
    index("error_events_last_seen_idx").on(t.lastSeenAt),
  ],
);
