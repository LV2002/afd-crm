/**
 * Named, pre-approved discounts.
 *
 * The arithmetic is the sort that gets tested once on a ₹15,000 crash
 * course and ships wrong for the ₹2,00,000 consultancy: a percentage
 * with a cap, where the cap only bites at the top of the range.
 */
import { describe, expect, it } from "vitest";

import {
  describePromo,
  promoDiscountPaise,
  promoUsable,
  usablePromos,
  validatePromo,
  type Promo,
} from "../src/lib/enrolment/promos";

const money = (paise: number) => `₹${(paise / 100).toLocaleString("en-IN")}`;

function promo(overrides: Partial<Promo> = {}): Promo {
  return {
    id: "p1",
    name: "Early Bird",
    code: null,
    discountType: "percentage",
    percentValue: 10,
    fixedPaise: null,
    maxDiscountPaise: null,
    validFrom: null,
    validUntil: null,
    courses: [],
    centerIds: [],
    maxUses: null,
    usedCount: 0,
    isActive: true,
    ...overrides,
  };
}

const CONTEXT = { asOf: "2026-06-15", course: "Foundation", centerId: "c1" };

describe("promoDiscountPaise", () => {
  it("takes a percentage off", () => {
    expect(promoDiscountPaise(promo(), 85_000_00)).toBe(8_500_00);
  });

  it("applies the cap AFTER the percentage", () => {
    // "10% off, up to ₹10,000" has to mean what somebody reading it
    // thinks it means. On a ₹2,00,000 consultancy that is ₹10,000, not
    // ₹20,000.
    const capped = promo({ maxDiscountPaise: 10_000_00 });
    expect(promoDiscountPaise(capped, 2_00_000_00)).toBe(10_000_00);
    // And on a cheaper course the cap does not bite at all.
    expect(promoDiscountPaise(capped, 50_000_00)).toBe(5_000_00);
  });

  it("takes a fixed amount off", () => {
    const sibling = promo({ discountType: "fixed", percentValue: null, fixedPaise: 5_000_00 });
    expect(promoDiscountPaise(sibling, 85_000_00)).toBe(5_000_00);
  });

  it("never takes off more than the fee", () => {
    // A ₹5,000 sibling discount on a ₹3,000 workshop takes ₹3,000 off,
    // not ₹5,000 and a refund.
    const sibling = promo({ discountType: "fixed", percentValue: null, fixedPaise: 5_000_00 });
    expect(promoDiscountPaise(sibling, 3_000_00)).toBe(3_000_00);
  });

  it("is zero on a zero or negative fee rather than negative money", () => {
    expect(promoDiscountPaise(promo(), 0)).toBe(0);
    expect(promoDiscountPaise(promo(), -100)).toBe(0);
  });

  it("rounds to whole paise", () => {
    // 33% of ₹1,001.  Money is integer paise everywhere in this system.
    const odd = promo({ percentValue: 33 });
    expect(Number.isInteger(promoDiscountPaise(odd, 1_00_100))).toBe(true);
  });
});

describe("promoUsable", () => {
  it("accepts an offer that is running", () => {
    expect(promoUsable(promo(), CONTEXT)).toEqual({ ok: true });
  });

  it("gives a reason a counsellor can say out loud", () => {
    // "That offer ended on the 30th" is an answer. "Invalid" is not.
    const expired = promo({ validUntil: "2026-05-30" });
    const result = promoUsable(expired, CONTEXT);
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toContain("2026-05-30");
  });

  it("refuses an offer that hasn't started", () => {
    const future = promo({ validFrom: "2026-07-01" });
    expect(promoUsable(future, CONTEXT).ok).toBe(false);
  });

  it("accepts an offer on its first and last day", () => {
    // Inclusive both ends: an offer "until 30 June" is available on the
    // 30th, which is what everybody who reads it assumes.
    expect(promoUsable(promo({ validFrom: "2026-06-15" }), CONTEXT).ok).toBe(true);
    expect(promoUsable(promo({ validUntil: "2026-06-15" }), CONTEXT).ok).toBe(true);
  });

  it("refuses one that is switched off or used up", () => {
    expect(promoUsable(promo({ isActive: false }), CONTEXT).ok).toBe(false);
    expect(promoUsable(promo({ maxUses: 20, usedCount: 20 }), CONTEXT).ok).toBe(false);
    expect(promoUsable(promo({ maxUses: 20, usedCount: 19 }), CONTEXT).ok).toBe(true);
  });

  it("restricts by course and centre when the institute said so", () => {
    expect(promoUsable(promo({ courses: ["Foundation"] }), CONTEXT).ok).toBe(true);
    expect(promoUsable(promo({ courses: ["MDes"] }), CONTEXT).ok).toBe(false);
    expect(promoUsable(promo({ centerIds: ["c1"] }), CONTEXT).ok).toBe(true);
    expect(promoUsable(promo({ centerIds: ["c2"] }), CONTEXT).ok).toBe(false);
  });

  it("treats an empty restriction as 'everywhere', not 'nowhere'", () => {
    expect(promoUsable(promo({ courses: [], centerIds: [] }), CONTEXT).ok).toBe(true);
  });

  it("refuses a restricted offer when the course or centre is unknown", () => {
    // Failing closed: an admission with no centre yet must not quietly
    // qualify for a Kannur-only offer.
    const restricted = promo({ centerIds: ["c1"] });
    expect(promoUsable(restricted, { ...CONTEXT, centerId: null }).ok).toBe(false);
  });

  it("filters a whole list", () => {
    const list = [promo({ id: "a" }), promo({ id: "b", isActive: false })];
    expect(usablePromos(list, CONTEXT).map((p) => p.id)).toEqual(["a"]);
  });
});

describe("validatePromo", () => {
  it("passes a sensible offer", () => {
    expect(validatePromo(promo())).toEqual([]);
  });

  it("refuses a percentage that is zero, negative or over 100", () => {
    // Over 100% is a fee the institute pays the student.
    expect(validatePromo(promo({ percentValue: 0 })).length).toBeGreaterThan(0);
    expect(validatePromo(promo({ percentValue: 150 })).length).toBeGreaterThan(0);
  });

  it("refuses a fixed offer with no amount", () => {
    expect(
      validatePromo({ name: "x", discountType: "fixed", fixedPaise: 0 }).length,
    ).toBeGreaterThan(0);
  });

  it("refuses a cap on a fixed offer, which can only mislead", () => {
    const problems = validatePromo({
      name: "x",
      discountType: "fixed",
      fixedPaise: 5_000_00,
      maxDiscountPaise: 3_000_00,
    });
    expect(problems.some((problem) => problem.includes("cap"))).toBe(true);
  });

  it("refuses an offer that ends before it starts", () => {
    const problems = validatePromo(promo({ validFrom: "2026-07-01", validUntil: "2026-06-01" }));
    expect(problems.some((problem) => problem.includes("before it starts"))).toBe(true);
  });

  it("insists on a name", () => {
    expect(validatePromo(promo({ name: "  " })).length).toBeGreaterThan(0);
  });
});

describe("describePromo", () => {
  it("reads the way the offer would be written on a poster", () => {
    expect(describePromo(promo(), money)).toBe("10% off");
    expect(describePromo(promo({ maxDiscountPaise: 10_000_00 }), money)).toBe(
      "10% off, up to ₹10,000",
    );
    expect(
      describePromo(promo({ discountType: "fixed", percentValue: null, fixedPaise: 5_000_00 }), money),
    ).toBe("₹5,000 off");
  });
});
