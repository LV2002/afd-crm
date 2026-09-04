/**
 * How big a discount somebody may give without asking anyone.
 *
 * `discount.approve` has existed as a permission since Phase 4 and nothing
 * has ever enforced it: a counsellor could type any figure into the
 * discount box and the student was billed accordingly. This is the rule
 * that check was always meant to have.
 *
 * Pure, and tested against worked examples, because it decides what a
 * student is charged.
 *
 * ## Why an unapproved discount is not applied
 *
 * The obvious design is to apply the discount and flag it for approval
 * afterwards. That is the wrong way round for money. A discount that is
 * already reducing the bill is one nobody has to hurry to approve, and if
 * it is never approved then accounts have spent weeks collecting against a
 * figure nobody agreed. So a request above someone's authority is recorded
 * as pending and the student owes the full fee until it is granted — which
 * puts the pressure exactly where it belongs, on getting an answer.
 */

/** One role's authority. `null` for the whole limit means the role has none. */
export interface DiscountLimit {
  /** 0-100, or null when a percentage is not the constraint for this role. */
  maxPercent: number | null;
  /** Null when there is no cash ceiling for this role. */
  maxAmountPaise: number | null;
  /** Bypasses both — admin and co-admin, who approve what was escalated. */
  isUnlimited: boolean;
}

/**
 * A role with no `discount_limits` row has no authority at all.
 *
 * Failing closed is the point of the feature. A role created next year, or
 * one nobody thought about, must not be able to give money away quietly
 * just because its limit was never filled in.
 */
export const NO_AUTHORITY: DiscountLimit = {
  maxPercent: 0,
  maxAmountPaise: 0,
  isUnlimited: false,
};

/**
 * The discount as a percentage of the total fee, rounded to two places.
 *
 * A zero total is not an error here — a fee plan mid-edit can legitimately
 * have no course fee typed yet — but any discount against it is infinite
 * relief, so it is reported as needing approval rather than as 0%.
 */
export function discountPercent(totalFeePaise: number, discountPaise: number): number {
  if (discountPaise <= 0) return 0;
  if (totalFeePaise <= 0) return 100;
  return Math.round((discountPaise / totalFeePaise) * 10_000) / 100;
}

export interface AuthorityCheck {
  withinAuthority: boolean;
  percent: number;
  /** Why it needs approval, in words a counsellor can act on. Null when it doesn't. */
  reason: string | null;
}

/**
 * May this limit give this discount?
 *
 * BOTH ceilings apply when both are set: a percentage alone lets 10% off a
 * ₹2,00,000 consultancy through unnoticed, and a cash cap alone makes
 * ₹5,000 look reasonable on a ₹15,000 crash course.
 */
export function checkAuthority(
  limit: DiscountLimit,
  totalFeePaise: number,
  discountPaise: number,
): AuthorityCheck {
  const percent = discountPercent(totalFeePaise, discountPaise);

  // No discount is always within everybody's authority, including a role
  // that holds none — otherwise an ordinary fee plan with no discount at
  // all would queue for approval.
  if (discountPaise <= 0) return { withinAuthority: true, percent: 0, reason: null };

  if (limit.isUnlimited) return { withinAuthority: true, percent, reason: null };

  if (limit.maxAmountPaise !== null && discountPaise > limit.maxAmountPaise) {
    return {
      withinAuthority: false,
      percent,
      reason:
        limit.maxAmountPaise === 0
          ? "Your role cannot approve discounts, so this needs someone else's approval."
          : `That is over the ${formatPaise(limit.maxAmountPaise)} you can give without approval.`,
    };
  }

  if (limit.maxPercent !== null && percent > limit.maxPercent) {
    return {
      withinAuthority: false,
      percent,
      reason:
        limit.maxPercent === 0
          ? "Your role cannot approve discounts, so this needs someone else's approval."
          : `${percent}% is over the ${limit.maxPercent}% you can give without approval.`,
    };
  }

  return { withinAuthority: true, percent, reason: null };
}

/** Local, because this module must stay importable from a client component. */
function formatPaise(paise: number): string {
  const rupees = paise / 100;
  return `₹${new Intl.NumberFormat("en-IN", { maximumFractionDigits: rupees % 1 === 0 ? 0 : 2 }).format(rupees)}`;
}

export interface DiscountOutcome {
  /** What goes into `discount_paise` — only ever an authorised figure. */
  appliedDiscountPaise: number;
  /** What goes into `pending_discount_paise`, or null when nothing is outstanding. */
  pendingDiscountPaise: number | null;
  /** True when this save created or changed a request somebody must answer. */
  needsApproval: boolean;
  reason: string | null;
}

/**
 * What a save should actually write, given who is saving it.
 *
 * `alreadyApprovedPaise` is the discount that was previously granted on
 * this enrolment. It is what stops the obvious way around the whole
 * feature: get ₹5,000 approved, then quietly edit it to ₹25,000. Anything
 * above what was approved is a fresh request, and the applied figure falls
 * back to what actually was approved rather than to zero — a granted
 * discount is not taken away because somebody asked for more.
 */
export function resolveDiscount(input: {
  limit: DiscountLimit;
  totalFeePaise: number;
  requestedPaise: number;
  alreadyApprovedPaise: number;
}): DiscountOutcome {
  const { limit, totalFeePaise, requestedPaise, alreadyApprovedPaise } = input;

  const check = checkAuthority(limit, totalFeePaise, requestedPaise);
  if (check.withinAuthority) {
    // Within authority, so it simply applies — and any earlier request is
    // settled by the same act. Somebody who asked for ₹25,000 and then
    // thought better of it should not leave a request hanging.
    return {
      appliedDiscountPaise: requestedPaise,
      pendingDiscountPaise: null,
      needsApproval: false,
      reason: null,
    };
  }

  // Reducing an approved discount is always allowed: it is the student
  // paying more, which nobody needs permission for.
  if (requestedPaise <= alreadyApprovedPaise) {
    return {
      appliedDiscountPaise: requestedPaise,
      pendingDiscountPaise: null,
      needsApproval: false,
      reason: null,
    };
  }

  return {
    appliedDiscountPaise: alreadyApprovedPaise,
    pendingDiscountPaise: requestedPaise,
    needsApproval: true,
    reason: check.reason,
  };
}

/**
 * May this person settle this request?
 *
 * An approver needs the permission AND enough authority of their own —
 * otherwise a centre head could approve their own ₹50,000 discount by
 * routing it through a colleague with the same ceiling, and the limit
 * would mean nothing. Rejecting, by contrast, needs only the permission:
 * saying no to a discount never gives anything away.
 */
export function canApprove(
  limit: DiscountLimit,
  totalFeePaise: number,
  pendingPaise: number,
): boolean {
  return checkAuthority(limit, totalFeePaise, pendingPaise).withinAuthority;
}

/** "10% or ₹5,000, whichever is lower" — what the fee panel tells a counsellor up front. */
export function describeLimit(limit: DiscountLimit): string {
  if (limit.isUnlimited) return "You can give any discount without approval.";

  const parts: string[] = [];
  if (limit.maxPercent !== null && limit.maxPercent > 0) parts.push(`${limit.maxPercent}%`);
  if (limit.maxAmountPaise !== null && limit.maxAmountPaise > 0) {
    parts.push(formatPaise(limit.maxAmountPaise));
  }

  if (parts.length === 0) return "Any discount you enter will need approval.";
  if (parts.length === 1) return `You can give up to ${parts[0]} without approval.`;
  return `You can give up to ${parts[0]} or ${parts[1]}, whichever is lower, without approval.`;
}
