"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { writeAuditLog } from "@/lib/audit/log";
import { can, getCurrentUser } from "@/lib/auth/session";
import {
  ATTACHMENTS_BUCKET,
  MAX_FILE_BYTES,
  sanitiseFileName,
} from "@/lib/storage/shared";
import { createClient } from "@/lib/supabase/server";

export interface OrgSettingsState {
  error?: string;
  success?: string;
}

/** Blank is a real answer for every optional field — an institute fills these in over time. */
const optionalText = z.string().trim().max(200).optional().or(z.literal(""));

const schema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  legalName: optionalText,
  tagline: optionalText,
  // Either a link somebody pasted or a Storage key the upload below wrote.
  // Not `.url()` any more, for exactly that reason.
  logoUrl: z.string().trim().max(500).optional().or(z.literal("")),
  primaryColor: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/, "Use a hex colour like #0f172a"),
  addressLine: optionalText,
  city: optionalText,
  state: optionalText,
  pincode: optionalText,
  phone: optionalText,
  email: z.string().trim().email("That isn't an email address").optional().or(z.literal("")),
  website: optionalText,
  gstin: optionalText,
  documentFooter: z.string().trim().max(500).optional().or(z.literal("")),
  timezone: z.string().trim().min(1),
  currency: z.string().trim().length(3, "Use a 3-letter currency code").toUpperCase(),
  locale: z.string().trim().min(1),
});

/** Images only. A PDF logo would render as a broken image on every document. */
const LOGO_MIME_TYPES = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"];

/**
 * Puts the uploaded logo in Storage and returns its key.
 *
 * Runs on the caller's own client, never the service role: the object
 * policy added in migration 0064 checks `settings.manage` in Postgres, so
 * the security decision is made there rather than here (CLAUDE.md § 3).
 *
 * A fresh key each time rather than a fixed `brand/logo.png`, because the
 * old one may still be sitting in a browser cache or a signed URL, and a
 * logo that changes to the previous logo for ten minutes looks like a bug.
 */
async function storeLogo(
  supabase: Awaited<ReturnType<typeof createClient>>,
  file: File,
): Promise<{ path?: string; error?: string }> {
  if (file.size > MAX_FILE_BYTES) {
    return { error: `That file is ${(file.size / 1024 / 1024).toFixed(1)} MB. The limit is 20 MB.` };
  }
  if (!LOGO_MIME_TYPES.includes(file.type)) {
    return { error: "A logo has to be a PNG, JPG, WebP or SVG." };
  }

  const path = `brand/${crypto.randomUUID()}-${sanitiseFileName(file.name)}`;
  const { error } = await supabase.storage
    .from(ATTACHMENTS_BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false });

  if (error) return { error: `Could not store the logo: ${error.message}` };
  return { path };
}

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
    legalName: formData.get("legalName"),
    tagline: formData.get("tagline"),
    logoUrl: formData.get("logoUrl"),
    primaryColor: formData.get("primaryColor"),
    addressLine: formData.get("addressLine"),
    city: formData.get("city"),
    state: formData.get("state"),
    pincode: formData.get("pincode"),
    phone: formData.get("phone"),
    email: formData.get("email"),
    website: formData.get("website"),
    gstin: formData.get("gstin"),
    documentFooter: formData.get("documentFooter"),
    timezone: formData.get("timezone"),
    currency: formData.get("currency"),
    locale: formData.get("locale"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const supabase = await createClient();

  // An uploaded file wins over whatever is in the URL box: somebody who
  // just chose a file meant that, not the link they pasted last year.
  const upload = formData.get("logoFile");
  let logoValue = parsed.data.logoUrl || null;
  if (upload instanceof File && upload.size > 0) {
    const stored = await storeLogo(supabase, upload);
    if (stored.error) return { error: stored.error };
    logoValue = stored.path ?? logoValue;
  }

  const { data: existing } = await supabase.from("org_settings").select("id").limit(1).maybeSingle();

  const values = {
    name: parsed.data.name,
    legal_name: parsed.data.legalName || null,
    tagline: parsed.data.tagline || null,
    logo_url: logoValue,
    primary_color: parsed.data.primaryColor,
    address_line: parsed.data.addressLine || null,
    city: parsed.data.city || null,
    state: parsed.data.state || null,
    pincode: parsed.data.pincode || null,
    phone: parsed.data.phone || null,
    email: parsed.data.email || null,
    website: parsed.data.website || null,
    gstin: parsed.data.gstin || null,
    document_footer: parsed.data.documentFooter || null,
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

  // Every printed document reads these, so they all have to re-render.
  revalidatePath("/settings/organization");
  revalidatePath("/", "layout");
  return { success: "Saved. Every printed document picks this up straight away." };
}
