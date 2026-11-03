-- The contact database: people we hold details for who are not leads.
--
-- School-seminar attendees, purchased lists, exam-application data. Kept
-- apart from `leads` so nobody is assigned, timed, followed up or counted
-- until somebody decides they are an enquiry and moves them across (or merges
-- them with the lead they already are). See schema/contacts.ts.
CREATE TABLE "contact_lists" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"source" text,
	"description" text,
	"center_id" uuid,
	"use_for_ads" boolean DEFAULT true NOT NULL,
	"use_for_whatsapp" boolean DEFAULT false NOT NULL,
	"created_by" uuid,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone
);--> statement-breakpoint
CREATE TABLE "contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"phone" text,
	"email" text,
	"fields" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"lead_id" uuid,
	"linked_at" timestamp with time zone,
	"linked_by" uuid,
	"linked_how" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone,
	"deleted_at" timestamp with time zone
);--> statement-breakpoint
CREATE TABLE "contact_list_members" (
	"contact_id" uuid NOT NULL,
	"list_id" uuid NOT NULL,
	"added_by" uuid,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contact_list_members_contact_id_list_id_pk" PRIMARY KEY("contact_id","list_id")
);--> statement-breakpoint
ALTER TABLE "contact_lists" ADD CONSTRAINT "contact_lists_center_id_centers_id_fk" FOREIGN KEY ("center_id") REFERENCES "public"."centers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_lists" ADD CONSTRAINT "contact_lists_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_linked_by_profiles_id_fk" FOREIGN KEY ("linked_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_list_members" ADD CONSTRAINT "contact_list_members_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_list_members" ADD CONSTRAINT "contact_list_members_list_id_contact_lists_id_fk" FOREIGN KEY ("list_id") REFERENCES "public"."contact_lists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_list_members" ADD CONSTRAINT "contact_list_members_added_by_profiles_id_fk" FOREIGN KEY ("added_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "contact_lists_name_uq" ON "contact_lists" USING btree ("name") WHERE archived_at is null;--> statement-breakpoint
CREATE UNIQUE INDEX "contacts_phone_uq" ON "contacts" USING btree ("phone") WHERE deleted_at is null and phone is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "contacts_email_uq" ON "contacts" USING btree ("email") WHERE deleted_at is null and email is not null;--> statement-breakpoint
CREATE INDEX "contacts_lead_idx" ON "contacts" USING btree ("lead_id");--> statement-breakpoint
CREATE INDEX "contacts_created_idx" ON "contacts" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "contact_members_list_idx" ON "contact_list_members" USING btree ("list_id");--> statement-breakpoint

-- Three new permissions, granted to the roles that should have them from the
-- start. Everything is an ordinary editable grant afterwards.
INSERT INTO permissions (code, label, category, description) VALUES
  ('contact.read', 'View the contact database', 'Contacts',
   'See the contact database and its lists. Phone numbers are masked until revealed, and revealing one is audited.'),
  ('contact.manage', 'Manage contacts', 'Contacts',
   'Add, edit, import and remove contacts, and create or archive lists.'),
  ('contact.promote', 'Move contacts into leads', 'Contacts',
   'Turn a contact into a lead, or merge it with the lead it already is. The lead then goes through the normal assignment rules.')
ON CONFLICT (code) DO NOTHING;--> statement-breakpoint

INSERT INTO role_permissions (role_id, permission_code, scope)
SELECT r.id, p.code, 'all'
FROM roles r
CROSS JOIN (VALUES ('contact.read'), ('contact.manage'), ('contact.promote')) AS p(code)
WHERE r.code IN ('admin', 'co_admin')
ON CONFLICT (role_id, permission_code) DO NOTHING;--> statement-breakpoint

INSERT INTO role_permissions (role_id, permission_code, scope)
SELECT r.id, p.code, CASE r.code WHEN 'center_head' THEN 'center'::permission_scope ELSE 'own'::permission_scope END
FROM roles r
CROSS JOIN (VALUES ('contact.read')) AS p(code)
WHERE r.code IN ('counsellor', 'center_head')
ON CONFLICT (role_id, permission_code) DO NOTHING;--> statement-breakpoint

INSERT INTO role_permissions (role_id, permission_code, scope)
SELECT r.id, 'contact.promote', 'center'::permission_scope
FROM roles r
WHERE r.code = 'center_head'
ON CONFLICT (role_id, permission_code) DO NOTHING;--> statement-breakpoint

-- Reading is open to anyone holding contact.read at any scope (the database is
-- institute-wide), writing to contact.manage. No delete policy: a contact is
-- removed with `deleted_at`, never erased.
ALTER TABLE "contact_lists" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "contacts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "contact_list_members" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

CREATE POLICY contact_lists_select ON "contact_lists" FOR SELECT TO authenticated
  USING (private.auth_scope('contact.read') IS NOT NULL);--> statement-breakpoint
CREATE POLICY contact_lists_insert ON "contact_lists" FOR INSERT TO authenticated
  WITH CHECK (private.auth_scope('contact.manage') IS NOT NULL);--> statement-breakpoint
CREATE POLICY contact_lists_update ON "contact_lists" FOR UPDATE TO authenticated
  USING (private.auth_scope('contact.manage') IS NOT NULL)
  WITH CHECK (private.auth_scope('contact.manage') IS NOT NULL);--> statement-breakpoint

CREATE POLICY contacts_select ON "contacts" FOR SELECT TO authenticated
  USING (deleted_at IS NULL AND private.auth_scope('contact.read') IS NOT NULL);--> statement-breakpoint
CREATE POLICY contacts_insert ON "contacts" FOR INSERT TO authenticated
  WITH CHECK (private.auth_scope('contact.manage') IS NOT NULL);--> statement-breakpoint
CREATE POLICY contacts_update ON "contacts" FOR UPDATE TO authenticated
  USING (private.auth_scope('contact.manage') IS NOT NULL)
  WITH CHECK (private.auth_scope('contact.manage') IS NOT NULL);--> statement-breakpoint

CREATE POLICY contact_members_select ON "contact_list_members" FOR SELECT TO authenticated
  USING (private.auth_scope('contact.read') IS NOT NULL);--> statement-breakpoint
CREATE POLICY contact_members_insert ON "contact_list_members" FOR INSERT TO authenticated
  WITH CHECK (private.auth_scope('contact.manage') IS NOT NULL);--> statement-breakpoint
CREATE POLICY contact_members_delete ON "contact_list_members" FOR DELETE TO authenticated
  USING (private.auth_scope('contact.manage') IS NOT NULL);
