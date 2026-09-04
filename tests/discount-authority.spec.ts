/**
 * Who may give away how much.
 *
 * `discount.approve` has existed as a permission since Phase 4 and nothing
 * enforced it — a counsellor could type any figure into the discount box.
 * These are the rules that check was always meant to have, and they decide
 * what a student is charged, so they get worked examples.
 *
 * The two that matter most: a role with no limit configured has NO
 * authority rather than unlimited authority, and a discount that was
 * approved at ₹5,000 cannot quietly become ₹25,000 afterwards.
 */
import { describe, expect, it } from "vitest";

import {
  NO_AUTHORITY,
  canApprove,
  checkAuthority,
  describeLimit,
  discountPercent,
  resolveDiscount,
  type DiscountLimit,
} from "../src/lib/enrolment/discount-authority";

const RUPEE = 100;
const FEE = 100_000 * RUPEE; // A ₹1,00,000 course, which most of these use.

function limit(overrides: Partial<DiscountLimit> = {}): DiscountLimit {
  return { maxPercent: 10, maxAmountPaise: null, isUnlimited: false, ...overrides };
}

describe("discountPercent", () => {
  it("is the discount over the fee", () => {
    expect(discountPercent(FEE, 10_000 * RUPEE)).toBe(10);
    expect(discountPercent(FEE, 12_500 * RUPEE)).toBe(12.5);
  });

  it("is zero for no discount", () => {
    expect(discountPercent(FEE, 0)).toBe(0);
  });

  it("treats a discount against no fee as total relief, not as zero", () => {
    // A fee plan mid-edit can have no course fee typed yet. Reporting 0%
    // there would wave any discount through as within everybody's limit.
    expect(discountPercent(0, 5_000 * RUPEE)).toBe(100);
  });
});

describe("checkAuthority", () => {
  it("lets a discount inside the percentage through", () => {
    const result = checkAuthority(limit({ maxPercent: 10 }), FEE, 8_000 * RUPEE);
    expect(result.withinAuthority).toBe(true);
    expect(result.reason).toBeNull();
  });

  it("allows exactly the limit", () => {
    expect(checkAuthority(limit({ maxPercent: 10 }), FEE, 10_000 * RUPEE).withinAuthority).toBe(true);
  });

  it("stops a discount over the percentage and says by how much", () => {
    const result = checkAuthority(limit({ maxPercent: 10 }), FEE, 15_000 * RUPEE);
    expect(result.withinAuthority).toBe(false);
    expect(result.percent).toBe(15);
    expect(result.reason).toMatch(/15% is over the 10%/);
  });

  it("applies BOTH ceilings when both are set", () => {
    // The case a percentage alone misses: 10% of a ₹2,00,000 consultancy
    // is ₹20,000 walking out of the door unnoticed.
    const capped = limit({ maxPercent: 10, maxAmountPaise: 5_000 * RUPEE });
    const bigCourse = 200_000 * RUPEE;

    expect(checkAuthority(capped, bigCourse, 20_000 * RUPEE).withinAuthority).toBe(false);
    expect(checkAuthority(capped, bigCourse, 5_000 * RUPEE).withinAuthority).toBe(true);
  });

  it("applies the percentage even when the cash cap is satisfied", () => {
    // The case a cash cap alone misses: ₹5,000 off a ₹15,000 crash course
    // is a third of the fee.
    const capped = limit({ maxPercent: 10, maxAmountPaise: 5_000 * RUPEE });
    expect(checkAuthority(capped, 15_000 * RUPEE, 5_000 * RUPEE).withinAuthority).toBe(false);
  });

  it("lets an unlimited role give anything", () => {
    const admin = limit({ maxPercent: 0, maxAmountPaise: 0, isUnlimited: true });
    expect(checkAuthority(admin, FEE, 90_000 * RUPEE).withinAuthority).toBe(true);
  });

  it("treats a role with no configured limit as having no authority", () => {
    // Failing closed is the point. A role created next year must not be
    // able to give money away because its limit was never filled in.
    expect(checkAuthority(NO_AUTHORITY, FEE, 1 * RUPEE).withinAuthority).toBe(false);
    expect(checkAuthority(NO_AUTHORITY, FEE, 1 * RUPEE).reason).toMatch(/cannot approve discounts/);
  });

  it("never asks for approval of no discount at all", () => {
    // Otherwise every ordinary fee plan would queue behind an approver.
    expect(checkAuthority(NO_AUTHORITY, FEE, 0).withinAuthority).toBe(true);
    expect(checkAuthority(NO_AUTHORITY, FEE, 0).reason).toBeNull();
  });
});

