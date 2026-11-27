"use server";

import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { writeAuditLog } from "@/lib/audit/log";
import { can, getCurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { metaLeadFilters } from "@/lib/db/schema";
import { getIntegrationCredentials } from "@/lib/integrations/credentials";
import type { MetaFilterKind } from "@/lib/integrations/meta/lead-filter";
import { createClient } from "@/lib/supabase/server";

export interface FilterState {
  error?: string;
  success?: string;
}

const KINDS: MetaFilterKind[] = ["campaign", "adset", "form"];

/** A readable name for a Meta campaign / ad set / form id, when the ads token can see it. */
async function lookUpName(externalId: string): Promise<string | null> {
  try {
    const { ads_access_token: token } = await getIntegrationCredentials("meta", ["ads_access_token"]);
    if (!token) return null;
    const url = new URL(`https://graph.facebook.com/v21.0/${externalId}`);
    url.searchParams.set("fields", "name");
    url.searchParams.set("access_token", token);
    const response = await fetch(url.toString(), { signal: AbortSignal.timeout(4000) });
    if (!response.ok) return null;
    const body = (await response.json()) as { name?: string };
    return body.name ?? null;
  } catch {
    return null;
  }
}

export async function addMetaLeadFilter(_prev: FilterState, formData: FormData): Promise<FilterState> {
  const user = await getCurrentUser();
  if (!user || !can(user, "settings.manage")) return { error: "You don't have permission to do that." };

  const kind = String(formData.get("kind") ?? "") as MetaFilterKind;
  const externalId = String(formData.get("externalId") ?? "").trim();
  let label = String(formData.get("label") ?? "").trim() || null;
  if (!KINDS.includes(kind)) return { error: "Choose campaign, ad set or lead form." };
  if (!/^\d{5,25}$/.test(externalId)) return { error: "The ID is the long number Meta shows for it — digits only." };

  const [existing] = await db
    .select({ id: metaLeadFilters.id })
    .from(metaLeadFilters)
    .where(and(eq(metaLeadFilters.kind, kind), eq(metaLeadFilters.externalId, externalId), isNull(metaLeadFilters.deletedAt)));
  if (existing) return { error: "That one is already switched off." };

  label = label ?? (await lookUpName(externalId));
  const [row] = await db.insert(metaLeadFilters).values({ kind, externalId, label, createdBy: user.id }).returning({ id: metaLeadFilters.id });

  const supabase = await createClient();
  await writeAuditLog(supabase, {
    actorId: user.id,
    action: "meta_lead_filter.add",
    entityType: "meta_lead_filters",
    entityId: row.id,
    after: { kind, externalId, label },
  });
  revalidatePath("/settings/integrations/meta");
  return { success: `Leads from this ${kind === "adset" ? "ad set" : kind === "form" ? "form" : "campaign"} will no longer come into the CRM.` };
}

/** Turns a campaign / ad set / form back on: its leads come in again from the next submission. */
export async function removeMetaLeadFilter(id: string): Promise<FilterState> {
  const user = await getCurrentUser();
  if (!user || !can(user, "settings.manage")) return { error: "You don't have permission to do that." };

  const [row] = await db
    .select()
    .from(metaLeadFilters)
    .where(and(eq(metaLeadFilters.id, id), isNull(metaLeadFilters.deletedAt)));
  if (!row) return { error: "That is already gone." };

  await db.update(metaLeadFilters).set({ deletedAt: new Date() }).where(eq(metaLeadFilters.id, id));
  const supabase = await createClient();
  await writeAuditLog(supabase, {
    actorId: user.id,
    action: "meta_lead_filter.remove",
    entityType: "meta_lead_filters",
    entityId: id,
    before: { kind: row.kind, externalId: row.externalId, label: row.label },
  });
  revalidatePath("/settings/integrations/meta");
  return { success: "Switched back on." };
}
