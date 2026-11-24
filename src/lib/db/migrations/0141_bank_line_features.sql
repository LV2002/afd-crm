ALTER TYPE "public"."finance_account_type" ADD VALUE 'director';--> statement-breakpoint
ALTER TYPE "public"."finance_account_type" ADD VALUE 'gateway';--> statement-breakpoint
CREATE TABLE "finance_account_centers" (
	"account_id" uuid NOT NULL,
	"center_id" uuid NOT NULL,
	CONSTRAINT "finance_account_centers_account_id_center_id_pk" PRIMARY KEY("account_id","center_id")
);
--> statement-breakpoint
CREATE TABLE "finance_transaction_comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"transaction_id" uuid NOT NULL,
	"body" text NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"edited_by" uuid,
	"edited_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "finance_account_centers" ADD CONSTRAINT "finance_account_centers_account_id_finance_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."finance_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_account_centers" ADD CONSTRAINT "finance_account_centers_center_id_centers_id_fk" FOREIGN KEY ("center_id") REFERENCES "public"."centers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_transaction_comments" ADD CONSTRAINT "finance_transaction_comments_transaction_id_finance_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."finance_transactions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_transaction_comments" ADD CONSTRAINT "finance_transaction_comments_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_transaction_comments" ADD CONSTRAINT "finance_transaction_comments_edited_by_profiles_id_fk" FOREIGN KEY ("edited_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "finance_account_centers_center_idx" ON "finance_account_centers" USING btree ("center_id");--> statement-breakpoint
CREATE INDEX "finance_txn_comments_txn_idx" ON "finance_transaction_comments" USING btree ("transaction_id","created_at");--> statement-breakpoint

-- Who can see the extra centres an account serves, and the notes on a transaction.
-- Writes to both go through server actions on the direct connection (as the
-- rest of the ledger does), so there is no insert/update policy for browsers.
ALTER TABLE "finance_account_centers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY finance_account_centers_select ON "finance_account_centers" FOR SELECT TO authenticated
  USING (private.can_access_center('finance.read', center_id, null));--> statement-breakpoint

ALTER TABLE "finance_transaction_comments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY finance_txn_comments_select ON "finance_transaction_comments" FOR SELECT TO authenticated
  USING (exists (
    select 1 from finance_transactions t
    where t.id = finance_transaction_comments.transaction_id
      and private.can_access_center('finance.read', t.center_id, null)
  ));--> statement-breakpoint

-- An account serving several centres is visible to the people of any of them.
DROP POLICY finance_accounts_select ON "finance_accounts";--> statement-breakpoint
CREATE POLICY finance_accounts_select ON "finance_accounts" FOR SELECT TO authenticated
  USING (
    deleted_at is null
    and (
      private.can_access_center('finance.read', center_id, null)
      or exists (
        select 1 from finance_account_centers x
        where x.account_id = finance_accounts.id
          and private.can_access_center('finance.read', x.center_id, null)
      )
    )
  );--> statement-breakpoint

-- Category settings (what a bank line is asked when filed under them).
INSERT INTO "dropdown_options" ("category", "value", "label", "sort_order", "metadata")
SELECT v.category, v.value, v.label, v.sort_order, v.metadata
FROM (VALUES
  ('finance_expense_category', 'student_refund', 'Student Refund', 101, '{"links":"refund"}'::jsonb),
  ('finance_expense_category', 'gateway_fees', 'Payment Gateway Charges', 102, '{"asksPeriod":true}'::jsonb),
  ('finance_expense_category', 'loans_emi', 'Loans & EMIs', 103, '{"asksPeriod":true}'::jsonb)
) AS v(category, value, label, sort_order, metadata)
-- A brand-new database has no categories yet: the seed creates them, with these settings.
WHERE EXISTS (SELECT 1 FROM "dropdown_categories" c WHERE c."key" = v.category)
ON CONFLICT ("category", "value") DO NOTHING;