describe("resolveDiscount", () => {
  it("applies a discount inside authority and leaves nothing pending", () => {
    const outcome = resolveDiscount({
      limit: limit({ maxPercent: 10 }),
      totalFeePaise: FEE,
      requestedPaise: 5_000 * RUPEE,
      alreadyApprovedPaise: 0,
    });
    expect(outcome.appliedDiscountPaise).toBe(5_000 * RUPEE);
    expect(outcome.pendingDiscountPaise).toBeNull();
    expect(outcome.needsApproval).toBe(false);
  });

  it("does NOT apply a discount above authority", () => {
    // The core of the feature. A pending discount that already reduces the
    // bill is one nobody has to hurry to approve.
    const outcome = resolveDiscount({
      limit: limit({ maxPercent: 10 }),
      totalFeePaise: FEE,
      requestedPaise: 25_000 * RUPEE,
      alreadyApprovedPaise: 0,
    });
    expect(outcome.appliedDiscountPaise).toBe(0);
    expect(outcome.pendingDiscountPaise).toBe(25_000 * RUPEE);
    expect(outcome.needsApproval).toBe(true);
    expect(outcome.reason).toMatch(/over the 10%/);
  });

  it("cannot be defeated by editing an approved discount upwards", () => {
    // Get ₹5,000 approved, then quietly make it ₹25,000. The extra is a
    // fresh request, and the ₹5,000 already granted stays granted.
    const outcome = resolveDiscount({
      limit: limit({ maxPercent: 10 }),
      totalFeePaise: FEE,
      requestedPaise: 25_000 * RUPEE,
      alreadyApprovedPaise: 5_000 * RUPEE,
    });
    expect(outcome.appliedDiscountPaise).toBe(5_000 * RUPEE);
    expect(outcome.pendingDiscountPaise).toBe(25_000 * RUPEE);
    expect(outcome.needsApproval).toBe(true);
  });

  it("lets an approved discount be REDUCED without asking anyone", () => {
    // The student paying more needs nobody's permission.
    const outcome = resolveDiscount({
      limit: limit({ maxPercent: 10 }),
      totalFeePaise: FEE,
      requestedPaise: 20_000 * RUPEE,
      alreadyApprovedPaise: 30_000 * RUPEE,
    });
    expect(outcome.appliedDiscountPaise).toBe(20_000 * RUPEE);
    expect(outcome.pendingDiscountPaise).toBeNull();
    expect(outcome.needsApproval).toBe(false);
  });

  it("withdraws an outstanding request when the figure comes back inside authority", () => {
    // Somebody who asked for ₹25,000, thought better of it and typed
    // ₹5,000 should not leave a request hanging for an approver.
    const outcome = resolveDiscount({
      limit: limit({ maxPercent: 10 }),
      totalFeePaise: FEE,
      requestedPaise: 5_000 * RUPEE,
      alreadyApprovedPaise: 0,
    });
    expect(outcome.pendingDiscountPaise).toBeNull();
    expect(outcome.needsApproval).toBe(false);
  });

  it("clears a discount to zero without approval", () => {
    const outcome = resolveDiscount({
      limit: NO_AUTHORITY,
      totalFeePaise: FEE,
      requestedPaise: 0,
      alreadyApprovedPaise: 10_000 * RUPEE,
    });
    expect(outcome.appliedDiscountPaise).toBe(0);
    expect(outcome.pendingDiscountPaise).toBeNull();
  });
});

describe("canApprove", () => {
  it("needs the approver's own authority to cover the request", () => {
    // Otherwise a centre head approves their own ₹50,000 discount by
    // routing it through a colleague on the same ceiling.
    const centreHead = limit({ maxPercent: 25 });
    expect(canApprove(centreHead, FEE, 20_000 * RUPEE)).toBe(true);
    expect(canApprove(centreHead, FEE, 50_000 * RUPEE)).toBe(false);
  });

  it("lets an unlimited approver settle anything escalated to them", () => {
    const admin = limit({ isUnlimited: true, maxPercent: 0 });
    expect(canApprove(admin, FEE, 90_000 * RUPEE)).toBe(true);
  });
});

describe("describeLimit", () => {
  it("says the ceiling plainly before anybody types a number", () => {
    expect(describeLimit(limit({ maxPercent: 10 }))).toBe("You can give up to 10% without approval.");
    expect(describeLimit(limit({ maxPercent: null, maxAmountPaise: 5_000 * RUPEE }))).toBe(
      "You can give up to ₹5,000 without approval.",
    );
    expect(describeLimit(limit({ maxPercent: 10, maxAmountPaise: 5_000 * RUPEE }))).toBe(
      "You can give up to 10% or ₹5,000, whichever is lower, without approval.",
    );
  });

  it("is honest with a role that has no authority", () => {
    expect(describeLimit(NO_AUTHORITY)).toBe("Any discount you enter will need approval.");
  });

  it("says so when there is no ceiling", () => {
    expect(describeLimit(limit({ isUnlimited: true }))).toMatch(/any discount/i);
  });
});
