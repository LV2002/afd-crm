/**
 * The single formatINR() helper CLAUDE.md requires ("Money: bigint paise.
 * Format with a single formatINR() helper.") — Phase 4 is the first
 * feature to put money in front of a user, so this didn't exist until now.
 */
export function formatINR(paise: number): string {
  const rupees = paise / 100;
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: rupees % 1 === 0 ? 0 : 2,
  }).format(rupees);
}

/** Parses a rupees-denominated form input into paise. Returns null for anything not a non-negative number. */
export function parseRupeesToPaise(value: FormDataEntryValue | null): number | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  const rupees = Number(value);
  if (!Number.isFinite(rupees) || rupees < 0) return null;
  return Math.round(rupees * 100);
}
