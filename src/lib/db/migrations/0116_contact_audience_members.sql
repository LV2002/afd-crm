-- Who from the contact database is in each ad platform's audience.
--
-- The contact counterpart of ad_audience_members (which is keyed by lead).
-- Recording what was sent is what makes removal possible when a contact is
-- deleted, becomes a lead, or sits on a list that stops allowing ads.
CREATE TABLE "ad_audience_contact_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"platform" "ad_platform" NOT NULL,
	"contact_id" uuid NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "ad_audience_contact_members" ADD CONSTRAINT "ad_audience_contact_members_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ad_audience_contact_members_platform_contact_uq" ON "ad_audience_contact_members" USING btree ("platform","contact_id");--> statement-breakpoint
-- Written and read only by the sync jobs on the direct connection, like
-- ad_audience_members: no policy for any browser role.
ALTER TABLE "ad_audience_contact_members" ENABLE ROW LEVEL SECURITY;
