CREATE TYPE "public"."whatsapp_audience_entity" AS ENUM('lead', 'student');--> statement-breakpoint
DROP INDEX "whatsapp_broadcast_recipients_broadcast_id_lead_id_uq";--> statement-breakpoint
ALTER TABLE "whatsapp_broadcast_recipients" ALTER COLUMN "lead_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "whatsapp_broadcasts" ALTER COLUMN "tag_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "whatsapp_broadcast_recipients" ADD COLUMN "student_id" uuid;--> statement-breakpoint
ALTER TABLE "whatsapp_broadcasts" ADD COLUMN "audience_entity" "whatsapp_audience_entity" DEFAULT 'lead' NOT NULL;--> statement-breakpoint
ALTER TABLE "whatsapp_broadcasts" ADD COLUMN "audience_filters" jsonb;--> statement-breakpoint
ALTER TABLE "whatsapp_broadcast_recipients" ADD CONSTRAINT "whatsapp_broadcast_recipients_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "whatsapp_broadcast_recipients_broadcast_id_student_id_uq" ON "whatsapp_broadcast_recipients" USING btree ("broadcast_id","student_id") WHERE student_id is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "whatsapp_broadcast_recipients_broadcast_id_lead_id_uq" ON "whatsapp_broadcast_recipients" USING btree ("broadcast_id","lead_id") WHERE lead_id is not null;--> statement-breakpoint
ALTER TABLE "whatsapp_broadcast_recipients" ADD CONSTRAINT "whatsapp_broadcast_recipients_one_subject" CHECK (num_nonnulls(lead_id, student_id) = 1);