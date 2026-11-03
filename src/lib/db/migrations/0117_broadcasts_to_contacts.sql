-- WhatsApp broadcasts to the contact database.
--
-- A broadcast audience can now be "the database": people on chosen lists, who
-- are not leads. The recipient row points at the contact, the broadcast
-- remembers which lists it went to, and exactly one of lead / student /
-- contact is set on each recipient.
ALTER TYPE "public"."whatsapp_audience_entity" ADD VALUE IF NOT EXISTS 'contact';--> statement-breakpoint
ALTER TABLE "whatsapp_broadcasts" ADD COLUMN "audience_list_ids" uuid[];--> statement-breakpoint
ALTER TABLE "whatsapp_broadcast_recipients" ADD COLUMN "contact_id" uuid;--> statement-breakpoint
ALTER TABLE "whatsapp_broadcast_recipients" ADD CONSTRAINT "whatsapp_broadcast_recipients_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_broadcast_recipients" DROP CONSTRAINT "whatsapp_broadcast_recipients_one_subject";--> statement-breakpoint
ALTER TABLE "whatsapp_broadcast_recipients" ADD CONSTRAINT "whatsapp_broadcast_recipients_one_subject" CHECK (num_nonnulls(lead_id, student_id, contact_id) = 1);--> statement-breakpoint
CREATE UNIQUE INDEX "whatsapp_broadcast_recipients_broadcast_id_contact_id_uq" ON "whatsapp_broadcast_recipients" USING btree ("broadcast_id","contact_id") WHERE contact_id is not null;
