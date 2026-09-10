import "server-only";

import { cache } from "react";

import { createSignedUrl } from "@/lib/storage/attachments";
import { createClient } from "@/lib/supabase/server";

/**
 * Who the institute is, on paper.
 *
 * Settings → Organisation existed from the first week and reached almost
 * nothing: the name and logo appeared on two printouts, the brand colour
 * was read by no code at all, and there was no address, phone or GST
 * number in the system for a document to print even in principle. So the
 * fee agreement — the document a family signs about money — had the
 * brand, the tagline and the accent colour typed into its source, and
 * changing the logo in Settings changed nothing on it.
 *
 * Everything printed now reads from here, which is what makes the
 * settings screen worth filling in, and what makes CLAUDE.md's
 * plug-and-play test true of the paperwork as well as the database.
 *
 * `cache()` is per-request only — one read however many documents a page
 * assembles, never held between requests.
 */

export interface Brand {
  name: string;
  /** The name for a contract, when it differs from the name on the sign. */
  legalName: string | null;
  tagline: string | null;
  logoUrl: string | null;
  /** Hex. Used as the accent on every printed document. */
  primaryColor: string;
  addressLine: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  gstin: string | null;
  documentFooter: string | null;
}

const FALLBACK: Brand = {
  // A document that says "Your institute" is embarrassing exactly once,
  // and it is a far better prompt than a blank space where a name goes.
  name: "Your institute",
  legalName: null,
  tagline: null,
  logoUrl: null,
  primaryColor: "#0f172a",
  addressLine: null,
  city: null,
  state: null,
  pincode: null,
  phone: null,
  email: null,
  website: null,
  gstin: null,
  documentFooter: null,
};

export const getBrand = cache(async function getBrand(): Promise<Brand> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("org_settings")
    .select(
      "name, legal_name, tagline, logo_url, primary_color, address_line, city, state, pincode, phone, email, website, gstin, document_footer",
    )
    .limit(1)
    .maybeSingle();

  if (!data) return FALLBACK;

  return {
    name: data.name || FALLBACK.name,
    legalName: data.legal_name || null,
    tagline: data.tagline || null,
    logoUrl: await resolveLogo(supabase, data.logo_url),
    primaryColor: data.primary_color || FALLBACK.primaryColor,
    addressLine: data.address_line || null,
    city: data.city || null,
    state: data.state || null,
    pincode: data.pincode || null,
    phone: data.phone || null,
    email: data.email || null,
    website: data.website || null,
    gstin: data.gstin || null,
    documentFooter: data.document_footer || null,
  };
});

/**
 * A logo is either a link somebody pasted or a file somebody uploaded.
 *
 * Both are supported on purpose: the pasted URL was the only option
 * before this, and an institute that already has its logo on its own
 * website should not have to re-upload it. An uploaded file lives in the
 * private attachments bucket like everything else, so it needs a signed
 * URL minted here — an `<img>` cannot authenticate on its own.
 */
async function resolveLogo(
  supabase: Awaited<ReturnType<typeof createClient>>,
  value: string | null,
): Promise<string | null> {
  if (!value) return null;
  if (/^https?:\/\//i.test(value) || value.startsWith("data:")) return value;
  return createSignedUrl(supabase, value);
}

/**
 * The address as one line, skipping whatever is blank.
 *
 * Blank-skipping rather than placeholders: a letterhead reading
 * "Kochi, , 682001" looks worse than one that just reads "Kochi, 682001",
 * and an institute part-way through filling the settings in should not be
 * punished with a broken-looking document.
 */
export function formatAddress(brand: Brand): string {
  return [brand.addressLine, brand.city, brand.state, brand.pincode].filter(Boolean).join(", ");
}

/** Phone / email / website, in that order, joined for a one-line footer. */
export function contactLine(brand: Brand): string {
  return [brand.phone, brand.email, brand.website].filter(Boolean).join("  ·  ");
}

/**
 * The short code that prefixes a document's reference number — the "AFD"
 * in "AFD/FEE/2026/000123".
 *
 * Derived from the institute's name rather than stored, because it is not
 * a decision anybody wants to make twice: an institute that renames
 * itself wants the new initials, and nobody would remember to update a
 * separate field. The reference is a human-readable label around the
 * lead number, which is the actual key, so a prefix that changes with a
 * rename costs nothing.
 *
 * Initials of the first words for a multi-word name, the first letters
 * for a single word. Non-Latin names fall back rather than producing an
 * empty prefix.
 */
export function documentPrefix(name: string): string {
  const words = name
    .replace(/[^A-Za-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return "DOC";
  if (words.length === 1) return words[0].slice(0, 4).toUpperCase();
  return words
    .slice(0, 4)
    .map((word) => word[0])
    .join("")
    .toUpperCase();
}

/** True when there is enough here for a letterhead to be worth printing. */
export function hasLetterhead(brand: Brand): boolean {
  return Boolean(brand.logoUrl || formatAddress(brand) || contactLine(brand));
}
