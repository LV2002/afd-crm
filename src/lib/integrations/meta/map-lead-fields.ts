import type { ResolveLeadInput } from "@/lib/identity/resolve-or-create-lead";

export interface MetaLeadFieldDatum {
  name: string;
  values: string[];
}

/** The shape returned by `GET /{leadgen_id}` on the Graph API, requesting field_data plus the campaign/ad context fields. */
export interface MetaLeadgenResponse {
  id: string;
  created_time?: string;
  form_id?: string;
  ad_id?: string;
  adset_id?: string;
  campaign_id?: string;
  field_data: MetaLeadFieldDatum[];
}

function fieldValue(fieldData: MetaLeadFieldDatum[], name: string): string | null {
  return fieldData.find((f) => f.name === name)?.values?.[0]?.trim() || null;
}

/**
 * Meta's own standard question keys ("full_name", "phone_number", "email",
 * "city" ...) plus a first_name/last_name fallback most Lead Ads forms
 * that skip the combined field still use. Anything else on the form (a
 * custom question) isn't dropped — it's still in `raw` via the caller,
 * just not mapped onto a core lead column, same as any other CSV import
 * column that doesn't match a known field.
 */
export interface MappedMetaLead {
  studentName: string;
  primaryPhone: string;
  email: string | null;
  city: string | null;
}

/** Returns null when the lead has no usable name or phone — the two fields resolveOrCreateLead() cannot proceed without. */
export function mapMetaLeadFields(lead: MetaLeadgenResponse): MappedMetaLead | null {
  const fd = lead.field_data ?? [];

  const fullName = fieldValue(fd, "full_name");
  const firstName = fieldValue(fd, "first_name");
  const lastName = fieldValue(fd, "last_name");
  const studentName = fullName || [firstName, lastName].filter(Boolean).join(" ").trim();

  const primaryPhone = fieldValue(fd, "phone_number");

  if (!studentName || !primaryPhone) return null;

  return {
    studentName,
    primaryPhone,
    email: fieldValue(fd, "email"),
    city: fieldValue(fd, "city"),
  };
}

/**
 * Composes the mapped lead fields with the webhook's own campaign/ad
 * context into exactly what `resolveOrCreateLead()` needs. `subSource` is
 * the form id — the closest thing Lead Ads has to "which specific ad
 * creative/question-set generated this," short of the ad id itself.
 */
export function buildResolveLeadInput(lead: MetaLeadgenResponse, mapped: MappedMetaLead): ResolveLeadInput {
  return {
    studentName: mapped.studentName,
    primaryPhone: mapped.primaryPhone,
    email: mapped.email,
    city: mapped.city,
    source: "meta",
    subSource: lead.form_id ?? null,
    campaignId: lead.campaign_id ?? null,
    adsetId: lead.adset_id ?? null,
    adId: lead.ad_id ?? null,
    raw: lead as unknown as Record<string, unknown>,
    dedupeKey: lead.id,
    receivedAt: lead.created_time ? new Date(lead.created_time) : undefined,
  };
}
