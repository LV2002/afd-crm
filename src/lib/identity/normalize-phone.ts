/**
 * The one phone normaliser, called at every write boundary — manual entry,
 * webhooks, CSV import, WhatsApp, calls. docs/03-V1-AUDIT.md D5: v1 had
 * three different ad hoc implementations that disagreed with each other
 * (`phone.replace("+","").replace(" ","")` in one path, raw user input
 * everywhere else), so `9847123456`, `+919847123456` and `919847123456`
 * were three different people to the dedupe check — the reason D1 (dropped
 * duplicates) was as damaging as it was.
 *
 * AFD India is India-only today, so a bare 10-digit mobile number is
 * assumed to be Indian and gets +91 prepended. Anything already carrying a
 * country code is normalised, not reinterpreted.
 *
 * Returns null for input that doesn't parse to a plausible E.164 number,
 * rather than throwing — a webhook payload with a garbled phone field
 * should still get persisted (docs' "verify, persist, then process"); it's
 * the caller's job to decide what an unparseable phone means for that
 * particular ingestion path.
 */
export function normalizePhone(input: string | null | undefined): string | null {
  if (!input) return null;

  // Strip everything but digits and a leading '+'.
  const trimmed = input.trim();
  const hasLeadingPlus = trimmed.startsWith("+");
  const digits = trimmed.replace(/\D/g, "");

  if (digits.length === 0) return null;

  let normalised: string;

  if (hasLeadingPlus) {
    normalised = `+${digits}`;
  } else if (digits.length === 10) {
    // Bare Indian mobile number, e.g. 9847123456.
    normalised = `+91${digits}`;
  } else if (digits.length === 11 && digits.startsWith("0")) {
    // Domestic dialing prefix, e.g. 09847123456.
    normalised = `+91${digits.slice(1)}`;
  } else if (digits.length === 12 && digits.startsWith("91")) {
    // Country code with no '+', e.g. 919847123456.
    normalised = `+${digits}`;
  } else if (digits.length === 14 && digits.startsWith("0091")) {
    normalised = `+91${digits.slice(4)}`;
  } else {
    // No confident interpretation — don't guess.
    return null;
  }

  // E.164: '+' followed by 8-15 digits.
  if (!/^\+\d{8,15}$/.test(normalised)) return null;

  return normalised;
}
