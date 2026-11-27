-- Each database (contact list) is its own audience on Meta and Google,
-- separate from the leads audience. One row per (list, platform) holds the
-- platform's audience id; the members table records who was sent to which
-- list's audience so removals are possible.
CREATE TABLE "contact_list_audiences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"list_id" uuid NOT NULL,
	"platform" "ad_platform" NOT NULL,
	"external_id" text NOT NULL,
	"name" text NOT NULL,
	"last_synced_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "contact_list_audiences" ADD CONSTRAINT "contact_list_audiences_list_id_contact_lists_id_fk" FOREIGN KEY ("list_id") REFERENCES "public"."contact_lists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "contact_list_audiences_list_platform_uq" ON "contact_list_audiences" USING btree ("list_id","platform");--> statement-breakpoint
CREATE TABLE "ad_list_audience_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"list_id" uuid NOT NULL,
	"platform" "ad_platform" NOT NULL,
	"contact_id" uuid NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "ad_list_audience_members" ADD CONSTRAINT "ad_list_audience_members_list_id_contact_lists_id_fk" FOREIGN KEY ("list_id") REFERENCES "public"."contact_lists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_list_audience_members" ADD CONSTRAINT "ad_list_audience_members_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ad_list_audience_members_uq" ON "ad_list_audience_members" USING btree ("list_id","platform","contact_id");--> statement-breakpoint
-- Written and read only by the sync jobs (direct database role); no policy
-- means the browser roles see nothing, like ad_audience_contact_members.
ALTER TABLE "contact_list_audiences" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "ad_list_audience_members" ENABLE ROW LEVEL SECURITY;
