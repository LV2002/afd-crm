"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { writeAuditLog } from "@/lib/audit/log";
import { can, getCurrentUser } from "@/lib/auth/session";
import { reportActionFailure } from "@/lib/errors/action-failure";
import { createClient } from "@/lib/supabase/server";

export interface RetargetingSettingsState {
  error?: string;
  success?: string;
}

/**
 * Up to ten years, which is not a real setting so much as a bound: a
 * number typed into a box ends up in a date calculation, and
 * `windowDays: 1e9` would be a silent "no cutoff" that nobody chose. 0 is
 * the honest way to say "every lead ever" and is spelled out on the form.
 */
const schema = z.object({
  retargetingWindowDays: z.coerce
    .number({ message: "Enter a number of days." })
    .int("Enter a whole number of days.")
    .min(0, "Use 0 for no cutoff.")
    .max(3650, "Ten years is the maximum. Use 0 for no cutoff at all."),
});

export async function updateRetargetingSettings(
  _prevState: RetargetingSettingsState,
  formData: FormData,
): Promise<RetargetingSettingsState> {
  try {
    return await run(formData);
  } catch (error) {
    return {
      error: await reportActionFailure("action:updateRetargetingSettings", error, {
        fallback: "Could not save that. The problem has been reported.",
        revealMessage: true,
      }),
    };
  }
}

async function run(formData: FormData): Promise<RetargetingSettingsState> {
  const user = await getCurrentUser();
  if (!user || !can(user, "settings.manage")) {
    return { error: "You don't have permission to do that." };
  }

  const parsed = schema.safeParse({
    retargetingWindowDays: formData.get("retargetingWindowDays"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const days = parsed.data.retargetingWindowDays;
  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("org_settings")
    .select("id, retargeting_window_days")
    .limit(1)
    .maybeSingle<{ id: string; retargeting_window_days: number }>();

  if (!existing) {
    // The singleton row is written by the seed script. Without it there is
    // nothing to update, and inserting a half-filled organisation here
    // would be worse than saying so.
    return { error: "Organisation settings have not been set up yet — run the seed first." };
  }

  const { error } = await supabase
    .from("org_settings")
    .update({ retargeting_window_days: days, updated_at: new Date().toISOString() })
    .eq("id", existing.id);

  if (error) return { error: `Could not save that: ${error.message}` };

  await writeAuditLog(supabase, {
    actorId: user.id,
    action: "org_settings.update",
    entityType: "org_settings",
    entityId: existing.id,
    before: { retargeting_window_days: existing.retargeting_window_days },
    after: { retargeting_window_days: days },
  });

  revalidatePath("/settings/integrations");

  return {
    success:
      days === 0
        ? "Saved. Every consenting lead will be kept in the retargeting audiences, with no cutoff."
        : `Saved. Leads active within the last ${days} days will be kept in the retargeting audiences.`,
  };
}
