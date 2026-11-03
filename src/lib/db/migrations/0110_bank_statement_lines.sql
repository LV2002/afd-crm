-- A worklist of bank-statement lines waiting to be categorised.
--
-- The statement file is parsed in memory and discarded; only each
-- transaction's date, narration, direction and amount are kept here, so the
-- accountant can say what each one was and so a line that appears in a later,
-- overlapping upload is recognised instead of added twice. Categorising a
-- line appends to the (append-only) finance ledger and links back here.
CREATE TYPE "public"."bank_line_status" AS ENUM('pending', 'posted', 'skipped');--> statement-breakpoint
CREATE TABLE "bank_statement_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"center_id" uuid NOT NULL,
	"occurred_on" date NOT NULL,
	"particulars" text NOT NULL,
	"direction" text NOT NULL,
	"amount_paise" bigint NOT NULL,
	"balance_paise" bigint,
	"note" text,
	"date_guessed" boolean DEFAULT false NOT NULL,
	"fingerprint" text NOT NULL,
	"status" "bank_line_status" DEFAULT 'pending' NOT NULL,
	"transaction_id" uuid,
	"skip_reason" text,
	"imported_by" uuid,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_by" uuid,
	"resolved_at" timestamp with time zone,
	CONSTRAINT "bank_lines_direction" CHECK (direction in ('in', 'out')),
	CONSTRAINT "bank_lines_amount_positive" CHECK (amount_paise > 0)
);--> statement-breakpoint
ALTER TABLE "bank_statement_lines" ADD CONSTRAINT "bank_statement_lines_account_id_finance_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."finance_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_statement_lines" ADD CONSTRAINT "bank_statement_lines_center_id_centers_id_fk" FOREIGN KEY ("center_id") REFERENCES "public"."centers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_statement_lines" ADD CONSTRAINT "bank_statement_lines_transaction_id_finance_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."finance_transactions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_statement_lines" ADD CONSTRAINT "bank_statement_lines_imported_by_profiles_id_fk" FOREIGN KEY ("imported_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_statement_lines" ADD CONSTRAINT "bank_statement_lines_resolved_by_profiles_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "bank_lines_fingerprint_uq" ON "bank_statement_lines" USING btree ("account_id","fingerprint");--> statement-breakpoint
CREATE INDEX "bank_lines_status_idx" ON "bank_statement_lines" USING btree ("account_id","status","occurred_on");--> statement-breakpoint
CREATE INDEX "bank_lines_center_idx" ON "bank_statement_lines" USING btree ("center_id","status");--> statement-breakpoint
CREATE INDEX "bank_lines_txn_idx" ON "bank_statement_lines" USING btree ("transaction_id");--> statement-breakpoint

-- Same centre rule as the ledger it feeds. A role granted finance at `own`
-- scope matches nothing, because money has no owner the way a lead does.
ALTER TABLE "bank_statement_lines" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY bank_lines_select ON "bank_statement_lines" FOR SELECT TO authenticated
  USING (private.can_access_center('finance.read', center_id, null));--> statement-breakpoint
CREATE POLICY bank_lines_insert ON "bank_statement_lines" FOR INSERT TO authenticated
  WITH CHECK (private.can_access_center('finance.record', center_id, null));--> statement-breakpoint
CREATE POLICY bank_lines_update ON "bank_statement_lines" FOR UPDATE TO authenticated
  USING (private.can_access_center('finance.record', center_id, null))
  WITH CHECK (private.can_access_center('finance.record', center_id, null));
-- No delete policy: a line is resolved, never removed.
