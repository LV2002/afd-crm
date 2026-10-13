import { describe, expect, it } from "vitest";

import { adReferralOf } from "@/lib/integrations/whatsapp/map-inbound";

describe("adReferralOf", () => {
  it("recognises a conversation that began with a tap on an ad", () => {
    expect(
      adReferralOf({
        referral: { source_type: "ad", source_id: "1203", headline: " NIFT 2027 batch ", ctwa_clid: "AR123" },
      }),
    ).toEqual({ adId: "1203", headline: "NIFT 2027 batch", clickId: "AR123" });
  });

  it("treats a click id alone as an ad lead", () => {
    expect(adReferralOf({ referral: { ctwa_clid: "AR9" } })).toEqual({
      adId: null,
      headline: null,
      clickId: "AR9",
    });
  });

  it("does not count a post as an ad, and keeps no ad id for it", () => {
    expect(adReferralOf({ referral: { source_type: "post", source_id: "77" } })).toBeNull();
  });

  it("is null for an ordinary message", () => {
    expect(adReferralOf({})).toBeNull();
    expect(adReferralOf({ referral: {} })).toBeNull();
  });
});
