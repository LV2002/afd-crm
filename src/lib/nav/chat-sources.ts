import "server-only";

import { isNull } from "drizzle-orm";

import { can, scopeFor, type SessionUser } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { profiles, whatsappNumbers } from "@/lib/db/schema";

import type { ChatLink } from "./chat-links";

/**
 * Who is listed under Chats in the navigation.
 *
 * The institute's API number, for whoever runs campaigns. A counsellor's own
 * number, for its owner — and every counsellor's number for anybody who runs
 * campaigns or may read chats beyond their own (a centre head, an admin).
 * Only labels and names are read, never messages, so this is cheap enough to
 * sit beside the badge counts on every navigation. What is inside each inbox
 * is still scoped by RLS, exactly as before.
 */
export async function getChatLinks(user: SessionUser): Promise<ChatLink[]> {
  if (!can(user, "whatsapp.read")) return [];
  const isCampaigner = can(user, "whatsapp.campaign");
  const seesOthers = isCampaigner || (scopeFor(user, "whatsapp.read") ?? "own") !== "own";

  const numbers = await db
    .select({ id: whatsappNumbers.id, label: whatsappNumbers.label, mode: whatsappNumbers.mode, counsellorId: whatsappNumbers.counsellorId })
    .from(whatsappNumbers)
    .where(isNull(whatsappNumbers.deletedAt));
  const owners = await db.select({ id: profiles.id, name: profiles.fullName }).from(profiles);
  const nameOf = new Map(owners.map((o) => [o.id, o.name]));

  const links: ChatLink[] = [];
  if (isCampaigner) links.push({ key: "api", label: "WhatsApp API", href: "/whatsapp/api", kind: "api" });
  for (const n of numbers.filter((x) => x.mode === "coexistence")) {
    if (!seesOthers && n.counsellorId !== user.id) continue;
    links.push({
      key: n.id,
      label: n.counsellorId ? (nameOf.get(n.counsellorId) ?? n.label) : n.label,
      href: `/whatsapp/personal?number=${n.id}`,
      kind: "own",
    });
  }
  return links.sort((a, b) => (a.kind === b.kind ? a.label.localeCompare(b.label) : a.kind === "api" ? -1 : 1));
}
