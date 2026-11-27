import { isNull } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { metaLeadFilters } from "@/lib/db/schema";

import type { MetaLeadgenResponse } from "./map-lead-fields";

export type MetaFilterKind = "campaign" | "adset" | "form";

export const FILTER_KIND_LABELS: Record<MetaFilterKind, string> = {
  campaign: "Campaign",
  adset: "Ad set",
  form: "Lead form",
};

export interface FilterHit {
  kind: MetaFilterKind;
  externalId: string;
  label: string | null;
}

/**
 * Whether a lead from a Meta lead ad should be left out of the CRM: its
 * campaign, ad set or form has been switched off under Settings → Integrations
 * → Meta. Pure given the rules, so the decision is testable without Meta.
 */
export function findFilterHit(
  lead: Pick<MetaLeadgenResponse, "campaign_id" | "adset_id" | "form_id">,
  rules: Array<{ kind: string; externalId: string; label: string | null }>,
): FilterHit | null {
  const ids: Record<MetaFilterKind, string | undefined> = {
    campaign: lead.campaign_id,
    adset: lead.adset_id,
    form: lead.form_id,
  };
  for (const rule of rules) {
    const kind = rule.kind as MetaFilterKind;
    if (ids[kind] && ids[kind] === rule.externalId.trim()) {
      return { kind, externalId: rule.externalId, label: rule.label };
    }
  }
  return null;
}

export async function matchMetaLeadFilter(
  lead: Pick<MetaLeadgenResponse, "campaign_id" | "adset_id" | "form_id">,
): Promise<FilterHit | null> {
  const rules = await db
    .select({ kind: metaLeadFilters.kind, externalId: metaLeadFilters.externalId, label: metaLeadFilters.label })
    .from(metaLeadFilters)
    .where(isNull(metaLeadFilters.deletedAt));
  return findFilterHit(lead, rules);
}
