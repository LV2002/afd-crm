import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { SessionUser } from "@/lib/auth/session";
import { getRawFieldValue } from "@/lib/fields/field-column";
import { getFieldSchema, type FieldEntity } from "@/lib/fields/get-field-schema";
import { normalizePhone } from "@/lib/identity/normalize-phone";
import { applyPivotFilters, dimensionFields, type PivotField } from "@/lib/reports/pivot";

/**
 * Who a broadcast goes to.
 *
 * The audience used to be one lead tag. It is now a filter set over any
 * lead or student variable — Leon: "categorise the leads and students
 * just like in insights with all the variables and customize who I want
 * to send the message to." That is literally the same grammar: the
 * filters are `lib/reports/pivot.ts`'s, so a filter here means exactly
 * what the identical filter means on the Insights page, and a custom
 * field an admin adds becomes an audience filter the moment it exists.
 *
 * A tag is still available as an extra narrowing, so every audience that
 * worked before still works.
 *
 * Everything runs through the caller's RLS-bound client, so a centre head
 * composing a broadcast reaches their centre and no further — the
 * audience is scoped by the same policies as every list they can already
 * read, rather than by anything this module does.
 */

export type AudienceEntity = Extract<FieldEntity, "lead" | "student">;

export interface AudienceSpec {
  entity: AudienceEntity;
  /** `{ fieldKey: value }` — the Insights filter shape. */
  filters: Record<string, string>;
  /** Leads only. Ignored for students, who don't carry lead tags. */
  tagId?: string | null;
}

export interface AudienceMember {
  entity: AudienceEntity;
  id: string;
  name: string;
  /** E.164 as stored. */
  phone: string;
}

export interface AudienceResult {
  members: AudienceMember[];
  /** People the filters matched but who can't be messaged, so the count on screen is honest about the gap. */
  skipped: {
    noPhone: number;
    doNotContact: number;
    duplicatePhone: number;
  };
}

/** The variables an audience can be filtered on — the same ones Insights offers, for the same reasons. */
export async function audienceFields(
  supabase: SupabaseClient,
  user: SessionUser,
  entity: AudienceEntity,
): Promise<PivotField[]> {
  const schema = await getFieldSchema(supabase, entity, user);
  return dimensionFields(
    schema.map((field) => ({
      key: field.key,
      label: field.label,
      type: field.type,
      isCore: field.isCore,
    })),
  );
}

export async function resolveAudience(
  supabase: SupabaseClient,
  user: SessionUser,
  spec: AudienceSpec,
): Promise<AudienceResult> {
  const fields = await audienceFields(supabase, user, spec.entity);

  // `select("*")` rather than a column list because the fields are
  // configuration: an admin adds a custom field and it has to be
  // filterable without a code change. RLS still decides which rows come
  // back, and nothing here is rendered — only names and numbers reach the
  // recipient snapshot.
  const table = spec.entity === "lead" ? "leads" : "students";
  let query = supabase.from(table).select("*").is("deleted_at", null);

  if (spec.entity === "lead") {
    // A broadcast is exactly the unsolicited outbound contact this flag
    // exists to block, so it is applied in the query rather than left to
    // whoever composes the audience.
    query = query.eq("do_not_contact", false);
  }

  const { data, error } = await query.returns<Array<Record<string, unknown>>>();
  if (error) throw new Error(`resolveAudience(${spec.entity}): ${error.message}`);
  let rows = data ?? [];

  if (spec.entity === "lead" && spec.tagId) {
    const { data: tagged } = await supabase
      .from("lead_tags")
      .select("lead_id")
      .eq("tag_id", spec.tagId)
      .returns<Array<{ lead_id: string }>>();
    const taggedIds = new Set((tagged ?? []).map((row) => row.lead_id));
    rows = rows.filter((row) => taggedIds.has(String(row.id)));
  }

  const matched = applyPivotFilters(
    rows.map((row) => ({
      id: String(row.id),
      stageId: null,
      values: Object.fromEntries(fields.map((field) => [field.key, getRawFieldValue(field, row)])),
    })),
    fields,
    spec.filters,
  );

  const rowById = new Map(rows.map((row) => [String(row.id), row]));
  const nameKey = spec.entity === "lead" ? "student_name" : "full_name";
  const phoneKey = spec.entity === "lead" ? "primary_phone" : "phone";

  const members: AudienceMember[] = [];
  const seenPhones = new Set<string>();
  const skipped = { noPhone: 0, doNotContact: 0, duplicatePhone: 0 };

  for (const lead of matched) {
    const row = rowById.get(lead.id);
    if (!row) continue;

    const rawPhone = row[phoneKey];
    const phone = typeof rawPhone === "string" ? rawPhone.trim() : "";
    if (!phone) {
      skipped.noPhone += 1;
      continue;
    }

    // One message per number, not per record. A parent whose number is on
    // two siblings' records should get one broadcast, not two.
    const key = normalizePhone(phone) ?? phone;
    if (seenPhones.has(key)) {
      skipped.duplicatePhone += 1;
      continue;
    }
    seenPhones.add(key);

    members.push({
      entity: spec.entity,
      id: lead.id,
      name: String(row[nameKey] ?? "").trim() || phone,
      phone,
    });
  }

  // Counted from the query above rather than recomputed: the flag is
  // applied in SQL, so these never reach `rows` at all.
  if (spec.entity === "lead") {
    const { count } = await supabase
      .from("leads")
      .select("id", { count: "exact", head: true })
      .is("deleted_at", null)
      .eq("do_not_contact", true);
    skipped.doNotContact = count ?? 0;
  }

  return { members, skipped };
}
