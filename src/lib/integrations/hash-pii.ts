import { createHash } from "node:crypto";

/**
 * Meta Custom Audiences and Google Customer Match both require SHA-256 hex
 * digests of normalised identifiers, never raw PII — but their phone
 * normalisation rules genuinely differ, confirmed against each platform's
 * own docs: Meta wants digits-only with country code and no leading '+',
 * Google wants strict E.164 (leading '+' kept) before hashing. Getting
 * this wrong doesn't error — Meta/Google both silently accept a
 * wrongly-hashed value and just never match it to anyone, so the two are
 * kept as separate functions rather than one "normalize phone for
 * retargeting" that would be wrong for one platform by construction.
 * Email normalisation (trim + lowercase) is identical for both and shared.
 */
export function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function normalizePhoneForHash(e164Phone: string): string {
  return e164Phone.replace(/\D/g, "");
}

/** Google Customer Match wants E.164 kept intact (leading '+', country code, digits) rather than Meta's digits-only form. */
export function normalizePhoneE164ForHash(e164Phone: string): string {
  const trimmed = e164Phone.trim();
  const digits = trimmed.replace(/[^\d]/g, "");
  return trimmed.startsWith("+") ? `+${digits}` : digits;
}

export function normalizeEmailForHash(email: string): string {
  return email.trim().toLowerCase();
}

export function hashPhone(e164Phone: string): string {
  return sha256Hex(normalizePhoneForHash(e164Phone));
}

/** Google Customer Match variant of `hashPhone` — see `normalizePhoneE164ForHash`. */
export function hashPhoneE164(e164Phone: string): string {
  return sha256Hex(normalizePhoneE164ForHash(e164Phone));
}

export function hashEmail(email: string): string {
  return sha256Hex(normalizeEmailForHash(email));
}
