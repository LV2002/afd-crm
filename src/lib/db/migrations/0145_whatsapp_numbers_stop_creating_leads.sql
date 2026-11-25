-- Inbound WhatsApp messages no longer create leads on any number; a counsellor
-- converts a chat by hand. The column stays (history) but is now unused.
UPDATE "whatsapp_numbers" SET "creates_leads" = false WHERE "creates_leads" = true;
