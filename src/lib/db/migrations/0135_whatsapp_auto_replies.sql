-- Greeting and away auto-replies for the institute's WhatsApp API number.
-- One row per kind; what they say and when is admin data, not code.
CREATE TABLE "whatsapp_auto_replies" (
  "kind" text PRIMARY KEY NOT NULL,
  "enabled" boolean DEFAULT false NOT NULL,
  "message" text NOT NULL,
  "days" integer[] DEFAULT '{1,2,3,4,5,6}' NOT NULL,
  "opens_at" text DEFAULT '09:00' NOT NULL,
  "closes_at" text DEFAULT '18:00' NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid REFERENCES "profiles"("id") ON DELETE set null,
  CONSTRAINT "whatsapp_auto_replies_kind_check" CHECK (kind in ('greeting','away'))
);
--> statement-breakpoint
CREATE TABLE "whatsapp_auto_reply_log" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "phone" text NOT NULL,
  "kind" text NOT NULL,
  "sent_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "whatsapp_auto_reply_log_phone_kind_idx" ON "whatsapp_auto_reply_log" USING btree ("phone","kind","sent_at");
--> statement-breakpoint
ALTER TABLE "whatsapp_auto_replies" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "whatsapp_auto_reply_log" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "whatsapp_auto_replies_select" ON "whatsapp_auto_replies" FOR SELECT TO authenticated USING (private.auth_scope('whatsapp.read') is not null);
--> statement-breakpoint
INSERT INTO "whatsapp_auto_replies" ("kind","enabled","message") VALUES
  ('greeting', false, 'Hi! Thanks for contacting AFD India. A counsellor will reply shortly.'),
  ('away', false, 'Thanks for your message. Our office is closed right now — we will reply when we open.');
