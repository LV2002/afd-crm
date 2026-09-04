ALTER TABLE "enrolments" ADD COLUMN "dropped_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "enrolments" ADD COLUMN "dropped_by" uuid;--> statement-breakpoint
ALTER TABLE "enrolments" ADD COLUMN "drop_reason" text;--> statement-breakpoint
ALTER TABLE "enrolments" ADD CONSTRAINT "enrolments_dropped_by_profiles_id_fk" FOREIGN KEY ("dropped_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;