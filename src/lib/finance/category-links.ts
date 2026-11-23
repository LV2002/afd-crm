/**
 * What a finance category asks for when a bank line is filed under it.
 *
 * Read from the category's own row in `dropdown_options` (`metadata`), so an
 * admin decides which categories need a person or a month, not a deploy:
 *
 *   links:       "enrolment" — a student's fee; recorded on their profile
 *                "student"   — tagged to a student, with no fee record (a fine)
 *                "employee"  — pays that person's payslip
 *   asksPeriod:  offer a "for the month of" field (rent, GST, ad spend)
 */

export type CategoryLink = "enrolment" | "student" | "employee";

export interface CategoryRule {
  label: string;
  link: CategoryLink | null;
  asksPeriod: boolean;
}

const LINKS: readonly CategoryLink[] = ["enrolment", "student", "employee"];

export function ruleFromMetadata(label: string, metadata: Record<string, unknown> | null | undefined): CategoryRule {
  const raw = metadata?.links;
  const link = typeof raw === "string" && (LINKS as readonly string[]).includes(raw) ? (raw as CategoryLink) : null;
  return { label, link, asksPeriod: metadata?.asksPeriod === true };
}

/** 'YYYY-MM' for a bank line's date: the month the money moved, offered as the default "for the month of". */
export function monthOf(isoDate: string): string {
  return isoDate.slice(0, 7);
}

export function isPeriod(value: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

/** How the money arrived, guessed from the bank's narration, for the student's payment record. */
export function methodFromNarration(narration: string): "upi" | "neft" | "cheque" | "card" | "cash" | "other" {
  const n = narration.trim().toUpperCase();
  if (/^UPI\b|^UPI-|\bUPI\b/.test(n)) return "upi";
  if (/\b(NEFT|IMPS|RTGS|NFT|FT-?)\b|^FTIMPS/.test(n)) return "neft";
  if (/\b(CHQ|CHEQUE|CLG)\b/.test(n)) return "cheque";
  if (/\b(POS|CARD)\b/.test(n)) return "card";
  if (/\b(CASH|CDM)\b/.test(n)) return "cash";
  return "other";
}
