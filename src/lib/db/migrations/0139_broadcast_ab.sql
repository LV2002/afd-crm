-- A/B broadcasts: an optional second template, and which version each recipient was given.
ALTER TABLE "whatsapp_broadcasts" ADD COLUMN "template_name_b" text;
--> statement-breakpoint
ALTER TABLE "whatsapp_broadcasts" ADD COLUMN "template_language_b" text;
--> statement-breakpoint
ALTER TABLE "whatsapp_broadcast_recipients" ADD COLUMN "variant" text DEFAULT 'a' NOT NULL;
--> statement-breakpoint
ALTER TABLE "whatsapp_broadcast_recipients" ADD CONSTRAINT "whatsapp_broadcast_recipients_variant_check" CHECK (variant in ('a','b'));
