CREATE TYPE "public"."integration_provider" AS ENUM('meta', 'google', 'whatsapp', 'telephony');--> statement-breakpoint
CREATE TYPE "public"."webhook_source" AS ENUM('meta_leads', 'google_leads', 'whatsapp', 'website', 'knorish');--> statement-breakpoint
CREATE TYPE "public"."webhook_status" AS ENUM('pending', 'done', 'failed');--> statement-breakpoint
CREATE TYPE "public"."ad_platform" AS ENUM('meta', 'google');--> statement-breakpoint
CREATE TABLE "integration_credentials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" "integration_provider" NOT NULL,
	"key" text NOT NULL,
	"value_encrypted" text NOT NULL,
	"scope_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "webhook_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" "webhook_source" NOT NULL,
	"external_id" text NOT NULL,
	"signature_ok" boolean NOT NULL,
	"raw" jsonb NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	"status" "webhook_status" DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text
);
--> statement-breakpoint
CREATE TABLE "ad_spend_daily" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"date" date NOT NULL,
	"platform" "ad_platform" NOT NULL,
	"account_id" text NOT NULL,
	"campaign_id" text NOT NULL,
	"campaign_name" text,
	"adset_id" text,
	"adset_name" text,
	"ad_id" text NOT NULL,
	"ad_name" text,
	"spend_paise" bigint NOT NULL,
	"impressions" integer DEFAULT 0 NOT NULL,
	"clicks" integer DEFAULT 0 NOT NULL,
	"leads_reported" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE UNIQUE INDEX "integration_credentials_org_key_uq" ON "integration_credentials" USING btree ("provider","key") WHERE scope_id is null;--> statement-breakpoint
CREATE UNIQUE INDEX "integration_credentials_scoped_key_uq" ON "integration_credentials" USING btree ("provider","key","scope_id") WHERE scope_id is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "webhook_events_source_external_id_uq" ON "webhook_events" USING btree ("source","external_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ad_spend_daily_date_platform_ad_id_uq" ON "ad_spend_daily" USING btree ("date","platform","ad_id");