"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { writeAuditLog } from "@/lib/audit/log";
import { can, getCurrentUser } from "@/lib/auth/session";
import { reportActionFailure } from "@/lib/errors/action-failure";
import { resolveOrCreateLead } from "@/lib/identity/resolve-or-create-lead";
import { getIntegrationCredentials } from "@/lib/integrations/credentials";
import { sendInstagramMessage } from "@/lib/integrations/instagram/graph-client";
import { isWithinInstagramReplyWindow } from "@/lib/instagram/reply-window";
import { createClient } from "@/lib/supabase/server";

export interface InstagramActionState {
  error?: string;
  success?: string;
}

/**
 * Replying to a DM, and turning one into a lead.
 *
 * Both run on the caller's own RLS-bound client, with one deliberate
 * exception: `resolveOrCreateLead()` runs on the direct db client, as it
 * does from every other caller (CSV import included) — it is the single
 * ingestion path and it writes identifiers and runs the assignment engine
 * in one transaction. The permission decision is made here, before it is
 * called.
 */

const replySchema = z.object({
  conversationId: z.string().uuid(),
  body: z.string().trim().min(1, "Type a message first.").max(1000, "That is too long for a DM."),
});

export async function sendInstagramReply(
  _prevState: InstagramActionState,
  formData: FormData,
): Promise<InstagramActionState> {
  try {
    return await runReply(formData);
  } catch (error) {
    return {
      error: await reportActionFailure("action:sendInstagramReply", error, {
        fallback: "Could not send that message. The problem has been reported.",
        // Meta's own sentence is the useful part of this failure — "outside
        // the allowed window", "requires instagram_manage_messages" — and
        // the person reading it is the one who can act on it.
        revealMessage: true,
      }),
    };
  }
}

