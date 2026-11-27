-- Meta lead-ad campaigns, ad sets or forms whose leads are NOT brought into
-- the CRM. Checked by the Meta lead webhook after the lead is fetched.
CREATE TABLE IF NOT EXISTS "meta_lead_filters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"external_id" text NOT NULL,
	"label" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "meta_lead_filters_kind_check" CHECK ("kind" IN ('campaign', 'adset', 'form'))
);--> statement-breakpoint
ALTER TABLE "meta_lead_filters" DROP CONSTRAINT IF EXISTS "meta_lead_filters_created_by_profiles_id_fk";--> statement-breakpoint
ALTER TABLE "meta_lead_filters" ADD CONSTRAINT "meta_lead_filters_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "meta_lead_filters_kind_id_uq" ON "meta_lead_filters" USING btree ("kind","external_id") WHERE deleted_at is null;--> statement-breakpoint
-- Read and written by server code on the direct connection (settings.manage is checked there).
ALTER TABLE "meta_lead_filters" ENABLE ROW LEVEL SECURITY;
