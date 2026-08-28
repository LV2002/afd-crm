/**
 * CLAUDE.md non-negotiable #6: full phone numbers are never exposed to
 * counsellors in bulk. Masked in list view (`+91 98••••3456`), full only
 * on the detail page after an audited reveal (see actions.ts's
 * revealLeadPhone).
 */
export function maskPhone(e164: string | null | undefined): string {
  if (!e164) return "—";

  const match = /^\+(\d+)$/.exec(e164);
  if (!match) return e164; // not recognisable E.164 -- show as-is rather than mangling it

  const digits = match[1];
  if (digits.length <= 6) return e164; // too short to mask meaningfully

  if (digits.startsWith("91") && digits.length === 12) {
    const national = digits.slice(2); // 10 national digits
    return `+91 ${national.slice(0, 2)}••••${national.slice(6)}`;
  }

  // Generic fallback for a non-Indian number: same shape, without assuming
  // where that country's code ends.
  return `+${digits.slice(0, 2)}••••${digits.slice(-4)}`;
}