async function runReply(formData: FormData): Promise<InstagramActionState> {
  const user = await getCurrentUser();
  if (!user || !can(user, "whatsapp.send")) {
    return { error: "You don't have permission to send messages." };
  }

  const parsed = replySchema.safeParse({
    conversationId: formData.get("conversationId"),
    body: formData.get("body"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const supabase = await createClient();

  // Read through RLS: if the caller cannot see this conversation, this
  // returns nothing and the reply stops here. The policy is the check,
  // not this line.
  const { data: conversation } = await supabase
    .from("instagram_conversations")
    .select("id, ig_user_id, last_inbound_at")
    .eq("id", parsed.data.conversationId)
    .maybeSingle<{ id: string; ig_user_id: string; last_inbound_at: string | null }>();

  if (!conversation) {
    return { error: "That conversation is not available to you." };
  }

  if (!isWithinInstagramReplyWindow(conversation.last_inbound_at)) {
    return {
      error:
        "Instagram only allows a reply within 24 hours of their last message. This one has passed — reply from the Instagram app instead.",
    };
  }

  const { ig_user_id: igAccountId, page_access_token: accessToken } = await getIntegrationCredentials(
    "meta",
    ["ig_user_id", "page_access_token"],
  );

  if (!igAccountId || !accessToken) {
    return {
      error:
        "Instagram is not connected yet — Settings → Integrations → Meta needs the Instagram Account ID and a Page Access Token.",
    };
  }

  /*
    Insert first, send second, then record the outcome — the same
    two-step the WhatsApp send uses, and for the same reason: if the
    message leaves and the process dies before the update, a 'queued' row
    is a true statement about what happened. The reverse order would lose
    the message entirely.
  */
  const { data: inserted, error: insertError } = await supabase
    .from("instagram_messages")
    .insert({
      conversation_id: conversation.id,
      direction: "outbound",
      body: parsed.data.body,
      status: "queued",
      sent_by: user.id,
    })
    .select("id")
    .maybeSingle<{ id: string }>();

  if (insertError || !inserted) {
    return { error: `Could not record the message: ${insertError?.message ?? "no row returned"}` };
  }

  try {
    const { messageId } = await sendInstagramMessage(
      igAccountId,
      accessToken,
      conversation.ig_user_id,
      parsed.data.body,
    );

    await supabase
      .from("instagram_messages")
      .update({ status: "sent", ig_message_id: messageId, updated_at: new Date().toISOString() })
      .eq("id", inserted.id);

    await supabase
      .from("instagram_conversations")
      .update({
        last_message_at: new Date().toISOString(),
        unread_count: 0,
        updated_at: new Date().toISOString(),
      })
      .eq("id", conversation.id);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // The failure is written onto the message row, so the thread shows a
    // reply that did not go rather than silently nothing.
    await supabase
      .from("instagram_messages")
      .update({ status: "failed", error_message: message, updated_at: new Date().toISOString() })
      .eq("id", inserted.id);
    return { error: `Instagram refused the message: ${message}` };
  }

  revalidatePath("/whatsapp/instagram");
  return { success: "Sent." };
}

const convertSchema = z.object({
  conversationId: z.string().uuid(),
  studentName: z.string().trim().min(1, "A name is needed to create a lead."),
  primaryPhone: z.string().trim().min(1, "A phone number is needed — Instagram does not give us one."),
});

/**
 * **Convert to lead.**
 *
 * The deliberate difference between this channel and every other one: an
 * Instagram DM does not create a lead on arrival (docs/DECISIONS.md,
 * 2026-10-04 — most DMs are a question, a story reply, or nothing, and a
 * CRM that turns each into a lead stops being a record of who is
 * enrolling). A counsellor presses this when it becomes a real enquiry.
 *
 * It goes through `resolveOrCreateLead()` like every other source, which
 * is what makes it safe: somebody who already exists is linked rather
 * than duplicated (CLAUDE.md non-negotiable #2 — never reject a
 * duplicate), and the assignment rules run (#8 — one ingestion path).
 */
export async function convertConversationToLead(
  _prevState: InstagramActionState,
  formData: FormData,
): Promise<InstagramActionState> {
  try {
    return await runConvert(formData);
  } catch (error) {
    return {
      error: await reportActionFailure("action:convertConversationToLead", error, {
        fallback: "Could not create the lead. The problem has been reported.",
        revealMessage: true,
      }),
    };
  }
}

async function runConvert(formData: FormData): Promise<InstagramActionState> {
  const user = await getCurrentUser();
  if (!user || !can(user, "lead.create")) {
    return { error: "You don't have permission to create a lead." };
  }

  const parsed = convertSchema.safeParse({
    conversationId: formData.get("conversationId"),
    studentName: formData.get("studentName"),
    primaryPhone: formData.get("primaryPhone"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const supabase = await createClient();
  const { data: conversation } = await supabase
    .from("instagram_conversations")
    .select("id, ig_user_id, username, lead_id")
    .eq("id", parsed.data.conversationId)
    .maybeSingle<{ id: string; ig_user_id: string; username: string | null; lead_id: string | null }>();

  if (!conversation) {
    return { error: "That conversation is not available to you." };
  }
  if (conversation.lead_id) {
    return { error: "This conversation is already linked to a lead." };
  }

  const result = await resolveOrCreateLead({
    studentName: parsed.data.studentName,
    primaryPhone: parsed.data.primaryPhone,
    source: "instagram",
    // The handle, so the enquiry records which account they wrote from
    // even after a conversation is deleted or a handle changes.
    subSource: conversation.username ? `@${conversation.username}` : conversation.ig_user_id,
    raw: { igUserId: conversation.ig_user_id, username: conversation.username },
    dedupeKey: `instagram:${conversation.ig_user_id}`,
    actorId: user.id,
  });

  const { error: linkError } = await supabase
    .from("instagram_conversations")
    .update({ lead_id: result.leadId, updated_at: new Date().toISOString() })
    .eq("id", conversation.id);

  if (linkError) {
    // The lead exists; only the link failed. Said plainly rather than
    // implying nothing happened — pressing the button again would
    // otherwise look like the way to fix it, and would find the same lead
    // rather than making a second one.
    return {
      error: `The lead was created, but linking this conversation to it failed: ${linkError.message}`,
    };
  }

  await writeAuditLog(supabase, {
    actorId: user.id,
    action: "instagram.conversation_converted",
    entityType: "instagram_conversations",
    entityId: conversation.id,
    after: { leadId: result.leadId, isNewLead: result.isNewLead },
  });

  revalidatePath("/whatsapp/instagram");
  revalidatePath("/leads");

  return {
    success: result.isNewLead
      ? "Lead created and linked to this conversation."
      : "This person was already in the CRM — the conversation is now linked to their existing lead.",
  };
}

/**
 * Clears the unread count when somebody opens a thread.
 *
 * A mutation on page view does not belong in a Server Component's render,
 * so a small client component calls this once on mount instead. Failing
 * is a no-op on purpose: an unread badge that stays is a cosmetic
 * annoyance, and nothing about reading a message should be able to
 * produce an error dialog.
 */
export async function markInstagramConversationRead(conversationId: string): Promise<void> {
  const user = await getCurrentUser();
  if (!user || !can(user, "whatsapp.read")) return;

  const supabase = await createClient();
  await supabase
    .from("instagram_conversations")
    .update({ unread_count: 0 })
    .eq("id", conversationId)
    .gt("unread_count", 0);
}
