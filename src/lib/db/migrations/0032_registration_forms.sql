CREATE TABLE "registration_forms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"token" text NOT NULL,
	"source" text DEFAULT 'Registration Form' NOT NULL,
	"center_id" uuid,
	"field_keys" text[] NOT NULL,
	"intro_text" text,
	"success_message" text,
	"expires_at" timestamp with time zone,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "registration_forms_token_unique" UNIQUE("token")
);
--> statement-breakpoint
ALTER TABLE "registration_forms" ADD CONSTRAINT "registration_forms_center_id_centers_id_fk" FOREIGN KEY ("center_id") REFERENCES "public"."centers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registration_forms" ADD CONSTRAINT "registration_forms_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "registration_forms_token_idx" ON "registration_forms" USING btree ("token");