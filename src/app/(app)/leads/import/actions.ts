"use server";

import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";

import { writeAuditLog } from "@/lib/audit/log";
import { can, getCurrentUser, scopeFor } from "@/lib/auth/session";
import { fieldColumn } from "@/lib/fields/field-column";
import { getFieldSchema, type FieldSchemaEntry } from "@/lib/fields/get-field-schema";
import { OPTION_BEARING_TYPES, resolveFieldOptions, type FieldOption } from "@/lib/fields/resolve-field-options";
import { coerceImportValue } from "@/lib/leads/coerce-import-value";
import { RESOLVE_INPUT_KEYS } from "@/lib/leads/importable-fields";
import { resolveOrCreateLead, type ResolveLeadInput } from "@/lib/identity/resolve-or-create-lead";
import { createClient } from "@/lib/supabase/server";

/** A soft cap, not a hard platform limit: keeps one import to a size a human can actually review the results of, and comfortably inside a Server Action's default request-body budget. Split a bigger file into batches. */
const MAX_ROWS = 2000;

export type ImportRow = Record<string, string>;
/** CSV header -> target field key ("" means skip that column). */
export type ImportMapping = Record<string, string>;

interface ImportRowResult {
  rowIndex: number;
  status: "created" | "matched" | "skipped";
  leadId?: string;
  leadNumber?: number;
  message?: string;
}

export interface ImportSummary {
  total: number;
  created: number;
  matched: number;
  skipped: number;
  rows: ImportRowResult[];
}

export interface ImportResult {
  error?: string;
  summary?: ImportSummary;
}

/**
 * CLAUDE.md non-negotiable #8: CSV import is one of the named ingestion
 * paths, and every path goes through `resolveOrCreateLead()` then
 * `applyAssignment()` (the latter called from inside the former whenever
 * no explicit `assignedTo` is given — see importable-fields.ts for why
 * this action never maps one in).
 *
 * `resolveOrCreateLead()` runs on the direct db client and bypasses RLS by
 * design (Session 4) — same as `createLeadManually()`, this action is the
 * enforcement point that re-implements own/center/all scope semantics
 * before ever calling it. The one thing this action does NOT do under the
 * direct client: any field beyond `resolveOrCreateLead()`'s own
 * `ResolveLeadInput` shape (temperature, next_followup_at, a custom field,
 * ...) is written afterward through the normal RLS-bound Supabase client,
 * same call shape as `updateLead()` — that part is an ordinary single-row
 * update, not identity resolution, so it gets the normal RLS backstop
 * rather than a second bespoke bypass.
 */
