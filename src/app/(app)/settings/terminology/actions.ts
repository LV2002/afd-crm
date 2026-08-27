"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { writeAuditLog } from "@/lib/audit/log";
import { can, getCurrentUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { TERMINOLOGY_KEYS } from "@/lib/terminology/terms";

export interface TerminologyState {
  error?: string;
  success?: string;
}

const rowSchema = z.object({
  singular: z.string().trim().min(1),
  plural: z.string().trim().min(1),
});

export async function updateTerminology(
  _prevState: TerminologyState,
  formData: FormData,
): Promise<TerminologyState> {
  const user = await getCurrentUser();
  if (!user || !can(user, "settings.manage")) {
    return { error: "You don't have permission to do that." };
  }

  const supabase = await createClient();
  const updates: Array<{ key: string; singular: string; plural: string }> = [];

  for (const key of TERMINOLOGY_KEYS) {
    const parsed = rowSchema.safeParse({
      singular: formData.get(`${key}.singular`),
      plural: formData.get(`${key}.plural`),
    });
    if (!parsed.success) {
      return { error: `${key}: singular and plural labels are required.` };
    }
    updates.push({ key, ...parsed.data });
  }

  for (const update of updates) {
    const { error } = await supabase
      .from("terminology")
      .update({ singular: update.singular, plural: update.plural })
      .eq("key", update.key);
    if (error) {
      return { error: error.message };
    }
  }

  await writeAuditLog(supabase, {
    actorId: user.id,
    action: "terminology.update",
    entityType: "terminology",
    after: updates,
  });

  revalidatePath("/", "layout");
  return { success: "Saved." };
}
