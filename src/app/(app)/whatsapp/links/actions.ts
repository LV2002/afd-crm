"use server";

import { randomBytes } from "node:crypto";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { writeAuditLog } from "@/lib/audit/log";
import { can, getCurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { whatsappLinks } from "@/lib/db/schema";
import { createClient } from "@/lib/supabase/server";

export interface LinkState {
  error?: string;
  success?: string;
}

function newCode(): string {
  return randomBytes(6).toString("base64url").toLowerCase().replace(/[^a-z0-9]/g, "x").slice(0, 7);
}

export async function createLink(_prev: LinkState, formData: FormData): Promise<LinkState> {
  const user = await getCurrentUser();
  if (!user || !can(user, "whatsapp.campaign")) return { error: "You don't have permission to do that." };
  const name = String(formData.get("name") ?? "").trim();
  const url = String(formData.get("url") ?? "").trim();
  if (!name) return { error: "Give the link a name so you can recognise it." };
  if (!/^https:\/\/[^\s]+$/.test(url)) return { error: "The address must start with https://" };

  const [created] = await db
    .insert(whatsappLinks)
    .values({ code: newCode(), name, url, createdBy: user.id })
    .returning({ id: whatsappLinks.id });

  const supabase = await createClient();
  await writeAuditLog(supabase, { actorId: user.id, action: "whatsapp.link_create", entityType: "whatsapp_links", entityId: created.id, after: { name, url } });
  revalidatePath("/whatsapp/links");
  return { success: "Link created." };
}

export async function deleteLink(id: string): Promise<LinkState> {
  const user = await getCurrentUser();
  if (!user || !can(user, "whatsapp.campaign")) return { error: "You don't have permission to do that." };
  await db.update(whatsappLinks).set({ deletedAt: new Date() }).where(eq(whatsappLinks.id, id));
  const supabase = await createClient();
  await writeAuditLog(supabase, { actorId: user.id, action: "whatsapp.link_delete", entityType: "whatsapp_links", entityId: id });
  revalidatePath("/whatsapp/links");
  return { success: "Removed." };
}
