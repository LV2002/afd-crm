-- Written to be safe to run again: an earlier build applied this file under a different
-- timestamp, so a deploy may meet a database that already has these objects.
-- What WhatsApp charges per message (editable: Meta changes its rate card),
-- what was actually billed per message, and which campaign a tracked link
-- belongs to with a log of each tap.
CREATE TABLE IF NOT EXISTS "whatsapp_rates" (
	"category" text PRIMARY KEY NOT NULL,
	"rate_ten_thousandths" integer NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid
);--> statement-breakpoint
ALTER TABLE "whatsapp_rates" DROP CONSTRAINT IF EXISTS "whatsapp_rates_updated_by_profiles_id_fk";--> statement-breakpoint
ALTER TABLE "whatsapp_rates" ADD CONSTRAINT "whatsapp_rates_updated_by_profiles_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- Rupees per message in ten-thousandths of a rupee (8631 = ₹0.8631). Meta's India
-- rate card at the time of writing; check it and edit under WhatsApp → Spend.
INSERT INTO "whatsapp_rates" ("category", "rate_ten_thousandths") VALUES
  ('marketing', 8631), ('utility', 1150), ('authentication', 1150), ('service', 0)
ON CONFLICT DO NOTHING;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "whatsapp_spend" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"wa_message_id" text NOT NULL,
	"category" text NOT NULL,
	"billable" boolean NOT NULL,
	"amount_ten_thousandths" integer NOT NULL,
	"broadcast_id" uuid,
	"flow_id" uuid,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "whatsapp_spend" DROP CONSTRAINT IF EXISTS "whatsapp_spend_broadcast_id_whatsapp_broadcasts_id_fk";--> statement-breakpoint
ALTER TABLE "whatsapp_spend" ADD CONSTRAINT "whatsapp_spend_broadcast_id_whatsapp_broadcasts_id_fk" FOREIGN KEY ("broadcast_id") REFERENCES "public"."whatsapp_broadcasts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_spend" DROP CONSTRAINT IF EXISTS "whatsapp_spend_flow_id_whatsapp_flows_id_fk";--> statement-breakpoint
ALTER TABLE "whatsapp_spend" ADD CONSTRAINT "whatsapp_spend_flow_id_whatsapp_flows_id_fk" FOREIGN KEY ("flow_id") REFERENCES "public"."whatsapp_flows"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "whatsapp_spend_message_uq" ON "whatsapp_spend" USING btree ("wa_message_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "whatsapp_spend_occurred_idx" ON "whatsapp_spend" USING btree ("occurred_at");--> statement-breakpoint
ALTER TABLE "whatsapp_links" ADD COLUMN IF NOT EXISTS "campaign" text;--> statement-breakpoint
ALTER TABLE "whatsapp_links" ADD COLUMN IF NOT EXISTS "broadcast_id" uuid REFERENCES "whatsapp_broadcasts"("id") ON DELETE set null;--> statement-breakpoint
ALTER TABLE "whatsapp_links" ADD COLUMN IF NOT EXISTS "flow_id" uuid REFERENCES "whatsapp_flows"("id") ON DELETE set null;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "whatsapp_link_clicks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"link_id" uuid NOT NULL,
	"clicked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ref" text,
	"user_agent" text
);--> statement-breakpoint
ALTER TABLE "whatsapp_link_clicks" DROP CONSTRAINT IF EXISTS "whatsapp_link_clicks_link_id_whatsapp_links_id_fk";--> statement-breakpoint
ALTER TABLE "whatsapp_link_clicks" ADD CONSTRAINT "whatsapp_link_clicks_link_id_whatsapp_links_id_fk" FOREIGN KEY ("link_id") REFERENCES "public"."whatsapp_links"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "whatsapp_link_clicks_link_idx" ON "whatsapp_link_clicks" USING btree ("link_id","clicked_at");--> statement-breakpoint
-- Read and written only by server code on the direct connection.
ALTER TABLE "whatsapp_rates" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "whatsapp_spend" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "whatsapp_link_clicks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
-- A lead that comes from the WhatsApp API number gets its own source.
INSERT INTO "dropdown_options" ("category", "value", "label", "sort_order")
SELECT 'lead_source', 'whatsapp_api', 'WhatsApp API', 100
WHERE EXISTS (SELECT 1 FROM "dropdown_categories" c WHERE c."key" = 'lead_source')
ON CONFLICT ("category", "value") DO NOTHING;
