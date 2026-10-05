import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { idColumn, softDelete, timestamps } from "./_helpers";
import { interactionDirectionEnum } from "./activity";
import { profiles } from "./auth";
import { leads } from "./leads";

/**
 * ONE WhatsApp Business API number for the whole institute — a single
 * org-level `integration_credentials` row (`provider = 'whatsapp'`,
 * `key = 'phone_number_id'`, no `scope_id`).
 *
 * This replaced an earlier "one number per counsellor" design once the
 * constraint behind it became clear: a number registered to the Cloud API
 * can no longer be used in the WhatsApp Business app, and AFD's
 * counsellors keep those apps on their own phones. Per-counsellor API
 * numbers would have taken those away, or required a second SIM each.
 *
 * So the number no longer says who a conversation belongs to.
 * `counsellor_id` is the lead's own counsellor — read from the lead on an
 * inbound message, and the sender's session on an outbound one — which is
 * also what RLS scopes the thread by. `sent_by` records the individual
 * who actually pressed send.
 */
export const whatsappMessageTypeEnum = pgEnum("whatsapp_message_type", ["text", "template", "media"]);

export const whatsappMessageStatusEnum = pgEnum("whatsapp_message_status", [
  "queued",
  "sent",
  "delivered",
  "read",
  "failed",
  "received",
]);

/**
 * docs/01-DATA-MODEL.md § Activity treats this as its own thread, not a
 * squeezed-in `interactions` row — `interactions` has a NOT NULL-ish
 * check (`next_action` required unless `source = 'system'`) built for
 * deliberate human logging, not a running chat transcript, and a message
 * carries fields (delivery status, media, template name) an interaction
 * log has no use for. The two stay separate; the lead detail page renders
 * them as separate sections.
 *
 * Inbound media (image/document/audio/video) is recorded by its Meta
 * media id and mime type, not downloaded into Supabase Storage — that's
 * real, deliberately deferred work (see docs/DECISIONS.md), not an
 * oversight: nothing is lost (the raw webhook delivery is in
 * `webhook_events`), a counsellor just can't view the media inline yet.
 */
export const whatsappMessages = pgTable(
  "whatsapp_messages",
  {
    id: idColumn(),
    /**
     * Nullable, because this number is a broadcasting channel rather than
     * a way in.
     *
     * AFD's enquiries arrive on the counsellors' own WhatsApp Business
     * apps and are typed into the CRM by hand; the API number only sends
     * marketing and receives the replies to it. So an inbound message is
     * matched to an EXISTING lead by phone and never creates one — a
     * reply from a number nobody has entered yet is real and worth
     * seeing, but it is not an enquiry, and manufacturing a lead from it
     * would fill the pipeline with people who only pressed a button.
     * Those rows land here with no lead, visible to whoever runs
     * campaigns (migration 0042).
     */
    leadId: uuid("lead_id").references(() => leads.id, { onDelete: "cascade" }),
    counsellorId: uuid("counsellor_id").references(() => profiles.id, { onDelete: "set null" }),
    direction: interactionDirectionEnum("direction").notNull(),
    waMessageId: text("wa_message_id"),
    fromPhone: text("from_phone").notNull(),
    toPhone: text("to_phone").notNull(),
    messageType: whatsappMessageTypeEnum("message_type").notNull().default("text"),
    body: text("body"),
    templateName: text("template_name"),
    mediaId: text("media_id"),
    mediaMimeType: text("media_mime_type"),
    /**
     * Where the bytes actually live, once fetched from Meta into the
     * private attachments bucket. Null means not fetched yet — Meta keeps
     * inbound media for 30 days and then it is gone, so an id that is
     * never redeemed becomes a permanently missing message.
     */
    mediaStoragePath: text("media_storage_path"),
    mediaFilename: text("media_filename"),
    mediaSizeBytes: integer("media_size_bytes"),
    mediaDownloadedAt: timestamp("media_downloaded_at", { withTimezone: true }),
    /** Why a fetch failed, and how many times it has been tried. Five and it stops. */
    mediaError: text("media_error"),
    mediaAttempts: integer("media_attempts").notNull().default(0),
    status: whatsappMessageStatusEnum("status").notNull().default("queued"),
    errorMessage: text("error_message"),
    sentBy: uuid("sent_by").references(() => profiles.id, { onDelete: "set null" }),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
    ...timestamps(),
    ...softDelete(),
  },
  (t) => [
    index("whatsapp_messages_lead_id_occurred_at_idx").on(t.leadId, t.occurredAt),
    uniqueIndex("whatsapp_messages_wa_message_id_uq").on(t.waMessageId).where(sql`wa_message_id is not null`),
  ],
);

