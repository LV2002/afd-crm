-- Chat rules: how long a conversation may wait for a reply, and whether a
-- chat on a lead nobody owns is handed to the assignment rules.
CREATE TABLE "whatsapp_chat_rules" (
  "id" text PRIMARY KEY DEFAULT 'default' NOT NULL,
  "alert_enabled" boolean DEFAULT false NOT NULL,
  "alert_minutes" integer DEFAULT 30 NOT NULL,
  "escalate_minutes" integer DEFAULT 120 NOT NULL,
  "auto_assign_unowned" boolean DEFAULT false NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid REFERENCES "profiles"("id") ON DELETE set null,
  CONSTRAINT "whatsapp_chat_rules_singleton" CHECK (id = 'default'),
  CONSTRAINT "whatsapp_chat_rules_minutes" CHECK (alert_minutes > 0 AND escalate_minutes >= alert_minutes)
);
--> statement-breakpoint
INSERT INTO "whatsapp_chat_rules" ("id") VALUES ('default');
--> statement-breakpoint
CREATE TABLE "whatsapp_reply_alerts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "lead_id" uuid NOT NULL REFERENCES "leads"("id") ON DELETE cascade,
  "inbound_at" timestamp with time zone NOT NULL,
  "level" integer NOT NULL,
  "sent_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "whatsapp_reply_alerts_uq" ON "whatsapp_reply_alerts" USING btree ("lead_id","inbound_at","level");
--> statement-breakpoint
ALTER TABLE "whatsapp_chat_rules" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "whatsapp_reply_alerts" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "whatsapp_chat_rules_select" ON "whatsapp_chat_rules" FOR SELECT TO authenticated USING (private.auth_scope('whatsapp.read') is not null);
