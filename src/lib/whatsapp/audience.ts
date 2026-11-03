import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { SessionUser } from "@/lib/auth/session";
import { getRawFieldValue } from "@/lib/fields/field-column";
import { getFieldSchema, type FieldEntity } from "@/lib/fields/get-field-schema";
import { db } from "@/lib/db/client";
import { normalizePhone } from "@/lib/identity/normalize-phone";
import { mayReceiveMarketing } from "@/lib/consent/consent";
import { leadStateFor } from "@/lib/contacts/lead-matches";
import { suppressedAmong } from "@/lib/whatsapp/opt-out";
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
 * Everything runs through the caller's RLS-bound client, so a centre head
 * composing a broadcast reaches their centre and no further — the
 * audience is scoped by the same policies as every list they can already
 * read, rather than by anything this module does.
 */

/**
 * `contact` is the contact database: people on the lists chosen, who are not
 * leads. They are kept out of the lead and student audiences and the other
 * way round, so a message to the database never reaches somebody in the
 * leads, and a message to the leads never reaches the database.
 */
export type AudienceEntity = Extract<FieldEntity, "lead" | "student"> | "contact";

export interface AudienceSpec {
  entity: AudienceEntity;
  /** `{ fieldKey: value }` — the Insights filter shape. */
  filters: Record<string, string>;
  /** The contact database only: which lists. A person on any of them is in. */
  listIds?: string[];
}

export interface AudienceMember {
  entity: AudienceEntity;
  id: string;
  name: string;
  /** E.164 as stored. */
  phone: string;
  /**
   * The whole row this member came from, kept so per-recipient template
   * values can be resolved without fetching everybody a second time (see
   * `merge-values.ts`).
   *
   * SERVER-SIDE ONLY. It is a full lead or student record — phone
   * numbers, custom fields, everything RLS let the composer read — and
   * nothing may hand it to a client component. `previewAudience` returns
   * counts and a few first names for exactly this reason.
   */
  record: Record<string, unknown>;
}

export interface AudienceResult {
  members: AudienceMember[];
  /** People the filters matched but who can't be messaged, so the count on screen is honest about the gap. */
  skipped: {
    noPhone: number;
    doNotContact: number;
    duplicatePhone: number;
    optedOut: number;
    /** Consent withdrawn, or never recorded on a lead predating consent capture. */
    noConsent: number;
    /** The database only: already a lead, so left to the leads audience. */
    alreadyLeads: number;
  };
}

