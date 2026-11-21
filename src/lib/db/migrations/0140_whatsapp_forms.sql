-- Native WhatsApp forms (Meta "Flows"): the fields an admin picked, and the id
-- Meta gave the published form. The form's JSON is generated from the fields,
-- never hand-written.
CREATE TABLE "whatsapp_forms" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" text NOT NULL,
  "intro_text" text NOT NULL,
  "button_label" text DEFAULT 'Fill the form' NOT NULL,
  "fields" text[] NOT NULL,
  "meta_flow_id" text,
  "status" text DEFAULT 'draft' NOT NULL,
  "last_error" text,
  "created_by" uuid REFERENCES "profiles"("id") ON DELETE set null,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone,
  "deleted_at" timestamp with time zone,
  CONSTRAINT "whatsapp_forms_status_check" CHECK (status in ('draft','published','error'))
);
--> statement-breakpoint
ALTER TABLE "whatsapp_forms" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "whatsapp_forms_select" ON "whatsapp_forms" FOR SELECT TO authenticated USING (deleted_at is null and private.auth_scope('whatsapp.read') is not null);
