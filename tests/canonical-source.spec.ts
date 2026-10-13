import { describe, expect, it } from "vitest";

import { canonicalSource } from "@/lib/identity/canonical-source";

const OPTIONS = [
  { value: "meta", label: "Meta" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "website", label: "Website" },
  { value: "walk_in", label: "Walk-in" },
  { value: "Google Ads", label: "Google Ads" },
];

describe("canonicalSource", () => {
  it("maps a different spelling onto the configured option's value", () => {
    expect(canonicalSource("WhatsApp", OPTIONS)).toBe("whatsapp");
    expect(canonicalSource("META", OPTIONS)).toBe("meta");
    expect(canonicalSource("Website", OPTIONS)).toBe("website");
  });

  it("matches on the label as well as the value, ignoring spacing and punctuation", () => {
    expect(canonicalSource("Walk in", OPTIONS)).toBe("walk_in");
    expect(canonicalSource("walk-in", OPTIONS)).toBe("walk_in");
    expect(canonicalSource("  meta  ", OPTIONS)).toBe("meta");
  });

  it("leaves an unfamiliar source exactly as it came", () => {
    expect(canonicalSource("Shiksha listing", OPTIONS)).toBe("Shiksha listing");
    expect(canonicalSource("", OPTIONS)).toBe("");
  });

  it("does not turn a near miss into a match", () => {
    expect(canonicalSource("Meta Ads", OPTIONS)).toBe("Meta Ads");
  });
});
