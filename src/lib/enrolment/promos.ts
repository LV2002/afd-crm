/**
 * Named, pre-approved discounts.
 *
 * "Early Bird 10% until 30 June", "Sibling ₹5,000", "Staff Ward 25%" —
 * the discounts an institute has already decided to give, as opposed to
 * the ones a counsellor negotiates in the room. `docs/01-DATA-MODEL.md`
 * has had `promos` in it since the beginning and nothing has ever
 * implemented it.
 *
 * ## Why this is more than a saved number
 *
 * A promo is **pre-approved by definition**. The institute decided on it
 * in advance, wrote down its cap and its expiry, and put it in a list —
 * so a counsellor applying one is not exercising personal authority and
 * should not have to ask for approval. That is the entire reason promos
 * are worth building rather than telling people to type 10% by hand: it
 * is the difference between "the discount you are allowed to give" and
 * "the discount the institute is offering".
 *
 * What a promo cannot do is exceed its own terms. The cap, the dates and
 * the course and centre it applies to are the institute's decision, and
 * they are checked here rather than trusted to whoever is filling in the
 * fee panel.
 *
 * Pure and tested: this is money, computed from a percentage, with a cap
 * that only matters on expensive courses — exactly the arithmetic that
 * gets tested once at ₹15,000 and ships wrong for the ₹2,00,000
 * consultancy.
 */

export type PromoDiscountType = "percentage" | "fixed";

export interface Promo {
  id: string;
  name: string;
  /** Optional short code somebody quotes on the phone. Not required. */
  code: string | null;
  discountType: PromoDiscountType;
  /** Percent (0–100) for a percentage promo. Ignored for a fixed one. */
  percentValue: number | null;
  /** The amount off, in paise, for a fixed promo. Ignored for a percentage one. */
  fixedPaise: number | null;
  /** Ceiling on a percentage promo. Null means no ceiling. */
  maxDiscountPaise: number | null;
  /** `yyyy-MM-dd`, inclusive. Null means no start or no end. */
  validFrom: string | null;
  validUntil: string | null;
  /** Empty means every course / every centre. */
  courses: string[];
  centerIds: string[];
  /** Null means unlimited. */
  maxUses: number | null;
  usedCount: number;
  isActive: boolean;
}

export interface PromoContext {
  /** `yyyy-MM-dd` in Asia/Kolkata — the institute's today, not the server's. */
  asOf: string;
  course: string | null;
  centerId: string | null;
}

/**
 * What this promo takes off this fee.
 *
 * The cap is applied AFTER the percentage, which is the only order that
 * makes "10% off, up to ₹10,000" mean what a person reading it thinks it
 * means. It is also never more than the fee — a ₹5,000 sibling discount
 * on a ₹3,000 workshop takes ₹3,000 off, not ₹5,000 and a refund.
 */
export function promoDiscountPaise(promo: Promo, totalFeePaise: number): number {
  if (totalFeePaise <= 0) return 0;

  let discount =
    promo.discountType === "percentage"
      ? Math.round((totalFeePaise * (promo.percentValue ?? 0)) / 100)
      : (promo.fixedPaise ?? 0);

  if (promo.maxDiscountPaise !== null) discount = Math.min(discount, promo.maxDiscountPaise);
  return Math.max(0, Math.min(discount, totalFeePaise));
}

/**
 * Whether this promo may be used here, and if not, why.
 *
 * The reason is returned rather than a bare false because every one of
 * these is something a counsellor will be told on the phone and needs to
 * be able to explain: "that offer ended on the 30th" is an answer,
 * "invalid" is not.
 */
export function promoUsable(
  promo: Promo,
  context: PromoContext,
): { ok: true } | { ok: false; reason: string } {
  if (!promo.isActive) return { ok: false, reason: "This offer is switched off." };

  if (promo.validFrom && context.asOf < promo.validFrom) {
    return { ok: false, reason: `This offer starts on ${promo.validFrom}.` };
  }
  if (promo.validUntil && context.asOf > promo.validUntil) {
    return { ok: false, reason: `This offer ended on ${promo.validUntil}.` };
  }
  if (promo.maxUses !== null && promo.usedCount >= promo.maxUses) {
    return { ok: false, reason: "This offer has been used up." };
  }
  if (promo.courses.length > 0 && (!context.course || !promo.courses.includes(context.course))) {
    return { ok: false, reason: "This offer doesn't apply to that course." };
  }
  if (
    promo.centerIds.length > 0 &&
    (!context.centerId || !promo.centerIds.includes(context.centerId))
  ) {
    return { ok: false, reason: "This offer doesn't apply at that centre." };
  }

  return { ok: true };
}

export function usablePromos(promos: Promo[], context: PromoContext): Promo[] {
  return promos.filter((promo) => promoUsable(promo, context).ok);
}

/**
 * What is wrong with a promo as somebody has filled it in.
 *
 * Checked before it can be saved, because a promo with no value is a
 * discount of nothing that looks like a discount, and a percentage over
 * 100 is a fee the institute pays the student.
 */
export function validatePromo(promo: Partial<Promo>): string[] {
  const problems: string[] = [];

  if (!promo.name?.trim()) problems.push("Give the offer a name.");

  if (promo.discountType === "percentage") {
    const percent = promo.percentValue ?? 0;
    if (percent <= 0) problems.push("A percentage offer needs a percentage above zero.");
    if (percent > 100) problems.push("A percentage offer cannot be more than 100%.");
  } else if (promo.discountType === "fixed") {
    if ((promo.fixedPaise ?? 0) <= 0) problems.push("A fixed offer needs an amount above zero.");
    if (promo.maxDiscountPaise !== null && promo.maxDiscountPaise !== undefined) {
      // A cap on a fixed amount is either the same number or a smaller
      // one pretending to be the amount. Either way it misleads.
      problems.push("A cap only makes sense on a percentage offer.");
    }
  }

  if (promo.validFrom && promo.validUntil && promo.validUntil < promo.validFrom) {
    problems.push("The offer cannot end before it starts.");
  }
  if (promo.maxUses !== null && promo.maxUses !== undefined && promo.maxUses < 1) {
    problems.push("A usage limit has to be at least one.");
  }

  return problems;
}

/** "10% off, up to ₹10,000" / "₹5,000 off" — how the offer reads on screen. */
export function describePromo(promo: Promo, formatMoney: (paise: number) => string): string {
  if (promo.discountType === "fixed") return `${formatMoney(promo.fixedPaise ?? 0)} off`;
  const cap = promo.maxDiscountPaise ? `, up to ${formatMoney(promo.maxDiscountPaise)}` : "";
  return `${promo.percentValue ?? 0}% off${cap}`;
}
