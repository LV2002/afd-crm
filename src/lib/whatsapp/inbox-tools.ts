import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { unstable_cache } from "next/cache";

import { getIntegrationCredentials } from "@/lib/integrations/credentials";
import { listMessageTemplates } from "@/lib/integrations/whatsapp/templates";

import { sendableTemplates, type SendableTemplate } from "./template-preview";

export interface SavedReply {
  id: string;
  title: string;
  shortcut: string | null;
  body: string;
}
export interface InboxLabel {
  id: string;
  name: string;
  colour: string;
}
export interface InboxNote {
  id: string;
  body: string;
  createdAt: string;
  authorName: string | null;
}

export async function loadSavedReplies(supabase: SupabaseClient): Promise<SavedReply[]> {
  const { data } = await supabase
    .from("whatsapp_saved_replies")
    .select("id, title, shortcut, body")
    .is("deleted_at", null)
    .order("sort_order")
    .order("title")
    .returns<SavedReply[]>();
  return data ?? [];
}

export async function loadLabels(supabase: SupabaseClient): Promise<InboxLabel[]> {
  const { data } = await supabase
    .from("whatsapp_labels")
    .select("id, name, colour")
    .is("deleted_at", null)
    .order("sort_order")
    .order("name")
    .returns<InboxLabel[]>();
  return data ?? [];
}

/** What staff have recorded against one conversation. */
export async function loadConversationExtras(
  supabase: SupabaseClient,
  phone: string,
): Promise<{ labelIds: string[]; resolved: boolean; notes: InboxNote[] }> {
  const [{ data: state }, { data: labels }, { data: notes }] = await Promise.all([
    supabase.from("whatsapp_conversations").select("status, resolved_at").eq("phone", phone).maybeSingle<{ status: string; resolved_at: string | null }>(),
    supabase.from("whatsapp_conversation_labels").select("label_id").eq("phone", phone).returns<Array<{ label_id: string }>>(),
    supabase
      .from("whatsapp_notes")
      .select("id, body, created_at, created_by")
      .eq("phone", phone)
      .order("created_at", { ascending: true })
      .returns<Array<{ id: string; body: string; created_at: string; created_by: string | null }>>(),
  ]);
  // Names come from `profiles`, which only some roles may read: a missing name shows as "Staff".
  const authorIds = [...new Set((notes ?? []).map((n) => n.created_by).filter((v): v is string => !!v))];
  const names = new Map<string, string>();
  if (authorIds.length > 0) {
    const { data: people } = await supabase.from("profiles").select("id, full_name").in("id", authorIds).returns<Array<{ id: string; full_name: string }>>();
    for (const p of people ?? []) names.set(p.id, p.full_name);
  }
  return {
    labelIds: (labels ?? []).map((l) => l.label_id),
    resolved: state?.status === "resolved",
    notes: (notes ?? []).map((n) => ({ id: n.id, body: n.body, createdAt: n.created_at, authorName: n.created_by ? (names.get(n.created_by) ?? null) : null })),
  };
}

const cachedTemplates = unstable_cache(
  async (wabaId: string, accessToken: string): Promise<SendableTemplate[]> => sendableTemplates(await listMessageTemplates(wabaId, accessToken)),
  ["whatsapp-sendable-templates"],
  { revalidate: 120, tags: ["whatsapp-templates"] },
);

/**
 * The approved templates somebody can pick from in a conversation. Read from
 * Meta, cached for two minutes (the picker is on every chat), and empty when
 * WhatsApp is not connected or Meta cannot be reached.
 */
export async function loadSendableTemplates(): Promise<SendableTemplate[]> {
  try {
    const { access_token: accessToken, waba_id: wabaId } = await getIntegrationCredentials("whatsapp", ["access_token", "waba_id"]);
    if (!accessToken || !wabaId) return [];
    return await cachedTemplates(wabaId, accessToken);
  } catch {
    return [];
  }
}
