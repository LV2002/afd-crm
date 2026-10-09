import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Which temperatures mean "still interested" — an admin's choice, not a
 * list in the code.
 *
 * This shipped as a hardcoded `["very_hot", "hot", "warm"]`, with a note
 * admitting the failure mode: a fifth temperature meaning "very keen"
 * would not be counted until somebody changed the code. Leon asked for
 * the tickbox the day after, which is the right instinct and what
 * CLAUDE.md § What is configurable says anyway — "could this system be
 * deployed for a completely different company by changing only database
 * contents?"
 *
 * ## Where the flag lives
 *
 * `dropdown_options.metadata.interested`, a boolean. `metadata` is a
 * jsonb column that has existed since the reference tables shipped, so
 * this needed no new column — and a per-option flag beats a list stored
 * somewhere else, because an option and the thing it means can then
 * never drift apart: delete the temperature and its flag goes with it.
 *
 * ## No fallback, deliberately
 *
 * If no temperature is ticked, nothing is counted and the tile reads
 * zero. Falling back to the old hardcoded three would mean an admin who
 * deliberately unticked everything got a number they had just switched
 * off — a screen quietly overruling the person configuring it. Migration
 * 0096 and the seed both tick Hot and Warm (and Very Hot where it
 * exists), so an existing instance reads exactly as it did yesterday.
 */

/** The flag's home, named once so the migration and the UI cannot disagree. */
export const INTERESTED_METADATA_KEY = "interested";

export function isInterestedOption(metadata: unknown): boolean {
  if (!metadata || typeof metadata !== "object") return false;
  return (metadata as Record<string, unknown>)[INTERESTED_METADATA_KEY] === true;
}

/**
 * The temperature values an admin has marked as interested.
 *
 * Inactive options are included on purpose. A temperature switched off
 * stops being offered on new leads, but the leads already carrying it
 * did not change, and dropping them from the count would make the figure
 * fall the moment somebody tidied the dropdown.
 */
export async function interestedTemperatures(
  supabase: SupabaseClient,
): Promise<Set<string>> {
  const { data } = await supabase
    .from("dropdown_options")
    .select("value, metadata")
    .eq("category", "temperature")
    .is("deleted_at", null)
    .returns<Array<{ value: string; metadata: unknown }>>();

  return new Set((data ?? []).filter((row) => isInterestedOption(row.metadata)).map((row) => row.value));
}

/**
 * The labels, for the sentence under the tiles.
 *
 * The card names what it counted so that a temperature nobody ticked
 * reads as a visible gap rather than a quietly low number — the same
 * reason the hardcoded version named its three.
 */
export async function interestedTemperatureLabels(
  supabase: SupabaseClient,
): Promise<string[]> {
  const { data } = await supabase
    .from("dropdown_options")
    .select("label, metadata, sort_order")
    .eq("category", "temperature")
    .is("deleted_at", null)
    .order("sort_order")
    .returns<Array<{ label: string; metadata: unknown; sort_order: number }>>();

  return (data ?? []).filter((row) => isInterestedOption(row.metadata)).map((row) => row.label);
}
