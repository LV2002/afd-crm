import type { ResolveLeadInput } from "@/lib/identity/resolve-or-create-lead";

export interface GoogleUserColumnDatum {
  column_id: string;
  column_name?: string;
  string_value: string;
}

/** The JSON body Google POSTs to the webhook — the full lead payload inline, unlike Meta which only sends a `leadgen_id` to look up separately. */
export interface GoogleLeadWebhookPayload {
  api_version?: string;
  lead_id: string;
  campaign_id?: number | string;
  form_id?: number | string;
  adgroup_id?: number | string;
  creative_id?: number | string;
  gcl_id?: string;
  google_key: string;
  is_test?: boolean;
  user_column_data: GoogleUserColumnDatum[];
}

function columnValue(data: GoogleUserColumnDatum[], columnId: string): string | null {
  return data.find((d) => d.column_id === columnId)?.string_value?.trim() || null;
}

/** Google's standard lead-form column ids ("FULL_NAME", "PHONE_NUMBER", ...) — a custom question on the form isn't dropped, it's still in `raw`, just not mapped onto a core lead column. */
export interface MappedGoogleLead {
  studentName: string;
  primaryPhone: string;
  email: string | null;
  city: string | null;
}

/** Returns null when the lead has no usable name or phone — the two fields resolveOrCreateLead() cannot proceed without. */
export function mapGoogleLeadFields(payload: GoogleLeadWebhookPayload): MappedGoogleLead | null {
  const data = payload.user_column_data ?? [];

  const fullName = columnValue(data, "FULL_NAME");
  const firstName = columnValue(data, "FIRST_NAME");
  const lastName = columnValue(data, "LAST_NAME");
  const studentName = fullName || [firstName, lastName].filter(Boolean).join(" ").trim();

  const primaryPhone = columnValue(data, "PHONE_NUMBER");

  if (!studentName || !primaryPhone) return null;

  return {
    studentName,
    primaryPhone,
    email: columnValue(data, "EMAIL"),
    city: columnValue(data, "CITY"),
  };
}

/** Composes the mapped lead fields with the webhook's own campaign/form context into exactly what `resolveOrCreateLead()` needs. */
export function buildResolveLeadInput(payload: GoogleLeadWebhookPayload, mapped: MappedGoogleLead): ResolveLeadInput {
  return {
    studentName: mapped.studentName,
    primaryPhone: mapped.primaryPhone,
    email: mapped.email,
    city: mapped.city,
    source: "google",
    subSource: payload.form_id != null ? String(payload.form_id) : null,
    campaignId: payload.campaign_id != null ? String(payload.campaign_id) : null,
    adsetId: payload.adgroup_id != null ? String(payload.adgroup_id) : null,
    adId: payload.creative_id != null ? String(payload.creative_id) : null,
    gclid: payload.gcl_id ?? null,
    raw: payload as unknown as Record<string, unknown>,
    dedupeKey: payload.lead_id,
  };
}
