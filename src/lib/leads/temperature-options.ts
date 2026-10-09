import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  sortTemperatures,
  toTemperatureOption,
  type TemperatureOption,
} from "./temperature-kinds";

/**
 * The status options, loaded and unpacked.
 *
 * Two loaders because the application reaches the database two ways
 * (CLAUDE.md non-negotiable #3): the user's own client, scoped by RLS, for
 * anything a browser session triggers — this file; and the direct client
 * for cron jobs, webhooks and the ingestion path — `temperature-options-direct.ts`.
 * Both return the same thing.
 *
 * Separate files, not one, because importing the direct client opens a
 * database connection's worth of requirements (a DATABASE_URL, at import
 * time). A screen or a test that only needs the RLS-scoped loader should
 * not inherit that.
 *
 * **Inactive options are included on purpose.** An option switched off
 * stops being OFFERED on a lead, but the leads already carrying it did not
 * change — and the question most callers are asking ("is this lead still
 * being worked?") must keep answering correctly for them. Dropping a
 * retired value from the list would make every lead that carries it look
 * unclassified. Callers that populate a picker filter on `isActive`.
 */

interface OptionRow {
  value: string;
  label: string;
  color: string | null;
  sort_order: number;
  is_active: boolean;
  metadata: unknown;
}

export async function loadTemperatureOptions(supabase: SupabaseClient): Promise<TemperatureOption[]> {
  const { data } = await supabase
    .from("dropdown_options")
    .select("value, label, color, sort_order, is_active, metadata")
    .eq("category", "temperature")
    .is("deleted_at", null)
    .returns<OptionRow[]>();

  return sortTemperatures((data ?? []).map(toTemperatureOption));
}
