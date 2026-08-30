CREATE TYPE "public"."whatsapp_message_status" AS ENUM('queued', 'sent', 'delivered', 'read', 'failed', 'received');--> statement-breakpoint
CREATE TYPE "public"."whatsapp_message_type" AS ENUM('text', 'template', 'media');--> statement-breakpoint
CREATE TABLE "whatsapp_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" uuid NOT NULL,
	"counsellor_id" uuid,
	"direction" "interaction_direction" NOT NULL,
	"wa_message_id" text,
	"from_phone" text NOT NULL,
	"to_phone" text NOT NULL,
	"message_type" "whatsapp_message_type" DEFAULT 'text' NOT NULL,
	"body" text,
	"template_name" text,
	"media_id" text,
	"media_mime_type" text,
	"status" "whatsapp_message_status" DEFAULT 'queued' NOT NULL,
	"error_message" text,
	"sent_by" uuid,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "whatsapp_messages" ADD CONSTRAINT "whatsapp_messages_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_messages" ADD CONSTRAINT "whatsapp_messages_counsellor_id_profiles_id_fk" FOREIGN KEY ("counsellor_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_messages" ADD CONSTRAINT "whatsapp_messages_sent_by_profiles_id_fk" FOREIGN KEY ("sent_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "whatsapp_messages_lead_id_occurred_at_idx" ON "whatsapp_messages" USING btree ("lead_id","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "whatsapp_messages_wa_message_id_uq" ON "whatsapp_messages" USING btree ("wa_message_id") WHERE wa_message_id is not null;