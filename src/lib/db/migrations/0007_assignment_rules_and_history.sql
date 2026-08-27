CREATE TYPE "public"."assignment_reason" AS ENUM('rule', 'manual', 'round_robin', 'reassign_sla');--> statement-breakpoint
CREATE TABLE "assignment_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" uuid NOT NULL,
	"from_user" uuid,
	"to_user" uuid,
	"from_center" uuid,
	"to_center" uuid,
	"rule_id" uuid,
	"reason" "assignment_reason" NOT NULL,
	"actor_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assignment_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"conditions" jsonb NOT NULL,
	"action" jsonb NOT NULL,
	"applies_on" text[] DEFAULT '{"create"}' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "assignment_history" ADD CONSTRAINT "assignment_history_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignment_history" ADD CONSTRAINT "assignment_history_from_user_profiles_id_fk" FOREIGN KEY ("from_user") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignment_history" ADD CONSTRAINT "assignment_history_to_user_profiles_id_fk" FOREIGN KEY ("to_user") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignment_history" ADD CONSTRAINT "assignment_history_from_center_centers_id_fk" FOREIGN KEY ("from_center") REFERENCES "public"."centers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignment_history" ADD CONSTRAINT "assignment_history_to_center_centers_id_fk" FOREIGN KEY ("to_center") REFERENCES "public"."centers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignment_history" ADD CONSTRAINT "assignment_history_rule_id_assignment_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."assignment_rules"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignment_history" ADD CONSTRAINT "assignment_history_actor_id_profiles_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignment_rules" ADD CONSTRAINT "assignment_rules_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;