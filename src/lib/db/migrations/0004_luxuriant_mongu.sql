CREATE TYPE "public"."identifier_kind" AS ENUM('phone', 'email');--> statement-breakpoint
CREATE TYPE "public"."merge_review_status" AS ENUM('pending', 'confirmed', 'rejected');--> statement-breakpoint
CREATE TABLE "enquiries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" uuid NOT NULL,
	"source" text NOT NULL,
	"sub_source" text,
	"campaign_id" text,
	"adset_id" text,
	"ad_id" text,
	"utm" jsonb,
	"gclid" text,
	"fbclid" text,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"raw" jsonb,
	"dedupe_key" text,
	"was_duplicate" boolean DEFAULT false NOT NULL,
	"ingest_batch_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "lead_identifiers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" uuid NOT NULL,
	"kind" "identifier_kind" NOT NULL,
	"value_normalised" text NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "lead_merges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"survivor_lead_id" uuid NOT NULL,
	"merged_lead_id" uuid NOT NULL,
	"merged_by" uuid,
	"reason" text,
	"snapshot" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "leads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_number" bigserial NOT NULL,
	"student_name" text NOT NULL,
	"father_name" text,
	"mother_name" text,
	"primary_phone" text NOT NULL,
	"alternate_phone" text,
	"parent_phone" text,
	"email" text,
	"dob" date,
	"gender" text,
	"address_line" text,
	"city" text,
	"district" text,
	"state" text,
	"state_other" text,
	"pincode" text,
	"country" text DEFAULT 'India' NOT NULL,
	"education_status" text,
	"school_college" text,
	"board" text,
	"parents_occupation" text,
	"previous_attempts" integer,
	"interested_exams" text[],
	"exam_year" text,
	"courses_interested" text[],
	"preferred_mode" text,
	"first_touch_source" text,
	"first_touch_sub_source" text,
	"first_touch_campaign" text,
	"last_touch_source" text,
	"last_touch_sub_source" text,
	"last_touch_campaign" text,
	"gclid" text,
	"fbclid" text,
	"utm" jsonb,
	"center_id" uuid,
	"assigned_to" uuid,
	"stage_id" uuid,
	"temperature" text,
	"temperature_override_until" timestamp with time zone,
	"temperature_set_by" text,
	"score" integer,
	"is_competitor_student" boolean DEFAULT false NOT NULL,
	"competitor_institute" text,
	"referred_by_lead_id" uuid,
	"brochure_sent" boolean DEFAULT false NOT NULL,
	"first_response_at" timestamp with time zone,
	"last_activity_at" timestamp with time zone,
	"next_followup_at" timestamp with time zone,
	"sla_breached" boolean DEFAULT false NOT NULL,
	"consent_status" text,
	"consent_source" text,
	"consent_at" timestamp with time zone,
	"do_not_contact" boolean DEFAULT false NOT NULL,
	"opted_out_channels" text[],
	"lost_reason" text,
	"lost_reason_detail" text,
	"lost_at" timestamp with time zone,
	"merged_into_lead_id" uuid,
	"custom" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "merge_review_queue" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" uuid NOT NULL,
	"candidate_lead_id" uuid NOT NULL,
	"score" numeric(5, 2),
	"status" "merge_review_status" DEFAULT 'pending' NOT NULL,
	"reviewed_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "stage_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" uuid NOT NULL,
	"from_stage" uuid,
	"to_stage" uuid NOT NULL,
	"changed_by" uuid,
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"duration_in_previous_seconds" integer
);
--> statement-breakpoint
ALTER TABLE "enquiries" ADD CONSTRAINT "enquiries_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_identifiers" ADD CONSTRAINT "lead_identifiers_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_merges" ADD CONSTRAINT "lead_merges_survivor_lead_id_leads_id_fk" FOREIGN KEY ("survivor_lead_id") REFERENCES "public"."leads"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_merges" ADD CONSTRAINT "lead_merges_merged_lead_id_leads_id_fk" FOREIGN KEY ("merged_lead_id") REFERENCES "public"."leads"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_merges" ADD CONSTRAINT "lead_merges_merged_by_profiles_id_fk" FOREIGN KEY ("merged_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_center_id_centers_id_fk" FOREIGN KEY ("center_id") REFERENCES "public"."centers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_assigned_to_profiles_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_stage_id_pipeline_stages_id_fk" FOREIGN KEY ("stage_id") REFERENCES "public"."pipeline_stages"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_referred_by_lead_id_leads_id_fk" FOREIGN KEY ("referred_by_lead_id") REFERENCES "public"."leads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_merged_into_lead_id_leads_id_fk" FOREIGN KEY ("merged_into_lead_id") REFERENCES "public"."leads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merge_review_queue" ADD CONSTRAINT "merge_review_queue_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merge_review_queue" ADD CONSTRAINT "merge_review_queue_candidate_lead_id_leads_id_fk" FOREIGN KEY ("candidate_lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merge_review_queue" ADD CONSTRAINT "merge_review_queue_reviewed_by_profiles_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stage_history" ADD CONSTRAINT "stage_history_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stage_history" ADD CONSTRAINT "stage_history_from_stage_pipeline_stages_id_fk" FOREIGN KEY ("from_stage") REFERENCES "public"."pipeline_stages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stage_history" ADD CONSTRAINT "stage_history_to_stage_pipeline_stages_id_fk" FOREIGN KEY ("to_stage") REFERENCES "public"."pipeline_stages"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stage_history" ADD CONSTRAINT "stage_history_changed_by_profiles_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "lead_identifiers_kind_value_uq" ON "lead_identifiers" USING btree ("kind","value_normalised") WHERE deleted_at is null;--> statement-breakpoint
CREATE UNIQUE INDEX "leads_lead_number_uq" ON "leads" USING btree ("lead_number");