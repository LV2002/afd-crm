CREATE TYPE "public"."config_snapshot_kind" AS ENUM('export', 'import');--> statement-breakpoint
CREATE TABLE "config_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"kind" "config_snapshot_kind" NOT NULL,
	"version" text NOT NULL,
	"payload" jsonb NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "config_snapshots" ADD CONSTRAINT "config_snapshots_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;