/**
 * People who have told us to stop.
 *
 * A suppression is by PHONE NUMBER, not by lead. Somebody who says STOP
 * is speaking for the number in their hand, and the CRM may not have them
 * as a lead at all — this number sends the institute's marketing, and a
 * reply from a stranger is a reply from a stranger. Keying on the number
 * also means a person on two records (a parent on two siblings') is
 * suppressed once, which is what they asked for.
 *
 * `released_at` rather than a delete, for the reason every other
 * consequential record in this system keeps its history: "we stopped
 * messaging them on the 3rd, and they asked to be added back on the 9th"
 * is the answer to a complaint. A row with `released_at` set no longer
 * suppresses anything.
 */
export const whatsappSuppressions = pgTable(
  "whatsapp_suppressions",
  {
    id: idColumn(),
    /** E.164 via normalizePhone(), so a number matches however it was written. */
    phone: text("phone").notNull(),
    /** The keyword they sent, or a note when somebody records it by hand. */
    reason: text("reason"),
    /** 'keyword' when they messaged us; 'manual' when a person entered it. */
    source: text("source").notNull().default("keyword"),
    /** Null for a keyword opt-out — nobody in the CRM did it. */
    createdBy: uuid("created_by").references(() => profiles.id, { onDelete: "set null" }),
    /** Set when they opt back in, or an admin lifts it. Null means live. */
    releasedAt: timestamp("released_at", { withTimezone: true }),
    releasedBy: uuid("released_by").references(() => profiles.id, { onDelete: "set null" }),
    ...timestamps(),
  },
  (t) => [
    // One live suppression per number. A released row does not block a
    // fresh opt-out later, which is exactly what somebody who opts out,
    // back in, and out again should get.
    uniqueIndex("whatsapp_suppressions_phone_live_uq")
      .on(t.phone)
      .where(sql`released_at is null`),
    index("whatsapp_suppressions_phone_idx").on(t.phone),
  ],
);

/**
 * Which WhatsApp numbers this institute has, and what each one is for.
 *
 * There was one number, named by a single `phone_number_id` in the
 * integration credentials, and that was enough while the only number was
 * the institute's broadcast channel. Coexistence changes the shape of the
 * problem: a counsellor's own number joins the account, keeps its
 * WhatsApp Business app, and starts mirroring to the CRM — so there are
 * several numbers, each belonging to a different person, and the rules
 * for one are wrong for another.
 *
 * The rule that differs most is whether an inbound message may create a
 * lead. On the broadcast number it must not: a reply there is somebody
 * who pressed a button on a campaign, and manufacturing a lead from it
 * fills the pipeline with people who never enquired. On a counsellor's
 * own number the opposite is true — a stranger messaging a counsellor to
 * ask about NIFT coaching is the highest-intent enquiry the institute
 * gets, and it was being typed in by hand or lost.
 *
 * So the policy is a column, per number, rather than a constant in the
 * webhook handler.
 */
export const whatsappNumberModeEnum = pgEnum("whatsapp_number_mode", [
  /** Cloud API only. The institute's own number: it sends, and receives replies. */
  "api",
  /**
   * Coexistence: the WhatsApp Business app on somebody's phone AND the
   * Cloud API on the same number, at the same time. Messages sent from
   * the phone arrive as `smb_message_echoes`; up to 180 days of past
   * chats arrive as `history`.
   */
  "coexistence",
]);

export const whatsappNumbers = pgTable(
  "whatsapp_numbers",
  {
    id: idColumn(),
    /** Meta's id for the number, which is what every webhook identifies it by. */
    phoneNumberId: text("phone_number_id").notNull(),
    /** As Meta shows it. Display only — never used for matching. */
    displayPhoneNumber: text("display_phone_number"),
    /** What an admin calls it: "Kochi front desk", "Athira's phone". */
    label: text("label").notNull(),
    mode: whatsappNumberModeEnum("mode").notNull().default("api"),
    /**
     * Whose phone this is, for a coexistence number.
     *
     * Does two things: messages echoed from the phone are attributed to
     * them rather than appearing to come from nobody, and a lead created
     * from an inbound message on this number is assigned to them — the
     * person already holding the conversation is the right owner, and
     * sending it through the rules engine to land on somebody else would
     * be actively wrong.
     */
    counsellorId: uuid("counsellor_id").references(() => profiles.id, { onDelete: "set null" }),
    /**
     * Whether an inbound message from a number nobody has entered yet
     * creates a lead. False for the broadcast number, true for a
     * counsellor's own — see this table's own comment.
     */
    createsLeads: boolean("creates_leads").notNull().default(false),
    /**
     * When Meta finished sending the 180-day history backfill.
     *
     * Null means it has not arrived (or was never consented to). Worth
     * storing because the backfill comes in chunks over several minutes
     * after onboarding and somebody will ask whether it is done.
     */
    historyCompletedAt: timestamp("history_completed_at", { withTimezone: true }),
    /** How many past messages the backfill brought in. */
    historyMessageCount: integer("history_message_count").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    ...timestamps(),
    ...softDelete(),
  },
  (t) => [uniqueIndex("whatsapp_numbers_phone_number_id_uq").on(t.phoneNumberId)],
);
