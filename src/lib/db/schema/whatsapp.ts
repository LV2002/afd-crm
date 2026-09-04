import { sql } from "drizzle-orm";
import { index, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

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
    leadId: uuid("lead_id")
      .notNull()
      .references(() => leads.id, { onDelete: "cascade" }),
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
