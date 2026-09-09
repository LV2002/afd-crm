"use server";

import { eq } from "drizzle-orm";

import { can, getCurrentUser, scopeFor } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { leads, whatsappMessages } from "@/lib/db/schema";
import { createSignedUrl } from "@/lib/storage/attachments";
import { createClient } from "@/lib/supabase/server";

/**
 * A five-minute link to one inbound file.
 *
 * The bucket is private, so this is the only way the bytes are reachable
 * — and because it runs on the direct client to join the message to its
 * lead, the access check RLS would have made is re-implemented here, the
 * same pattern as every other direct-client read in this codebase.
 *
 * A message with no lead (a reply from a number nobody has entered) is
 * campaign work, so it needs `whatsapp.campaign` rather than access to a
 * lead that does not exist.
 */
export async function getWhatsAppMediaUrl(
  messageId: string,
): Promise<{ url?: string; error?: string }> {
  const user = await getCurrentUser();
  if (!user || !can(user, "whatsapp.read")) {
    return { error: "You don't have permission to view this." };
  }

  const [row] = await db
    .select({
      storagePath: whatsappMessages.mediaStoragePath,
      leadId: whatsappMessages.leadId,
      leadCenterId: leads.centerId,
      leadAssignedTo: leads.assignedTo,
    })
    .from(whatsappMessages)
    .leftJoin(leads, eq(leads.id, whatsappMessages.leadId))
    .where(eq(whatsappMessages.id, messageId));

  if (!row?.storagePath) return { error: "That file isn't here." };

  if (!row.leadId) {
    if (!can(user, "whatsapp.campaign")) return { error: "That conversation isn't yours." };
  } else {
    const scope = scopeFor(user, "whatsapp.read");
    if (scope === "own" && row.leadAssignedTo !== user.id) {
      return { error: "That conversation isn't yours." };
    }
    if (
      scope === "center" &&
      (!row.leadCenterId || !user.centerIds.includes(row.leadCenterId))
    ) {
      return { error: "That conversation isn't at your centre." };
    }
  }

  const supabase = await createClient();
  const url = await createSignedUrl(supabase, row.storagePath);
  return url ? { url } : { error: "Could not open that file." };
}
