-- Finished runs had no index: "has this person ever been through this
-- automation" and the automation page's run list both scanned every run.
CREATE INDEX IF NOT EXISTS "whatsapp_flow_runs_flow_started_idx" ON "whatsapp_flow_runs" ("flow_id", "started_at" DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "whatsapp_flow_runs_flow_contact_idx" ON "whatsapp_flow_runs" ("flow_id", "contact_id");
