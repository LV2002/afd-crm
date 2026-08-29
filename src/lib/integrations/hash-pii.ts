import { createHash } from "node:crypto";

/**
 * Meta Custom Audiences and Google Customer Match both require SHA-256
 * hex digests of normalised identifiers, never raw PII — normalisation
 * rules are identical between the two platforms (documented by both):
 * phone as digits-only with country code, no leading '+'; email
 * lowercased and trimmed.
 */
export function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function normalizePhoneForHash(e164Phone: string): string {
  return e164Phone.replace(/\D/g, "");
}

export function normalizeEmailForHash(email: string): string {
  return email.trim().toLowerCase();
}

export function hashPhone(e164Phone: string): string {
  return sha256Hex(normalizePhoneForHash(e164Phone));
}

export function hashEmail(email: string): string {
  return sha256Hex(normalizeEmailForHash(email));
}
