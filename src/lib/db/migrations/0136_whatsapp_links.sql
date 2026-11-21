-- Tracked short links for WhatsApp messages: /l/<code> counts the click, then redirects.
CREATE TABLE "whatsapp_links" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "url" text NOT NULL,
  "clicks" integer DEFAULT 0 NOT NULL,
  "last_clicked_at" timestamp with time zone,
  "created_by" uuid REFERENCES "profiles"("id") ON DELETE set null,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE UNIQUE INDEX "whatsapp_links_code_uq" ON "whatsapp_links" USING btree ("code");
--> statement-breakpoint
ALTER TABLE "whatsapp_links" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "whatsapp_links_select" ON "whatsapp_links" FOR SELECT TO authenticated USING (deleted_at is null and private.auth_scope('whatsapp.campaign') is not null);
