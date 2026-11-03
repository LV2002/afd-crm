-- Reporting what became of each website enquiry back to the marketing sheet.
--
-- `leads.submission_id` is the id the website gave the enquiry; every outcome
-- names it. `outcome_events` is the outbox: one row per status change
-- (`temperature_history`), sent in signed batches by a scheduled job and kept
-- so a failure is visible and nothing is sent twice from this side.
ALTER TABLE "leads" ADD COLUMN "submission_id" text;--> statement-breakpoint
CREATE INDEX "leads_submission_id_idx" ON "leads" USING btree ("submission_id") WHERE submission_id is not null;--> statement-breakpoint

-- Leads that came in through the website before this existed: take the id
-- from their earliest website enquiry, when it is one the sheet could have
-- issued (letters, digits, _ and -, up to 80). Nothing is sent for their past
-- changes beyond the sweep's lookback window; this only lets future ones report.
UPDATE "leads" l
SET "submission_id" = e.dedupe_key
FROM (
  SELECT DISTINCT ON (lead_id) lead_id, dedupe_key
  FROM "enquiries"
  WHERE lower(source) = 'website' AND dedupe_key ~ '^[A-Za-z0-9_-]{1,80}$'
  ORDER BY lead_id, received_at
) e
WHERE e.lead_id = l.id AND l.submission_id IS NULL;--> statement-breakpoint

CREATE TABLE "outcome_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"history_id" uuid NOT NULL,
	"lead_id" uuid NOT NULL,
	"submission_id" text NOT NULL,
	"status" text NOT NULL,
	"event_at" timestamp with time zone NOT NULL,
	"revenue_inr" integer,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"skipped_reason" text
);--> statement-breakpoint
ALTER TABLE "outcome_events" ADD CONSTRAINT "outcome_events_history_id_temperature_history_id_fk" FOREIGN KEY ("history_id") REFERENCES "public"."temperature_history"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outcome_events" ADD CONSTRAINT "outcome_events_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "outcome_events_history_uq" ON "outcome_events" USING btree ("history_id");--> statement-breakpoint
CREATE INDEX "outcome_events_pending_idx" ON "outcome_events" USING btree ("event_at") WHERE sent_at is null and skipped_reason is null;--> statement-breakpoint
CREATE INDEX "outcome_events_lead_idx" ON "outcome_events" USING btree ("lead_id");--> statement-breakpoint

-- Written and read only by the scheduled job on the direct connection. No
-- policy for any browser role, like integration_credentials: the outbox is
-- plumbing, and a counsellor has no business reading it.
ALTER TABLE "outcome_events" ENABLE ROW LEVEL SECURITY;
