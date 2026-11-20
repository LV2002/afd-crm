"use server";

import { and, eq, isNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { writeAuditLog } from "@/lib/audit/log";
import { can, getCurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import {
  whatsappConversationLabels,
  whatsappConversations,
  whatsappLabels,
  whatsappNotes,
  whatsappSavedReplies,
  type LabelColour,
} from "@/lib/db/schema";
import { createClient } from "@/lib/supabase/server";

export interface InboxToolState {
  error?: string;
  success?: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const COLOURS: readonly LabelColour[] = ["slate", "green", "amber", "blue", "violet", "red"];

/**
 * May this person see this conversation at all? Asked of the database, as the
 * caller, so the same row-level rule that scopes the inbox scopes everything
 * done to a conversation: a counsellor cannot label or note somebody else's.
 */
async function canSeeConversation(phone: string): Promise<boolean> {
  const supabase = await createClient();
  // A number is stored with or without its plus depending on which side wrote it.
  const digits = phone.replace(/\D/g, "");
  if (!digits) return false;
  const forms = `${digits},+${digits}`;
  const { data } = await supabase
    .from("whatsapp_messages")
    .select("id")
    .or(`from_phone.in.(${forms}),to_phone.in.(${forms})`)
    .is("deleted_at", null)
    .limit(1);
  return (data ?? []).length > 0;
}

async function sender() {
  const user = await getCurrentUser();
  return user && can(user, "whatsapp.send") ? user : null;
}

export async function setConversationResolved(phone: string, resolved: boolean): Promise<InboxToolState> {
  const user = await sender();
  if (!user) return { error: "You don't have permission to do that." };
  if (!(await canSeeConversation(phone))) return { error: "That conversation is outside your access." };
  await db
    .insert(whatsappConversations)
    .values({ phone, status: resolved ? "resolved" : "open", resolvedAt: resolved ? new Date() : null, resolvedBy: resolved ? user.id : null })
    .onConflictDoUpdate({
      target: whatsappConversations.phone,
      set: { status: resolved ? "resolved" : "open", resolvedAt: resolved ? new Date() : null, resolvedBy: resolved ? user.id : null, updatedAt: new Date() },
    });
  await writeAuditLog(await createClient(), { actorId: user.id, action: resolved ? "whatsapp.conversation_resolve" : "whatsapp.conversation_reopen", entityType: "whatsapp_conversations", after: { phone } });
  revalidatePath("/whatsapp");
  return {};
}

export async function toggleConversationLabel(phone: string, labelId: string): Promise<InboxToolState> {
  const user = await sender();
  if (!user) return { error: "You don't have permission to do that." };
  if (!UUID.test(labelId)) return { error: "That label does not exist." };
  if (!(await canSeeConversation(phone))) return { error: "That conversation is outside your access." };
  const [existing] = await db
    .select({ phone: whatsappConversationLabels.phone })
    .from(whatsappConversationLabels)
    .where(and(eq(whatsappConversationLabels.phone, phone), eq(whatsappConversationLabels.labelId, labelId)));
  if (existing) {
    await db.delete(whatsappConversationLabels).where(and(eq(whatsappConversationLabels.phone, phone), eq(whatsappConversationLabels.labelId, labelId)));
  } else {
    await db.insert(whatsappConversationLabels).values({ phone, labelId, addedBy: user.id }).onConflictDoNothing();
  }
  revalidatePath("/whatsapp");
  return {};
}

export async function addConversationNote(phone: string, leadId: string | null, body: string): Promise<InboxToolState> {
  const user = await sender();
  if (!user) return { error: "You don't have permission to do that." };
  const text = body.trim();
  if (!text) return { error: "Write the note first." };
  if (text.length > 2000) return { error: "Keep a note under 2,000 characters." };
  if (!(await canSeeConversation(phone))) return { error: "That conversation is outside your access." };
  await db.insert(whatsappNotes).values({ phone, leadId: leadId && UUID.test(leadId) ? leadId : null, body: text, createdBy: user.id });
  revalidatePath("/whatsapp");
  return { success: "Note saved. Only staff can see it." };
}

// ── Saved replies and labels: set up by whoever runs WhatsApp campaigns ──────

async function manager() {
  const user = await getCurrentUser();
  return user && can(user, "whatsapp.campaign") ? user : null;
}

export async function saveSavedReply(_prev: InboxToolState, formData: FormData): Promise<InboxToolState> {
  const user = await manager();
  if (!user) return { error: "You don't have permission to do that." };
  const title = String(formData.get("title") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  const shortcutRaw = String(formData.get("shortcut") ?? "").trim().replace(/^\//, "").toLowerCase();
  if (!title) return { error: "Give the reply a title." };
  if (!body) return { error: "Write the message." };
  if (body.length > 4000) return { error: "Keep it under 4,000 characters." };
  if (shortcutRaw && !/^[a-z0-9_-]{1,30}$/.test(shortcutRaw)) return { error: "A shortcut is letters, numbers, - or _, up to 30 characters." };
  const shortcut = shortcutRaw || null;
  const id = String(formData.get("id") ?? "");
  try {
    if (id && UUID.test(id)) {
      await db.update(whatsappSavedReplies).set({ title, body, shortcut, updatedAt: new Date() }).where(eq(whatsappSavedReplies.id, id));
    } else {
      await db.insert(whatsappSavedReplies).values({ title, body, shortcut, createdBy: user.id });
    }
  } catch {
    return { error: `Another saved reply already uses /${shortcut}.` };
  }
  revalidatePath("/whatsapp/replies");
  revalidatePath("/whatsapp");
  return { success: id ? "Saved." : "Added." };
}

export async function deleteSavedReply(id: string): Promise<InboxToolState> {
  const user = await manager();
  if (!user) return { error: "You don't have permission to do that." };
  if (!UUID.test(id)) return { error: "That reply does not exist." };
  await db.update(whatsappSavedReplies).set({ deletedAt: new Date() }).where(eq(whatsappSavedReplies.id, id));
  revalidatePath("/whatsapp/replies");
  revalidatePath("/whatsapp");
  return {};
}

export async function saveLabel(_prev: InboxToolState, formData: FormData): Promise<InboxToolState> {
  const user = await manager();
  if (!user) return { error: "You don't have permission to do that." };
  const name = String(formData.get("name") ?? "").trim();
  const colour = String(formData.get("colour") ?? "slate") as LabelColour;
  if (!name) return { error: "Name the label." };
  if (name.length > 30) return { error: "Keep a label under 30 characters." };
  if (!COLOURS.includes(colour)) return { error: "Pick a colour." };
  const id = String(formData.get("id") ?? "");
  try {
    if (id && UUID.test(id)) {
      await db.update(whatsappLabels).set({ name, colour }).where(eq(whatsappLabels.id, id));
    } else {
      const [{ next }] = await db.select({ next: sql<number>`coalesce(max(sort_order), -1) + 1` }).from(whatsappLabels).where(isNull(whatsappLabels.deletedAt));
      await db.insert(whatsappLabels).values({ name, colour, sortOrder: Number(next) });
    }
  } catch {
    return { error: `There is already a label called ${name}.` };
  }
  revalidatePath("/whatsapp/replies");
  revalidatePath("/whatsapp");
  return { success: id ? "Saved." : "Added." };
}

export async function deleteLabel(id: string): Promise<InboxToolState> {
  const user = await manager();
  if (!user) return { error: "You don't have permission to do that." };
  if (!UUID.test(id)) return { error: "That label does not exist." };
  await db.update(whatsappLabels).set({ deletedAt: new Date() }).where(eq(whatsappLabels.id, id));
  revalidatePath("/whatsapp/replies");
  revalidatePath("/whatsapp");
  return {};
}
