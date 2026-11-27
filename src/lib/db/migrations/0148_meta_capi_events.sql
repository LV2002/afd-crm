-- Status changes sent to Meta's Conversions API (CRM / Conversion Leads), one
-- row per temperature_history row, so each change is sent once.
CREATE TABLE "meta_capi_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"history_id" uuid NOT NULL,
	"lead_id" uuid NOT NULL,
	"event_name" text NOT NULL,
	"status" text NOT NULL,
	"error" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "meta_capi_events" ADD CONSTRAINT "meta_capi_events_history_id_temperature_history_id_fk" FOREIGN KEY ("history_id") REFERENCES "public"."temperature_history"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meta_capi_events" ADD CONSTRAINT "meta_capi_events_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "meta_capi_events_history_uq" ON "meta_capi_events" USING btree ("history_id");--> statement-breakpoint
-- Written and read only by the sync job on the direct connection.
ALTER TABLE "meta_capi_events" ENABLE ROW LEVEL SECURITY;
