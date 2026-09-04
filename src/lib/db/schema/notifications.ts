import { boolean, index, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { idColumn, softDelete, timestamps } from "./_helpers";
import { profiles } from "./auth";
import { centers } from "./org";

/**
 * Who gets told about what.
 *
 * The EVENTS are fixed in code (`lib/notifications/events.ts`), on the same
 * discipline as permission primitives: an event key with no emit site
 * notifies nobody, so inventing one at runtime would be a switch that does
 * nothing. What is configuration — a row here, editable by an admin with no
 * deploy — is everything about the response: whether the event notifies at
 * all, which roles hear about it, whether the lead's own owner hears about
 * it, on which channels, and in what words.
 *
 * CLAUDE.md § What is configurable: "Notifications — which events notify
 * which roles, on which channels, with what copy."
 */
export const notificationSettings = pgTable(
  "notification_settings",
  {
    id: idColumn(),
    /** A key from NOTIFICATION_EVENTS. Unique: one rule per event. */
    eventKey: text("event_key").notNull(),
    isEnabled: boolean("is_enabled").notNull().default(true),
    /**
     * Roles whose holders are notified. Plain uuids rather than a join
     * table: this is a short configuration list an admin edits as a set of
     * checkboxes, never queried from the role's side, and the same shape
     * `field_definitions.visible_to_roles` already uses.
     */
    notifyRoles: uuid("notify_roles").array(),
    /**
     * Also notify the person who owns the lead the event is about,
     * whoever that turns out to be. Separate from `notifyRoles` because
     * "the owner" is not a role — it is whoever the row points at.
     */
    notifyOwner: boolean("notify_owner").notNull().default(false),
    /**
     * Delivery channels. Only `in_app` is wired today; the column is an
     * array so adding WhatsApp or email later is a config change rather
     * than a migration. Deliberately NOT surfaced as an editable control
     * until a second channel actually delivers — a switch that silently
     * does nothing is the exact failure this whole feature exists to fix.
     */
    channels: text("channels").array().notNull().default(["in_app"]),
    /** Mustache-lite: `{{lead_name}}`. See renderTemplate(). */
    titleTemplate: text("title_template").notNull(),
    bodyTemplate: text("body_template").notNull(),
    ...timestamps(),
    ...softDelete(),
  },
  (t) => [uniqueIndex("notification_settings_event_key_uq").on(t.eventKey)],
);

/**
 * One delivered notification, for one person.
 *
 * Rows are written per recipient rather than once per event with a
 * fan-out at read time: read state is per person, the copy can differ per
 * person, and a recipient list resolved at send time is the honest record
 * of who was actually told — recomputing it later from today's roles would
 * quietly rewrite history when someone changes role.
 */
export const notifications = pgTable(
  "notifications",
  {
    id: idColumn(),
    recipientId: uuid("recipient_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    /** The NOTIFICATION_EVENTS key this came from, for filtering and counts. */
    eventKey: text("event_key").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    /** Where clicking it should go, e.g. `/leads/<id>`. Relative, always. */
    href: text("href"),
    /** What it is about, so a lead's page could show its own notifications. */
    entityType: text("entity_type"),
    entityId: uuid("entity_id"),
    /**
     * Denormalised from the subject at send time. A centre head who moves
     * centres should not retroactively lose or gain sight of what they
     * were told, and resolving the centre through the lead at read time
     * would do exactly that.
     */
    centerId: uuid("center_id").references(() => centers.id, { onDelete: "set null" }),
    /** Anything the copy needed, kept for debugging a wrong-looking message. */
    context: jsonb("context").$type<Record<string, unknown>>(),
    readAt: timestamp("read_at", { withTimezone: true }),
    ...timestamps(),
    ...softDelete(),
  },
  (t) => [
    // The bell's query: this person's unread, newest first. Every page
    // load runs it, so it gets the index.
    index("notifications_recipient_idx").on(t.recipientId, t.readAt, t.createdAt),
  ],
);
