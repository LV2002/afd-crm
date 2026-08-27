"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { writeAuditLog } from "@/lib/audit/log";
import { can, getCurrentUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export interface OrgSettingsState {
  error?: string;
  success?: string;
}

const schema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  logoUrl: z.string().trim().url("Must be a valid URL").optional().or(z.literal("")),
  primaryColor: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/, "Use a hex colour like #0f172a"),
  timezone: z.string().trim().min(1),
  currency: z.string().trim().length(3, "Use a 3-letter currency code").toUpperCase(),
  locale: z.string().trim().min(1),
});

export async function updateOrgSettings(
  _prevState: OrgSettingsState,
  formData: FormData,
): Promise<OrgSettingsState> {
  const user = await getCurrentUser();
  if (!user || !can(user, "settings.manage")) {
    return { error: "You don't have permission to do that." };
  }

  const parsed = schema.safeParse({
    name: formData.get("name"),
    logoUrl: formData.get("logoUrl"),
    primaryColor: formData.get("primaryColor"),
    timezone: formData.get("timezone"),
    currency: formData.get("currency"),
    locale: formData.get("locale"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const supabase = await createClient();

  const { data: existing } = await supabase.from("org_settings").select("id").limit(1).maybeSingle();

  const values = {
    name: parsed.data.name,
    logo_url: parsed.data.logoUrl || null,
    primary_color: parsed.data.primaryColor,
    timezone: parsed.data.timezone,
    currency: parsed.data.currency,
    locale: parsed.data.locale,
  };

  const { error } = existing
    ? await supabase.from("org_settings").update(values).eq("id", existing.id)
    : await supabase.from("org_settings").insert(values);

  if (error) {
    return { error: error.message };
  }

  await writeAuditLog(supabase, {
    actorId: user.id,
    action: "org_settings.update",
    entityType: "org_settings",
    entityId: existing?.id ?? null,
    after: values,
  });

  revalidatePath("/settings/organization");
  return { success: "Saved." };
}
