CREATE TABLE "ad_audience_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"platform" "ad_platform" NOT NULL,
	"lead_id" uuid NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ad_audience_members" ADD CONSTRAINT "ad_audience_members_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ad_audience_members_platform_lead_id_uq" ON "ad_audience_members" USING btree ("platform","lead_id");