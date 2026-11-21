"use server";

import { eq } from "drizzle-orm";

import { can, getCurrentUser } from "@/lib/auth/session";
import { GeminiError, generateWithTools } from "@/lib/ai/gemini";
import { db } from "@/lib/db/client";
import { orgSettings, whatsappChatRules } from "@/lib/db/schema";
import { createClient } from "@/lib/supabase/server";
import { buildContents, buildSystemInstruction, cleanSuggestion, type ChatLine } from "@/lib/whatsapp/ai-suggest";
import { getWhatsAppThread, getWhatsAppThreadByPhone } from "@/lib/whatsapp/get-thread";
import { loadSavedReplies } from "@/lib/whatsapp/inbox-tools";

export interface SuggestState {
  error?: string;
  text?: string;
}

/**
 * A drafted reply for the person to edit and send. Reads the conversation
 * as the caller (RLS), so nobody can draft against a chat they cannot see.
 * Off until an admin switches it on, because it sends the recent messages
 * to Google's Gemini API.
 */
export async function suggestWhatsAppReply(leadId: string | null, phone: string, firstName: string): Promise<SuggestState> {
  const user = await getCurrentUser();
  if (!user || !can(user, "whatsapp.send")) return { error: "You don't have permission to do that." };
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return { error: "AI suggestions aren't set up — GEMINI_API_KEY is missing." };
  const [rules] = await db.select().from(whatsappChatRules).where(eq(whatsappChatRules.id, "default"));
  if (!rules?.aiSuggestEnabled) return { error: "AI suggestions are switched off. An admin can turn them on under WhatsApp → Auto replies & rules." };

  const supabase = await createClient();
  const messages = leadId ? await getWhatsAppThread(supabase, leadId) : await getWhatsAppThreadByPhone(supabase, phone);
  if (messages.length === 0) return { error: "There is nothing to reply to yet." };
  const lines: ChatLine[] = messages.map((m) => ({
    direction: m.direction,
    text: m.body ?? (m.messageType === "media" ? "(sent a file)" : m.templateName ? `(template ${m.templateName})` : ""),
  }));

  const [org] = await db.select({ name: orgSettings.name }).from(orgSettings).limit(1);
  const { data: courseRows } = await supabase
    .from("dropdown_options")
    .select("label")
    .eq("category", "course")
    .eq("is_active", true)
    .is("deleted_at", null)
    .order("sort_order")
    .returns<Array<{ label: string }>>();
  const savedReplies = await loadSavedReplies(supabase);

  try {
    const turn = await generateWithTools({
      apiKey,
      systemInstruction: buildSystemInstruction({
        orgName: org?.name ?? "AFD India",
        courses: (courseRows ?? []).map((c) => c.label),
        savedReplies: savedReplies.map((r) => ({ title: r.title, body: r.body })),
      }),
      contents: buildContents(lines, firstName),
      tools: [],
    });
    const text = cleanSuggestion(turn.text);
    return text ? { text } : { error: "The assistant had nothing to suggest. Write it yourself." };
  } catch (error) {
    return { error: error instanceof GeminiError ? "The AI service is busy or out of quota. Try again in a minute." : "Could not get a suggestion." };
  }
}