/** The variables an audience can be filtered on — the same ones Insights offers, for the same reasons. */
export async function audienceFields(
  supabase: SupabaseClient,
  user: SessionUser,
  entity: AudienceEntity,
): Promise<PivotField[]> {
  // A contact carries the lead fields, so it is filtered on the same ones.
  const schema = await getFieldSchema(supabase, entity === "contact" ? "lead" : entity, user);
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
  if (spec.entity === "contact") return resolveContactAudience(supabase, user, spec);

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
  const rows = data ?? [];

  const matched = applyPivotFilters(
    rows.map((row) => ({
      id: String(row.id),
      temperature: null,
      values: Object.fromEntries(fields.map((field) => [field.key, getRawFieldValue(field, row)])),
    })),
    fields,
    spec.filters,
  );

  const rowById = new Map(rows.map((row) => [String(row.id), row]));
  const nameKey = spec.entity === "lead" ? "student_name" : "full_name";
  const phoneKey = spec.entity === "lead" ? "primary_phone" : "phone";

  // One query for the whole audience rather than one per person: a
  // broadcast to four hundred people would otherwise be four hundred
  // round trips before it sent anything.
  const suppressed = await suppressedAmong(
    db,
    matched
      .map((lead) => {
        const value = rowById.get(lead.id)?.[phoneKey];
        return typeof value === "string" ? value : "";
      })
      .filter(Boolean),
  );

  const members: AudienceMember[] = [];
  const seenPhones = new Set<string>();
  const skipped = { noPhone: 0, doNotContact: 0, duplicatePhone: 0, optedOut: 0, noConsent: 0, alreadyLeads: 0 };

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

    // Somebody who told us to stop. Checked here so the count on screen
    // is what will actually be sent, and again at send time, because a
    // person can opt out between composing a broadcast and it going out.
    if (suppressed.has(key)) {
      skipped.optedOut += 1;
      continue;
    }

    // Consent is the other half of the same question, and it is asked
    // through one helper so no caller can check only the part it
    // remembers. Every lead entering the CRM is recorded as opted in —
    // the enquiry is the consent — so in practice this only removes the
    // ones who withdrew, and the handful created before consent was
    // captured at all. See lib/consent/consent.ts.
    if (
      spec.entity === "lead" &&
      !mayReceiveMarketing({
        consentStatus: typeof row.consent_status === "string" ? row.consent_status : null,
        doNotContact: row.do_not_contact === true,
        phoneSuppressed: false,
      })
    ) {
      skipped.noConsent += 1;
      continue;
    }

    seenPhones.add(key);

    members.push({
      entity: spec.entity,
      id: lead.id,
      name: String(row[nameKey] ?? "").trim() || phone,
      phone,
      record: row,
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


interface ContactRow {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  fields: Record<string, unknown> | null;
  lead_id: string | null;
}

/**
 * The contact database as a broadcast audience.
 *
 * Three rules make it safe to send to:
 *
 * - **Only lists that agreed.** A list has to be ticked "these people agreed
 *   to WhatsApp messages". Choosing one that is not is refused, by name,
 *   rather than quietly skipped: a number that never opted in is how a
 *   WhatsApp number gets restricted, and the institute has one.
 * - **Never a lead.** Anybody linked to a lead, or whose phone or email
 *   belongs to one, is left out and counted. The leads have their own
 *   audience, with their own consent; this one is the database and nobody
 *   else.
 * - **Opt-outs honoured**, here and again at send time, like every audience.
 *
 * Contacts are read through the caller's own client, so `contact.read` is
 * what lets somebody compose to them.
 */
async function resolveContactAudience(
  supabase: SupabaseClient,
  user: SessionUser,
  spec: AudienceSpec,
): Promise<AudienceResult> {
  const skipped = { noPhone: 0, doNotContact: 0, duplicatePhone: 0, optedOut: 0, noConsent: 0, alreadyLeads: 0 };
  const listIds = spec.listIds ?? [];
  if (listIds.length === 0) throw new Error("Choose at least one list from the database.");

  const { data: lists, error: listError } = await supabase
    .from("contact_lists")
    .select("id, name, use_for_whatsapp")
    .in("id", listIds)
    .is("archived_at", null)
    .returns<Array<{ id: string; name: string; use_for_whatsapp: boolean }>>();
  if (listError) throw new Error(`resolveAudience(contact): ${listError.message}`);
  const found = lists ?? [];
  if (found.length === 0) throw new Error("Those lists aren't available to you.");

  const notAgreed = found.filter((l) => !l.use_for_whatsapp);
  if (notAgreed.length > 0) {
    throw new Error(
      `${notAgreed.map((l) => `“${l.name}”`).join(", ")} ${notAgreed.length === 1 ? "isn't" : "aren't"} marked as having agreed to WhatsApp messages, so ${notAgreed.length === 1 ? "it" : "they"} can't be messaged. Tick that on the list if it is true.`,
    );
  }

  // PostgREST answers at most 1,000 rows at a time, however large the
  // database: read it a page at a time or a list of 3,000 silently becomes 1,000.
  const rows: ContactRow[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("contacts")
      .select("id, name, phone, email, fields, lead_id, contact_list_members!inner(list_id)")
      .in("contact_list_members.list_id", found.map((l) => l.id))
      .order("id")
      .range(from, from + 999)
      .returns<ContactRow[]>();
    if (error) throw new Error(`resolveAudience(contact): ${error.message}`);
    rows.push(...(data ?? []));
    if ((data ?? []).length < 1000) break;
  }

  // A contact as a lead-shaped record, so the same filters apply.
  const fields = await audienceFields(supabase, user, "contact");
  const recordOf = (c: ContactRow): Record<string, unknown> => ({
    ...(c.fields ?? {}),
    custom: c.fields ?? {},
    student_name: c.name,
    primary_phone: c.phone,
    email: c.email,
  });
  const recordById = new Map(rows.map((c) => [c.id, recordOf(c)]));

  const matched = applyPivotFilters(
    rows.map((c) => ({
      id: c.id,
      temperature: null,
      values: Object.fromEntries(fields.map((f) => [f.key, getRawFieldValue(f, recordById.get(c.id) ?? {})])),
    })),
    fields,
    spec.filters,
  );
  const matchedRows = matched.map((m) => rows.find((c) => c.id === m.id)).filter((c): c is ContactRow => Boolean(c));

  const state = await leadStateFor(
    matchedRows.map((c) => ({ id: c.id, phone: c.phone, email: c.email, leadId: c.lead_id })),
  );
  const suppressed = await suppressedAmong(
    db,
    matchedRows.map((c) => c.phone ?? "").filter(Boolean),
  );

  const members: AudienceMember[] = [];
  const seen = new Set<string>();
  for (const c of matchedRows) {
    const s = state.get(c.id);
    if (s?.linked || s?.match) {
      skipped.alreadyLeads += 1;
      continue;
    }
    const phone = c.phone?.trim() ?? "";
    if (!phone) {
      skipped.noPhone += 1;
      continue;
    }
    const key = normalizePhone(phone) ?? phone;
    if (seen.has(key)) {
      skipped.duplicatePhone += 1;
      continue;
    }
    if (suppressed.has(key)) {
      skipped.optedOut += 1;
      continue;
    }
    seen.add(key);
    members.push({ entity: "contact", id: c.id, name: c.name.trim() || phone, phone, record: recordById.get(c.id) ?? {} });
  }

  return { members, skipped };
}
