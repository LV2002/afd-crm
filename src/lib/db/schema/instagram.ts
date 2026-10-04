import { index, integer, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { idColumn, timestamps } from "./_helpers";
import { interactionDirectionEnum } from "./activity";
import { profiles } from "./auth";
import { leads } from "./leads";

/**
 * Instagram DMs.
 *
 * Modelled as **conversations**, not as messages hanging off a lead, and
 * that is the whole design decision. On Leon's instruction (docs/
 * DECISIONS.md, 2026-10-04): a DM does not create a lead. Most Instagram
 * messages are a question, a reply to a story, or nothing, and a CRM that
 * turns each one into a lead stops being a record of who is enrolling.
 *
 * So the conversation is the object. `lead_id` is null until a counsellor
 * presses **Convert to lead**, which runs `resolveOrCreateLead()` like
 * every other source (CLAUDE.md non-negotiable #8: one ingestion path, no
 * shortcuts) and links the result back here.
 *
 * Deliberately separate tables from `whatsapp_messages` rather than a
 * `channel` column on it: that table's `from_phone`/`to_phone` are NOT
 * NULL and an Instagram correspondent has no phone number at all — which
 * is also why `ig_user_id` is the identity here. Identity is the thing
 * these two channels genuinely do not share.
 */
export const instagramMessageStatusEnum = pgEnum("instagram_message_status", [
  "queued",
  "sent",
  "failed",
  "received",
]);

export const instagramConversations = pgTable(
  "instagram_conversations",
  {
    id: idColumn(),
    /**
     * Meta's Instagram-scoped user id (IGSID) for the person on the other
     * end. Not their handle: the handle can change and is not always
     * available, while this id is stable for this app-and-account pair and
     * is the only thing a reply can be addressed to.
     */
    igUserId: text("ig_user_id").notNull(),
    /** The @handle, when the API gives us one. Display only — never an identity. */
    username: text("username"),
    name: text("name"),
    profilePicUrl: text("profile_pic_url"),
    /**
     * Set by **Convert to lead**, null until then. `set null` rather than
     * cascade: if a lead is ever hard-deleted the conversation is still a
     * real conversation that happened, and losing the transcript would be
     * the worse outcome.
     */
    leadId: uuid("lead_id").references(() => leads.id, { onDelete: "set null" }),
    /** Who is handling it. Null means nobody yet, which is what the Unassigned filter is for. */
    assignedTo: uuid("assigned_to").references(() => profiles.id, { onDelete: "set null" }),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true }),
    /**
     * The last time *they* wrote, which is the clock that matters: Meta's
     * messaging policy only allows a reply within 24 hours of the last
     * inbound message. Stored rather than derived so the inbox can grey
     * out the reply box without scanning the whole thread.
     */
    lastInboundAt: timestamp("last_inbound_at", { withTimezone: true }),
    /** Inbound messages since somebody last opened the thread. */
    unreadCount: integer("unread_count").notNull().default(0),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex("instagram_conversations_ig_user_id_uq").on(t.igUserId),
    index("instagram_conversations_last_message_idx").on(t.lastMessageAt.desc()),
    index("instagram_conversations_lead_idx").on(t.leadId),
  ],
);

export const instagramMessages = pgTable(
  "instagram_messages",
  {
    id: idColumn(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => instagramConversations.id, { onDelete: "cascade" }),
    direction: interactionDirectionEnum("direction").notNull(),
    /** Meta's own message id — unique, which is what makes a redelivered webhook idempotent. */
    igMessageId: text("ig_message_id"),
    body: text("body"),
    /**
     * An attachment is recorded by type and URL rather than downloaded,
     * the same deliberate deferral as inbound WhatsApp media: nothing is
     * lost (the raw delivery is in `webhook_events`), and Meta's
     * attachment URLs expire, so a counsellor may see a dead link rather
     * than an image. Said here so it is a known limitation rather than a
     * surprise.
     */
    attachmentType: text("attachment_type"),
    attachmentUrl: text("attachment_url"),
    /** A reply to one of our own story posts, or to a specific message, arrives with context. */
    replyToStory: text("reply_to_story"),
    status: instagramMessageStatusEnum("status").notNull().default("received"),
    errorMessage: text("error_message"),
    /** The counsellor who pressed send. Null on anything inbound. */
    sentBy: uuid("sent_by").references(() => profiles.id, { onDelete: "set null" }),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex("instagram_messages_ig_message_id_uq").on(t.igMessageId),
    index("instagram_messages_conversation_idx").on(t.conversationId, t.sentAt),
  ],
);
