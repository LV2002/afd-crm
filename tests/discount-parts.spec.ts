import { describe, expect, it } from "vitest";

import { composeDiscountName, splitSavedDiscount } from "../src/lib/enrolment/discount-parts";

const early = { name: "Early Bird", paise: 1_000_000 };

describe("splitSavedDiscount", () => {
  it("a plan that took only the offer has no extra", () => {
    expect(splitSavedDiscount({ discountPaise: 1_000_000, discountName: "Early Bird", offer: early })).toEqual({
      extraPaise: 0,
      reason: "",
    });
  });

  it("separates the extra and its reason from the offer", () => {
    expect(
      splitSavedDiscount({ discountPaise: 1_200_000, discountName: "Early Bird + Sibling", offer: early }),
    ).toEqual({ extraPaise: 200_000, reason: "Sibling" });
  });

  it("with no offer, the whole discount is the extra and the name is its reason", () => {
    expect(splitSavedDiscount({ discountPaise: 500_000, discountName: "Staff ward", offer: null })).toEqual({
      extraPaise: 500_000,
      reason: "Staff ward",
    });
  });

  it("never reports a negative extra, and keeps a name that does not start with the offer's", () => {
    expect(splitSavedDiscount({ discountPaise: 400_000, discountName: "Negotiated", offer: early })).toEqual({
      extraPaise: 0,
      reason: "Negotiated",
    });
  });
});

describe("composeDiscountName", () => {
  it("joins the offer and the extra's reason", () => {
    expect(composeDiscountName("Early Bird", 200_000, "Sibling")).toBe("Early Bird + Sibling");
  });

  it("is just the offer when there is no extra, whatever is left in the reason box", () => {
    expect(composeDiscountName("Early Bird", 0, "Sibling")).toBe("Early Bird");
  });

  it("names an unexplained extra rather than dropping it, and handles no offer", () => {
    expect(composeDiscountName("Early Bird", 200_000, "  ")).toBe("Early Bird + Additional discount");
    expect(composeDiscountName(null, 500_000, "Staff ward")).toBe("Staff ward");
    expect(composeDiscountName(null, 0, "")).toBe("");
  });
});
