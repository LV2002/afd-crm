CREATE TABLE "whatsapp_suppressions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"phone" text NOT NULL,
	"reason" text,
	"source" text DEFAULT 'keyword' NOT NULL,
	"created_by" uuid,
	"released_at" timestamp with time zone,
	"released_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "whatsapp_suppressions" ADD CONSTRAINT "whatsapp_suppressions_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_suppressions" ADD CONSTRAINT "whatsapp_suppressions_released_by_profiles_id_fk" FOREIGN KEY ("released_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "whatsapp_suppressions_phone_live_uq" ON "whatsapp_suppressions" USING btree ("phone") WHERE released_at is null;--> statement-breakpoint
CREATE INDEX "whatsapp_suppressions_phone_idx" ON "whatsapp_suppressions" USING btree ("phone");