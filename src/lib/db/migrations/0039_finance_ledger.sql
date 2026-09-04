CREATE TYPE "public"."finance_account_type" AS ENUM('bank', 'cash', 'petty_cash');--> statement-breakpoint
CREATE TYPE "public"."finance_direction" AS ENUM('in', 'out', 'transfer_in', 'transfer_out');--> statement-breakpoint
CREATE TYPE "public"."finance_kind" AS ENUM('fee', 'other_income', 'expense', 'transfer');--> statement-breakpoint
CREATE TABLE "finance_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"center_id" uuid NOT NULL,
	"type" "finance_account_type" NOT NULL,
	"opening_balance_paise" bigint DEFAULT 0 NOT NULL,
	"float_paise" bigint,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "finance_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"txn_no" bigserial NOT NULL,
	"occurred_on" date NOT NULL,
	"direction" "finance_direction" NOT NULL,
	"kind" "finance_kind" NOT NULL,
	"account_id" uuid NOT NULL,
	"center_id" uuid NOT NULL,
	"category" text NOT NULL,
	"amount_paise" bigint NOT NULL,
	"description" text NOT NULL,
	"reference" text,
	"payment_id" uuid,
	"enrolment_id" uuid,
	"student_id" uuid,
	"student_name" text,
	"course" text,
	"transfer_group_id" uuid,
	"reverses_transaction_id" uuid,
	"reversal_reason" text,
	"recorded_by" uuid,
	"source" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "finance_txn_amount_nonzero" CHECK (amount_paise <> 0)
);
--> statement-breakpoint
ALTER TABLE "org_settings" ADD COLUMN "gst_rate" numeric(6, 4) DEFAULT '0.18' NOT NULL;--> statement-breakpoint
ALTER TABLE "finance_accounts" ADD CONSTRAINT "finance_accounts_center_id_centers_id_fk" FOREIGN KEY ("center_id") REFERENCES "public"."centers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_transactions" ADD CONSTRAINT "finance_transactions_account_id_finance_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."finance_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_transactions" ADD CONSTRAINT "finance_transactions_center_id_centers_id_fk" FOREIGN KEY ("center_id") REFERENCES "public"."centers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_transactions" ADD CONSTRAINT "finance_transactions_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_transactions" ADD CONSTRAINT "finance_transactions_enrolment_id_enrolments_id_fk" FOREIGN KEY ("enrolment_id") REFERENCES "public"."enrolments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_transactions" ADD CONSTRAINT "finance_transactions_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_transactions" ADD CONSTRAINT "finance_transactions_reverses_transaction_id_finance_transactions_id_fk" FOREIGN KEY ("reverses_transaction_id") REFERENCES "public"."finance_transactions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_transactions" ADD CONSTRAINT "finance_transactions_recorded_by_profiles_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "finance_accounts_name_uq" ON "finance_accounts" USING btree ("name") WHERE deleted_at is null;--> statement-breakpoint
CREATE INDEX "finance_accounts_center_idx" ON "finance_accounts" USING btree ("center_id");--> statement-breakpoint
CREATE INDEX "finance_txn_account_date_idx" ON "finance_transactions" USING btree ("account_id","occurred_on");--> statement-breakpoint
CREATE INDEX "finance_txn_center_date_idx" ON "finance_transactions" USING btree ("center_id","occurred_on");--> statement-breakpoint
CREATE INDEX "finance_txn_kind_date_idx" ON "finance_transactions" USING btree ("kind","occurred_on");--> statement-breakpoint
CREATE UNIQUE INDEX "finance_txn_no_uq" ON "finance_transactions" USING btree ("txn_no");--> statement-breakpoint
CREATE UNIQUE INDEX "finance_txn_reverses_uq" ON "finance_transactions" USING btree ("reverses_transaction_id") WHERE reverses_transaction_id is not null;