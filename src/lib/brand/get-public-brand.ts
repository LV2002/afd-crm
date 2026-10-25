import "server-only";

import { db } from "@/lib/db/client";
import { orgSettings } from "@/lib/db/schema";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { ATTACHMENTS_BUCKET } from "@/lib/storage/shared";

import type { Brand } from "./get-brand";

/**
 * The brand, for pages nobody is signed in to see — the student's own
 * profile form, opened from a link on their phone.
 *
 * `getBrand()` reads through the visitor's session, and an anonymous visitor
 * has none: org_settings is not readable to them and an uploaded logo sits in
 * a private bucket. So this reads on the direct connection like the rest of
 * the token-gated form, and signs the logo with the service-role client —
 * for that one file, for one hour, and nothing else. Only fields already
 * printed on every receipt are returned; no GSTIN, no internal settings.
 */
export type PublicBrand = Pick<
  Brand,
  "name" | "tagline" | "logoUrl" | "primaryColor" | "phone" | "email" | "website"
>;

const FALLBACK: PublicBrand = {
  name: "AFD India",
  tagline: null,
  logoUrl: null,
  primaryColor: "#0f172a",
  phone: null,
  email: null,
  website: null,
};

const HEX = /^#[0-9a-fA-F]{6}$/;

export async function getPublicBrand(): Promise<PublicBrand> {
  const [row] = await db
    .select({
      name: orgSettings.name,
      tagline: orgSettings.tagline,
      logo: orgSettings.logoUrl,
      primaryColor: orgSettings.primaryColor,
      phone: orgSettings.phone,
      email: orgSettings.email,
      website: orgSettings.website,
    })
    .from(orgSettings)
    .limit(1);

  if (!row) return FALLBACK;

  return {
    name: row.name || FALLBACK.name,
    tagline: row.tagline || null,
    logoUrl: await resolveLogo(row.logo),
    primaryColor: HEX.test(row.primaryColor) ? row.primaryColor : FALLBACK.primaryColor,
    phone: row.phone || null,
    email: row.email || null,
    website: row.website || null,
  };
}

async function resolveLogo(value: string | null): Promise<string | null> {
  if (!value) return null;
  if (/^https?:\/\//i.test(value) || value.startsWith("data:")) return value;
  try {
    const { data } = await createServiceRoleClient()
      .storage.from(ATTACHMENTS_BUCKET)
      .createSignedUrl(value, 3600);
    return data?.signedUrl ?? null;
  } catch {
    // A missing service key must not take the whole form down.
    return null;
  }
}
