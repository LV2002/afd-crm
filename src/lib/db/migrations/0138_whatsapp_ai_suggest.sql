-- Optional AI-drafted replies in the WhatsApp inbox. Off until an admin turns it on:
-- switching it on sends the recent messages of a conversation to Google's Gemini API.
ALTER TABLE "whatsapp_chat_rules" ADD COLUMN "ai_suggest_enabled" boolean DEFAULT false NOT NULL;
