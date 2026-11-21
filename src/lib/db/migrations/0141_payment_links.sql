-- Payment links sent over WhatsApp (Razorpay). A link is a request for money, not a
-- payment: nothing here touches the ledger. When Razorpay says it was paid the row
-- is marked and accounts is told; the payment itself is recorded the normal way.
ALTER TYPE "integration_provider" ADD VALUE IF NOT EXISTS 'razorpay';
--> statement-breakpoint
ALTER TYPE "webhook_source" ADD VALUE IF NOT EXISTS 'razorpay';
--> statement-breakpoint
CREATE TABLE "whatsapp_payment_links" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "lead_id" uuid NOT NULL REFERENCES "leads"("id") ON DELETE cascade,
  "amount_paise" bigint NOT NULL,
  "description" text NOT NULL,
  "razorpay_link_id" text,
  "short_url" text,
  "status" text DEFAULT 'created' NOT NULL,
  "razorpay_payment_id" text,
  "paid_at" timestamp with time zone,
  "created_by" uuid REFERENCES "profiles"("id") ON DELETE set null,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone,
  CONSTRAINT "whatsapp_payment_links_status_check" CHECK (status in ('created','paid','expired','cancelled','failed')),
  CONSTRAINT "whatsapp_payment_links_amount_check" CHECK (amount_paise > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "whatsapp_payment_links_razorpay_link_id_uq" ON "whatsapp_payment_links" USING btree ("razorpay_link_id") WHERE razorpay_link_id is not null;
--> statement-breakpoint
CREATE INDEX "whatsapp_payment_links_lead_id_idx" ON "whatsapp_payment_links" USING btree ("lead_id");
--> statement-breakpoint
ALTER TABLE "whatsapp_payment_links" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "whatsapp_payment_links_select" ON "whatsapp_payment_links" FOR SELECT TO authenticated USING (
  private.auth_scope('payment.read') is not null
  and exists (select 1 from leads l where l.id = lead_id)
);
