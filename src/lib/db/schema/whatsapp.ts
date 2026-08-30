import { sql } from "drizzle-orm";
import { index, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { idColumn, softDelete, timestamps } from "./_helpers";
import { interactionDirectionEnum } from "./activity";
import { profiles } from "./auth";
import { leads } from "./leads";

/**
 * "One number per counsellor" (Leon's explicit call, overriding this
 * session's own recommended shared-number-with-attribution model): every
 * counsellor who sends/receives WhatsApp has their own
 * `integration_credentials` row (`provider = 'whatsapp'`, `key =
 * 'phone_number_id'`, `scope_id = <their profile id>`), all sharing one
 * org-wide access token (a single WhatsApp Business Account System User
 * token can act on any phone number under it — that's how Meta's Cloud
 * API actually works, so there's no need for N separate tokens to get N
 * separate numbers). `counsellor_id` here is the number's owner, resolved
 * either from `metadata.phone_number_id` on an inbound webhook delivery or
 * from the sender's own session on an outbound message.
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
