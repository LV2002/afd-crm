-- A Meta campaign / ad set / form can now send its leads to a database (contact
-- list) instead of simply being kept out of the CRM. Written to be safe to re-run.
ALTER TABLE "meta_lead_filters" ADD COLUMN IF NOT EXISTS "destination" text NOT NULL DEFAULT 'skip';--> statement-breakpoint
ALTER TABLE "meta_lead_filters" ADD COLUMN IF NOT EXISTS "contact_list_id" uuid;--> statement-breakpoint
ALTER TABLE "meta_lead_filters" DROP CONSTRAINT IF EXISTS "meta_lead_filters_contact_list_id_contact_lists_id_fk";--> statement-breakpoint
ALTER TABLE "meta_lead_filters" ADD CONSTRAINT "meta_lead_filters_contact_list_id_contact_lists_id_fk" FOREIGN KEY ("contact_list_id") REFERENCES "public"."contact_lists"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meta_lead_filters" DROP CONSTRAINT IF EXISTS "meta_lead_filters_destination_check";--> statement-breakpoint
ALTER TABLE "meta_lead_filters" ADD CONSTRAINT "meta_lead_filters_destination_check" CHECK ("destination" IN ('skip', 'contact_list') AND ("destination" <> 'contact_list' OR "contact_list_id" IS NOT NULL));
