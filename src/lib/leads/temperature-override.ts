import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * The columns that mark a temperature as a person's judgement, not a rule's.
 *
 * `docs/01-DATA-MODEL.md` § Temperature: a counsellor who has just spoken
 * to the student knows something the scoring rules do not, and that has to
 * beat the nightly recompute for a while or the cron silently overwrites
 * the edit on its next run. The window is an organisation setting, because
 * three days is right for one institute and a fortnight for another.
 *
 * Shared because there are now two ways to set it — the lead edit form and
 * the status bar at the top of a lead — and a version of this that
 * stamped the override in one place and not the other would look like the
 * cron randomly discarding half of a counsellor's work.
 */
export interface TemperatureOverride {
  temperature_override_until: string;
  temperature_set_by: string;
}

export async function temperatureOverrideFor(
  supabase: SupabaseClient,
  userId: string,
): Promise<TemperatureOverride> {
  const { data: org } = await supabase
    .from("org_settings")
    .select("temperature_override_days")
    .maybeSingle<{ temperature_override_days: number }>();

  const overrideDays = org?.temperature_override_days ?? 3;

  return {
    temperature_override_until: new Date(
      Date.now() + overrideDays * 24 * 60 * 60 * 1000,
    ).toISOString(),
    temperature_set_by: userId,
  };
}
