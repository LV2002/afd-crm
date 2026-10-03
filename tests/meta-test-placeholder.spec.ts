/**
 * Meta's testing tool has two buttons that do very different things.
 *
 * "Preview form" submits what you type. "Create lead" submits
 * `<test lead: dummy data for phone_number>` in every answer — a genuine
 * lead, with a genuine id, fetched over the real API, whose contents are
 * not data. The CRM then rejects it on the last step for not being a
 * phone number, which is correct and reads exactly like a broken
 * integration at the end of a long setup.
 */
import { describe, expect, it } from "vitest";

import { isMetaTestPlaceholder, mapMetaLeadFields } from "../src/lib/integrations/meta/map-lead-fields";

describe("isMetaTestPlaceholder", () => {
  it("recognises what Meta's Create lead button actually sends", () => {
    expect(isMetaTestPlaceholder("<test lead: dummy data for phone_number>")).toBe(true);
    expect(isMetaTestPlaceholder("<test lead: dummy data for full_name>")).toBe(true);
    expect(isMetaTestPlaceholder("  <test lead: dummy data for email>  ")).toBe(true);
  });

  it("leaves real answers alone", () => {
    expect(isMetaTestPlaceholder("+919037515799")).toBe(false);
    expect(isMetaTestPlaceholder("Divya")).toBe(false);
    // A real person could conceivably write angle brackets; only Meta's
    // exact prefix counts.
    expect(isMetaTestPlaceholder("<not a test>")).toBe(false);
  });

  it("does not fall over on a missing answer", () => {
    expect(isMetaTestPlaceholder(null)).toBe(false);
    expect(isMetaTestPlaceholder(undefined)).toBe(false);
    expect(isMetaTestPlaceholder("")).toBe(false);
  });
});

describe("a Create lead submission, end to end", () => {
  it("maps cleanly — the lead is well-formed, which is why it got as far as it did", () => {
    const mapped = mapMetaLeadFields({
      id: "2185256329065188",
      field_data: [
        { name: "full_name", values: ["<test lead: dummy data for full_name>"] },
        { name: "phone_number", values: ["<test lead: dummy data for phone_number>"] },
      ],
    });

    // It maps. Nothing about the shape is wrong; only the contents.
    expect(mapped).not.toBeNull();
    expect(isMetaTestPlaceholder(mapped!.primaryPhone)).toBe(true);
  });

  it("a real submission through Preview form is not mistaken for one", () => {
    const mapped = mapMetaLeadFields({
      id: "2185256329065189",
      field_data: [
        { name: "full_name", values: ["Divya Menon"] },
        { name: "phone_number", values: ["+919037515799"] },
      ],
    });

    expect(isMetaTestPlaceholder(mapped!.primaryPhone)).toBe(false);
    expect(isMetaTestPlaceholder(mapped!.studentName)).toBe(false);
  });
});
