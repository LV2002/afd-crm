import type { SupabaseClient } from "@supabase/supabase-js";

import { fieldColumn } from "@/lib/fields/field-column";
import type { FieldSchemaEntry } from "@/lib/fields/get-field-schema";
import { RESOLVE_INPUT_KEYS } from "@/lib/leads/importable-fields";
import type { TemperatureOption } from "@/lib/leads/temperature-kinds";

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
 * doesn't happen to hold `lead.update`, RLS drops these extra fields
 * rather than failing the row — the lead itself was already created
 * successfully.
 *
 * ## Returns what it could not do
 *
 * This used to discard the update's result, so a refused write cost the
 * lead EVERY extra field in the row — the follow-up date, the custom
 * fields, the status — with nothing said to the person who ran the
 * import. It returns warnings now, for the row's message.
 *
 * ## An imported status is held to the same rules as a typed one
 *
 * "Took admission" cannot be imported: it means an admission was
 * confirmed with a course, batch and fee, and a spreadsheet cell cannot
 * make that true — the database would refuse it. The lead is kept, at its
 * starting status, and the row says why. A closing outcome that must be
 * justified (Negative, Joined competitor) is recorded with the reason
 * "Other" and a note that it was carried over, because the alternative to
 * an honest placeholder is refusing every historic lead the old system
 * had already given up on.
 */
export async function writeExtraFields(
  supabase: SupabaseClient,
  leadId: string,
  values: Record<string, unknown>,
  fieldByKey: Map<string, FieldSchemaEntry>,
  statusByValue: Map<string, TemperatureOption>,
): Promise<string[]> {
  const warnings: string[] = [];
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

  const status =
    typeof coreUpdates.temperature === "string" ? statusByValue.get(coreUpdates.temperature) : undefined;
  if (status?.kind === "won") {
    delete coreUpdates.temperature;
    warnings.push(
      `"${status.label}" can't be imported — it needs a confirmed admission with course, batch and fee. The lead was added at its starting status; confirm the admission on its page.`,
    );
  } else if (status?.kind === "lost" && status.requiresReason) {
    coreUpdates.lost_reason = "other";
    coreUpdates.lost_reason_detail = "Carried over from the import file";
  }

  if (Object.keys(coreUpdates).length === 0 && !hasCustom) return warnings;

  const payload = hasCustom ? { ...coreUpdates, custom: customUpdates } : coreUpdates;
  const { error } = await supabase.from("leads").update(payload).eq("id", leadId);
  if (error) warnings.push(`Some details could not be saved on this lead: ${error.message}`);
  return warnings;
}