export async function importLeads(
  rows: ImportRow[],
  mapping: ImportMapping,
  defaultCenterId: string | null,
): Promise<ImportResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "Not signed in." };

  const scope = scopeFor(user, "lead.import");
  if (!can(user, "lead.import") || !scope) {
    return { error: "You don't have permission to import leads." };
  }

  if (rows.length === 0) return { error: "The file has no data rows." };
  if (rows.length > MAX_ROWS) {
    return { error: `That's ${rows.length} rows — split into batches of ${MAX_ROWS} or fewer.` };
  }

  if (defaultCenterId && scope !== "all" && !user.centerIds.includes(defaultCenterId)) {
    return { error: "Choose one of your own centres." };
  }

  const supabase = await createClient();
  const fields = await getFieldSchema(supabase, "lead", user);
  const fieldByKey = new Map(fields.map((f) => [f.key, f]));

  // header -> fieldKey, dropping unmapped ("") columns.
  const headerToKey = Object.entries(mapping).filter(([, key]) => key !== "");
  const mappedKeys = new Set(headerToKey.map(([, key]) => key));

  if (!mappedKeys.has("student_name") || !mappedKeys.has("primary_phone")) {
    return { error: "Map both Student Name and Primary Phone before importing." };
  }

  // Only fetch options for fields actually in play — most imports use a handful of columns, not all ~29.
  const optionBearingKeys = Array.from(mappedKeys).filter((key) => {
    const field = fieldByKey.get(key);
    return field && OPTION_BEARING_TYPES.has(field.type);
  });
  const optionEntries = await Promise.all(
    optionBearingKeys.map(
      async (key) => [key, await resolveFieldOptions(supabase, fieldByKey.get(key)!)] as const,
    ),
  );
  const optionsByKey = new Map<string, FieldOption[]>(optionEntries);

  const batchId = randomUUID();
  const rowResults: ImportRowResult[] = [];
  let created = 0;
  let matched = 0;
  let skipped = 0;

  for (const [index, row] of rows.entries()) {
    const rowIndex = index + 2; // header is spreadsheet row 1; data starts at row 2
    const values: Record<string, unknown> = {};
    const warnings: string[] = [];

    for (const [header, key] of headerToKey) {
      const field = fieldByKey.get(key);
      if (!field) continue;
      const { value, warning } = coerceImportValue(field, row[header], optionsByKey.get(key) ?? []);
      if (value !== undefined) values[key] = value;
      if (warning) warnings.push(warning);
    }

    const studentName = typeof values.student_name === "string" ? values.student_name : "";
    const primaryPhone = typeof values.primary_phone === "string" ? values.primary_phone : "";

    if (!studentName) {
      rowResults.push({ rowIndex, status: "skipped", message: "Missing student name" });
      skipped++;
      continue;
    }
    if (!primaryPhone) {
      rowResults.push({ rowIndex, status: "skipped", message: "Missing or unrecognisable phone number" });
      skipped++;
      continue;
    }

    const rowCenterId = typeof values.center_id === "string" ? values.center_id : (defaultCenterId ?? null);
    if (rowCenterId && scope !== "all" && !user.centerIds.includes(rowCenterId)) {
      rowResults.push({ rowIndex, status: "skipped", message: "Centre is outside your access" });
      skipped++;
      continue;
    }

    const assignedTo = scope === "own" ? user.id : undefined;

    const resolveInput: ResolveLeadInput = {
      studentName,
      primaryPhone,
      email: (values.email as string) ?? null,
      fatherName: (values.father_name as string) ?? null,
      city: (values.city as string) ?? null,
      district: (values.district as string) ?? null,
      state: (values.state as string) ?? null,
      examYear: (values.exam_year as string) ?? null,
      interestedExams: (values.interested_exams as string[]) ?? null,
      coursesInterested: (values.courses_interested as string[]) ?? null,
      centerId: rowCenterId,
      assignedTo,
      source: (values.lead_source as string) ?? "CSV Import",
      subSource: (values.sub_source as string) ?? null,
      ingestBatchId: batchId,
    };

    let outcome;
    try {
      outcome = await resolveOrCreateLead(resolveInput);
    } catch (error) {
      rowResults.push({
        rowIndex,
        status: "skipped",
        message: error instanceof Error ? error.message : "Could not import this row.",
      });
      skipped++;
      continue;
    }

    if (outcome.isNewLead) {
      created++;
      await writeExtraFields(supabase, outcome.leadId, values, fieldByKey);
    } else {
      matched++;
    }

    rowResults.push({
      rowIndex,
      status: outcome.isNewLead ? "created" : "matched",
      leadId: outcome.leadId,
      leadNumber: outcome.leadNumber,
      message: warnings.length > 0 ? warnings.join("; ") : undefined,
    });
  }

  await writeAuditLog(supabase, {
    actorId: user.id,
    action: "lead.import",
    entityType: "leads",
    entityId: batchId,
    after: { batchId, total: rows.length, created, matched, skipped },
  });

  revalidatePath("/leads");
  revalidatePath("/pipeline");

  return { summary: { total: rows.length, created, matched, skipped, rows: rowResults } };
}

/**
 * Anything mapped that isn't part of `resolveOrCreateLead()`'s own
 * `ResolveLeadInput` shape (temperature, next_followup_at, a custom
 * field, ...) — written only onto a brand-new lead, never onto one an
 * existing enquiry just attached to: a duplicate's profile fields belong
 * to the person, not to whichever spreadsheet row happened to match them,
 * same rule `resolveOrCreateLead()` itself already applies to the fields
 * it does own.
 *
 * Runs through the normal RLS-bound client, same shape as `updateLead()`
 * — this is an ordinary single-row update, not identity resolution, so it
 * doesn't need `resolveOrCreateLead()`'s bypass. If the importer's role
 * doesn't happen to hold `lead.update`, RLS silently drops these extra
 * fields rather than failing the row — the lead itself was already
 * created successfully.
 */
async function writeExtraFields(
  supabase: Awaited<ReturnType<typeof createClient>>,
  leadId: string,
  values: Record<string, unknown>,
  fieldByKey: Map<string, FieldSchemaEntry>,
): Promise<void> {
  const coreUpdates: Record<string, unknown> = {};
  const customUpdates: Record<string, unknown> = {};
  let hasCustom = false;

  for (const [key, value] of Object.entries(values)) {
    if (RESOLVE_INPUT_KEYS.has(key)) continue;
    const field = fieldByKey.get(key);
    if (!field) continue;
    if (field.isCore) {
      coreUpdates[fieldColumn(key)] = value;
    } else {
      customUpdates[key] = value;
      hasCustom = true;
    }
  }

  if (Object.keys(coreUpdates).length === 0 && !hasCustom) return;

  const payload = hasCustom ? { ...coreUpdates, custom: customUpdates } : coreUpdates;
  await supabase.from("leads").update(payload).eq("id", leadId);
}
