CREATE TABLE "enrolment_instalments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"enrolment_id" uuid NOT NULL,
	"sequence" integer NOT NULL,
	"due_date" date NOT NULL,
	"amount_paise" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone,
	CONSTRAINT "enrolment_instalments_sequence_positive" CHECK (sequence >= 1),
	CONSTRAINT "enrolment_instalments_amount_positive" CHECK (amount_paise > 0)
);
--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "profile_form_token" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "profile_form_sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "profile_form_submitted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "profile_form_data" jsonb;--> statement-breakpoint
ALTER TABLE "enrolments" ADD COLUMN "discount_name" text;--> statement-breakpoint
ALTER TABLE "enrolments" ADD COLUMN "fee_notes" text;--> statement-breakpoint
ALTER TABLE "enrolment_instalments" ADD CONSTRAINT "enrolment_instalments_enrolment_id_enrolments_id_fk" FOREIGN KEY ("enrolment_id") REFERENCES "public"."enrolments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "enrolment_instalments_enrolment_idx" ON "enrolment_instalments" USING btree ("enrolment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "enrolment_instalments_seq_uq" ON "enrolment_instalments" USING btree ("enrolment_id","sequence");--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_profile_form_token_unique" UNIQUE("profile_form_token");