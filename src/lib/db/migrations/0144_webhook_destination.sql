-- Where a custom webhook's deliveries go: into the lead pipeline (every
-- endpoint so far) or onto a database list. 'lead' stays the default so no
-- existing endpoint changes behaviour.
ALTER TABLE "custom_webhooks" ADD COLUMN IF NOT EXISTS "destination" text NOT NULL DEFAULT 'lead';
ALTER TABLE "custom_webhooks" ADD COLUMN IF NOT EXISTS "contact_list_id" uuid REFERENCES "contact_lists"("id") ON DELETE SET NULL;
ALTER TABLE "custom_webhooks" DROP CONSTRAINT IF EXISTS "custom_webhooks_destination_ck";
ALTER TABLE "custom_webhooks" ADD CONSTRAINT "custom_webhooks_destination_ck"
  CHECK ("destination" IN ('lead', 'contact_list') AND ("destination" <> 'contact_list' OR "contact_list_id" IS NOT NULL));
