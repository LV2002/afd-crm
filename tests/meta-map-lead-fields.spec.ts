import { describe, expect, it } from "vitest";

import { buildResolveLeadInput, mapMetaLeadFields, type MetaLeadgenResponse } from "../src/lib/integrations/meta/map-lead-fields";

function lead(overrides: Partial<MetaLeadgenResponse> = {}): MetaLeadgenResponse {
  return {
    id: "leadgen1",
    field_data: [
      { name: "full_name", values: ["Jane Doe"] },
      { name: "phone_number", values: ["+919847100100"] },
      { name: "email", values: ["jane@example.com"] },
    ],
    ...overrides,
  };
}

describe("mapMetaLeadFields", () => {
  it("maps the standard full_name/phone_number/email/city fields", () => {
    const mapped = mapMetaLeadFields(
      lead({ field_data: [...lead().field_data, { name: "city", values: ["Kochi"] }] }),
    );
    expect(mapped).toEqual({
      studentName: "Jane Doe",
      primaryPhone: "+919847100100",
      email: "jane@example.com",
      city: "Kochi",
    });
  });

  it("falls back to first_name + last_name when full_name is absent", () => {
    const mapped = mapMetaLeadFields(
      lead({
        field_data: [
          { name: "first_name", values: ["Jane"] },
          { name: "last_name", values: ["Doe"] },
          { name: "phone_number", values: ["+919847100100"] },
        ],
      }),
    );
    expect(mapped?.studentName).toBe("Jane Doe");
  });

  it("returns null when there is no name at all", () => {
    const mapped = mapMetaLeadFields(lead({ field_data: [{ name: "phone_number", values: ["+919847100100"] }] }));
    expect(mapped).toBeNull();
  });

  it("returns null when there is no phone at all", () => {
    const mapped = mapMetaLeadFields(lead({ field_data: [{ name: "full_name", values: ["Jane Doe"] }] }));
    expect(mapped).toBeNull();
  });

  it("returns null for a lead with no field_data", () => {
    expect(mapMetaLeadFields(lead({ field_data: [] }))).toBeNull();
  });

  it("leaves email/city null when the form didn't ask for them", () => {
    const mapped = mapMetaLeadFields(
      lead({ field_data: [{ name: "full_name", values: ["Jane Doe"] }, { name: "phone_number", values: ["+919847100100"] }] }),
    );
    expect(mapped).toEqual({ studentName: "Jane Doe", primaryPhone: "+919847100100", email: null, city: null });
  });
});

describe("buildResolveLeadInput", () => {
  it("carries the campaign/ad/form context through, with the leadgen id as the dedupe key", () => {
    const raw = lead({ form_id: "form1", ad_id: "ad1", adset_id: "adset1", campaign_id: "campaign1" });
    const mapped = mapMetaLeadFields(raw)!;
    const input = buildResolveLeadInput(raw, mapped);

    expect(input.source).toBe("meta");
    expect(input.subSource).toBe("form1");
    expect(input.campaignId).toBe("campaign1");
    expect(input.adsetId).toBe("adset1");
    expect(input.adId).toBe("ad1");
    expect(input.dedupeKey).toBe("leadgen1");
    expect(input.studentName).toBe("Jane Doe");
    expect(input.primaryPhone).toBe("+919847100100");
  });

  it("uses the lead's created_time as receivedAt when present", () => {
    const raw = lead({ created_time: "2024-03-01T10:00:00+0000" });
    const mapped = mapMetaLeadFields(raw)!;
    const input = buildResolveLeadInput(raw, mapped);
    expect(input.receivedAt).toEqual(new Date("2024-03-01T10:00:00+0000"));
  });

  it("leaves receivedAt undefined (defaults to now) when created_time is absent", () => {
    const raw = lead();
    const mapped = mapMetaLeadFields(raw)!;
    const input = buildResolveLeadInput(raw, mapped);
    expect(input.receivedAt).toBeUndefined();
  });
});
