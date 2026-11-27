/**
 * What a WhatsApp message costs, and how to say so.
 *
 * Meta bills per delivered template message, by category, at a rate that
 * changes from time to time — so the rates are rows an admin can edit
 * (`whatsapp_rates`), not constants. Stored as an integer number of
 * ten-thousandths of a rupee (8631 = ₹0.8631) because a single message is
 * a fraction of a paisa and money never goes through a float here.
 *
 * Two caveats the screens say out loud: the figure for a plan is an upper
 * bound (a utility template sent inside someone's open 24-hour window is
 * free, and Meta does not charge for messages it fails to deliver), and the
 * authoritative number is what Meta bills, which the spend page shows once
 * Meta's delivery reports arrive.
 */
export type RateMap = Record<string, number>;

export const BILLING_CATEGORIES = ["marketing", "utility", "authentication", "service"] as const;
export type BillingCategory = (typeof BILLING_CATEGORIES)[number];

export const CATEGORY_LABELS: Record<string, string> = {
  marketing: "Marketing",
  utility: "Utility",
  authentication: "Authentication",
  service: "Service (replies)",
};

export function normaliseCategory(category: string | null | undefined): string {
  const value = (category ?? "").trim().toLowerCase();
  return value || "marketing";
}

/** The rate for a category in ten-thousandths of a rupee; an unknown category is charged as marketing, the dearest, so an estimate is never low by surprise. */
export function rateFor(rates: RateMap, category: string | null | undefined): number {
  const key = normaliseCategory(category);
  return rates[key] ?? rates.marketing ?? 0;
}

/** "0.8631" → 8631. Null for anything that is not a non-negative amount with at most four decimals. */
export function parseRate(input: string): number | null {
  const match = /^\s*(\d{1,4})(?:\.(\d{1,4}))?\s*$/.exec(input.replace(/^₹/, ""));
  if (!match) return null;
  const whole = Number(match[1]);
  const fraction = Number((match[2] ?? "").padEnd(4, "0"));
  return whole * 10_000 + fraction;
}

/** Rate for display: ₹0.8631. */
export function formatRate(tenThousandths: number): string {
  const whole = Math.floor(tenThousandths / 10_000);
  const fraction = String(tenThousandths % 10_000).padStart(4, "0");
  return `₹${whole}.${fraction}`;
}

/** A total for display, rounded to the paisa: ₹1,234.56. */
export function formatTotal(tenThousandths: number): string {
  const paise = Math.round(tenThousandths / 100);
  const rupees = Math.floor(paise / 100);
  const remainder = String(paise % 100).padStart(2, "0");
  return `₹${rupees.toLocaleString("en-IN")}.${remainder}`;
}

export interface CostEstimate {
  category: string;
  perMessage: number;
  messages: number;
  total: number;
}

export function estimateCost(category: string | null | undefined, messages: number, rates: RateMap): CostEstimate {
  const perMessage = rateFor(rates, category);
  return { category: normaliseCategory(category), perMessage, messages, total: perMessage * messages };
}

/**
 * Per-person cost of an automation: every template it can send, once. Branches
 * mean not everybody reaches every step, so this is the most one person can
 * cost. Free-form messages inside an open window cost nothing.
 */
export function flowCostPerPerson(
  steps: Array<{ kind: string; config: unknown }>,
  categoryByTemplate: Map<string, string>,
  rates: RateMap,
): { total: number; parts: Array<{ template: string; category: string; rate: number }> } {
  const parts: Array<{ template: string; category: string; rate: number }> = [];
  for (const step of steps) {
    if (step.kind !== "send_template") continue;
    const name = String((step.config as { templateName?: unknown } | null)?.templateName ?? "");
    if (!name) continue;
    const category = normaliseCategory(categoryByTemplate.get(name));
    parts.push({ template: name, category, rate: rateFor(rates, category) });
  }
  return { total: parts.reduce((sum, p) => sum + p.rate, 0), parts };
}
