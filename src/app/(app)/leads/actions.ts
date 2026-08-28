"use server";

import { writeAuditLog } from "@/lib/audit/log";
import { can, getCurrentUser } from "@/lib/auth/session";
import { fieldColumn, getRawFieldValue } from "@/lib/fields/field-column";
import { getFieldSchema } from "@/lib/fields/get-field-schema";
import { formatFieldValue } from "@/lib/fields/format-field-value";
import {
  OPTION_BEARING_TYPES,
  resolveFieldOptions,
  type FieldOption,
} from "@/lib/fields/resolve-field-options";
import { applyLeadFilters, type LeadFilterValues } from "@/lib/leads/apply-filters";
import { maskPhone } from "@/lib/leads/mask-phone";
import { createClient } from "@/lib/supabase/server";

interface RevealPhoneResult {
  primaryPhone: string | null;
  alternatePhone: string | null;
  parentPhone: string | null;
  error?: string;
}

/**
 * CLAUDE.md non-negotiable #6: revealing a full phone number is always
 * audited. This is the only path a full number reaches the browser outside
 * a lead's own detail page — the list always renders maskPhone()'s output.
 */
export async function revealLeadPhone(leadId: string): Promise<RevealPhoneResult> {
  const user = await getCurrentUser();
  if (!user || !can(user, "lead.reveal_phone")) {
    return { primaryPhone: null, alternatePhone: null, parentPhone: null, error: "Not permitted" };
  }

  const supabase = await createClient();
  const { data: lead, error } = await supabase
    .from("leads")
    .select("id, primary_phone, alternate_phone, parent_phone")
    .eq("id", leadId)
    .maybeSingle<{
      id: string;
      primary_phone: string;
      alternate_phone: string | null;
      parent_phone: string | null;
    }>();

  // A miss here means RLS didn't let the query see the row (out of the
  // caller's own/center/all scope) or the id is bad — either way, nothing
  // to reveal and nothing to audit.
  if (error || !lead) {
    return { primaryPhone: null, alternatePhone: null, parentPhone: null, error: "Lead not found" };
  }

  await writeAuditLog(supabase, {
    actorId: user.id,
    action: "lead.reveal_phone",
    entityType: "leads",
    entityId: lead.id,
  });

  return {
    primaryPhone: lead.primary_phone,
    alternatePhone: lead.alternate_phone,
    parentPhone: lead.parent_phone,
  };
}

export interface ExportLeadsResult {
  csv?: string;
  filename?: string;
  error?: string;
}

/** Defensive cap, not a real limit at AFD's current ~200 leads/month volume — see docs/DECISIONS.md. */
const EXPORT_ROW_LIMIT = 5000;

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

/**
 * CLAUDE.md non-negotiable #5 ("every export writes to audit_log") and #6
 * (phone numbers masked unless the exporter holds lead.reveal_phone — an
 * export is a bulk reveal either way, so it's covered by the same
 * permission as a single-row reveal, not a separate one).
 */
export async function exportLeadsCsv(filterValues: LeadFilterValues): Promise<ExportLeadsResult> {
  const user = await getCurrentUser();
  if (!user || !can(user, "lead.export")) {
    return { error: "Not permitted" };
  }

  const supabase = await createClient();
  const fields = await getFieldSchema(supabase, "lead", user);
  const canRevealPhone = can(user, "lead.reveal_phone");

  const optionsByKey: Record<string, FieldOption[]> = {};
  for (const field of fields) {
    if (OPTION_BEARING_TYPES.has(field.type)) {
      optionsByKey[field.key] = await resolveFieldOptions(supabase, field);
    }
  }

  // Core fields are real columns; any custom field (is_core: false) lives
  // inside the `custom` jsonb blob instead — see field-column.ts. Selecting
  // a column literally named after a custom key would fail outright.
  const coreColumns = fields.filter((f) => f.isCore).map((f) => fieldColumn(f.key));
  const needsCustomColumn = fields.some((f) => !f.isCore);
  const selectColumns = Array.from(
    new Set(["id", ...coreColumns, ...(needsCustomColumn ? ["custom"] : [])]),
  ).join(", ");

  let query = supabase
    .from("leads")
    .select(selectColumns)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(EXPORT_ROW_LIMIT);
  query = applyLeadFilters(query, fields.filter((f) => f.showInFilters), filterValues);

  const { data: rows, error } = await query.returns<Array<Record<string, unknown>>>();
  if (error) {
    return { error: error.message };
  }

  const header = fields.map((f) => csvEscape(f.label)).join(",");
  const lines = (rows ?? []).map((row) =>
    fields
      .map((field) => {
        const value = getRawFieldValue(field, row);
        if (field.type === "phone" && !canRevealPhone) {
          return csvEscape(maskPhone(value as string | null));
        }
        return csvEscape(formatFieldValue(field, value, optionsByKey));
      })
      .join(","),
  );
  const csv = [header, ...lines].join("\n");

  await writeAuditLog(supabase, {
    actorId: user.id,
    action: "lead.export",
    entityType: "leads",
    after: { count: rows?.length ?? 0, filters: filterValues, phonesRevealed: canRevealPhone },
  });

  const filename = `leads-export-${new Date().toISOString().slice(0, 10)}.csv`;
  return { csv, filename };
}
