-- A WhatsApp "system" notice (a contact changed their number, a security code
-- changed) is stored as its own kind so the inbox can show it as a notice in
-- the middle of the chat instead of a bubble reading "[system message]".
ALTER TYPE "public"."whatsapp_message_type" ADD VALUE IF NOT EXISTS 'system';
