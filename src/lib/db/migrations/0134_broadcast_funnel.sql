-- Broadcast results funnel: when each recipient's message was delivered,
-- read, and answered. Filled by the WhatsApp status webhook and the inbound
-- handler; null means "not yet" (or never).
ALTER TABLE "whatsapp_broadcast_recipients" ADD COLUMN "delivered_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "whatsapp_broadcast_recipients" ADD COLUMN "read_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "whatsapp_broadcast_recipients" ADD COLUMN "replied_at" timestamp with time zone;
--> statement-breakpoint
CREATE INDEX "whatsapp_broadcast_recipients_wa_message_id_idx" ON "whatsapp_broadcast_recipients" USING btree ("wa_message_id") WHERE wa_message_id is not null;
--> statement-breakpoint
CREATE INDEX "whatsapp_broadcast_recipients_phone_idx" ON "whatsapp_broadcast_recipients" USING btree ("phone") WHERE replied_at is null;
