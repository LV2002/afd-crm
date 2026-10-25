/**
 * A discount as two parts: the offer, and whatever is added to it.
 *
 * The fee plan stores ONE discount amount and ONE name. The screen shows it
 * as an offer (pre-approved, its amount worked out from the fee) plus an
 * optional extra with a reason, and these two functions are the whole of the
 * translation in each direction — pure, so the cases that lose somebody's
 * reason or double a figure are tested rather than hoped about.
 */

/** The extra part and its reason, recovered from what was saved. */
export function splitSavedDiscount(input: {
  /** The saved discount, in paise. */
  discountPaise: number;
  /** The saved name, e.g. "Early Bird" or "Early Bird + Sibling". */
  discountName: string;
  /** The offer this plan took, with what it is worth on the saved fee. Null for none. */
  offer: { name: string; paise: number } | null;
}): { extraPaise: number; reason: string } {
  const { discountPaise, discountName, offer } = input;
  if (!offer) return { extraPaise: Math.max(0, discountPaise), reason: discountName };

  const extraPaise = Math.max(0, discountPaise - offer.paise);
  const reason = discountName.startsWith(offer.name)
    ? discountName.slice(offer.name.length).replace(/^\s*\+\s*/, "")
    : discountName;
  return { extraPaise, reason };
}

/** The single name sent to the server: the offer's, then the extra's reason. */
export function composeDiscountName(offerName: string | null, extraPaise: number, reason: string): string {
  return [offerName, extraPaise > 0 ? reason.trim() || "Additional discount" : ""].filter(Boolean).join(" + ");
}
