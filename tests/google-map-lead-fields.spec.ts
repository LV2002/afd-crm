import { describe, expect, it } from "vitest";

import {
  buildResolveLeadInput,
  mapGoogleLeadFields,
  type GoogleLeadWebhookPayload,
} from "../src/lib/integrations/google/map-lead-fields";

function payload(overrides: Partial<GoogleLeadWebhookPayload> = {}): GoogleLeadWebhookPayload {
  return {
    lead_id: "lead1",
    google_key: "test-key",
    user_column_data: [
      { column_id: "FULL_NAME", column_name: "Full Name", string_value: "Jane Doe" },
      { column_id: "PHONE_NUMBER", column_name: "Phone", string_value: "+919847100100" },
      { column_id: "EMAIL", column_name: "Email", string_value: "jane@example.com" },
    ],
    ...overrides,
  };
}

describe("mapGoogleLeadFields", () => {
  it("maps the standard FULL_NAME/PHONE_NUMBER/EMAIL/CITY columns", () => {
    const mapped = mapGoogleLeadFields(
      payload({ user_column_data: [...payload().user_column_data, { column_id: "CITY", string_value: "Kochi" }] }),
    );
    expect(mapped).toEqual({
      studentName: "Jane Doe",
      primaryPhone: "+919847100100",
      email: "jane@example.com",
      city: "Kochi",
    });
  });

  it("falls back to FIRST_NAME + LAST_NAME when FULL_NAME is absent", () => {
    const mapped = mapGoogleLeadFields(
      payload({
        user_column_data: [
          { column_id: "FIRST_NAME", string_value: "Jane" },
          { column_id: "LAST_NAME", string_value: "Doe" },
          { column_id: "PHONE_NUMBER", string_value: "+919847100100" },
        ],
      }),
    );
    expect(mapped?.studentName).toBe("Jane Doe");
  });

  it("returns null when there is no name at all", () => {
    const mapped = mapGoogleLeadFields(payload({ user_column_data: [{ column_id: "PHONE_NUMBER", string_value: "+919847100100" }] }));
    expect(mapped).toBeNull();
  });

  it("returns null when there is no phone at all", () => {
    const mapped = mapGoogleLeadFields(payload({ user_column_data: [{ column_id: "FULL_NAME", string_value: "Jane Doe" }] }));
    expect(mapped).toBeNull();
  });

  it("returns null for a lead with no user_column_data", () => {
    expect(mapGoogleLeadFields(payload({ user_column_data: [] }))).toBeNull();
  });

  it("leaves email/city null when the form didn't ask for them", () => {
    const mapped = mapGoogleLeadFields(
      payload({
        user_column_data: [
          { column_id: "FULL_NAME", string_value: "Jane Doe" },
          { column_id: "PHONE_NUMBER", string_value: "+919847100100" },
        ],
      }),
    );
    expect(mapped).toEqual({ studentName: "Jane Doe", primaryPhone: "+919847100100", email: null, city: null });
  });

  it("ignores an unrecognised custom question column rather than erroring", () => {
    const mapped = mapGoogleLeadFields(
      payload({ user_column_data: [...payload().user_column_data, { column_id: "PREFERRED_COURSE", string_value: "NID Foundation" }] }),
    );
    expect(mapped?.studentName).toBe("Jane Doe");
  });
});

describe("buildResolveLeadInput", () => {
  it("carries the campaign/form/gclid context through, with the lead_id as the dedupe key", () => {
    const raw = payload({ campaign_id: 111, form_id: 222, adgroup_id: 333, creative_id: 444, gcl_id: "gclid-abc" });
    const mapped = mapGoogleLeadFields(raw)!;
    const input = buildResolveLeadInput(raw, mapped);

    expect(input.source).toBe("google");
    expect(input.subSource).toBe("222");
    expect(input.campaignId).toBe("111");
    expect(input.adsetId).toBe("333");
    expect(input.adId).toBe("444");
    expect(input.gclid).toBe("gclid-abc");
    expect(input.dedupeKey).toBe("lead1");
    expect(input.studentName).toBe("Jane Doe");
    expect(input.primaryPhone).toBe("+919847100100");
  });

  it("leaves campaign/form/gclid fields null when absent from the payload", () => {
    const raw = payload();
    const mapped = mapGoogleLeadFields(raw)!;
    const input = buildResolveLeadInput(raw, mapped);
    expect(input.subSource).toBeNull();
    expect(input.campaignId).toBeNull();
    expect(input.adsetId).toBeNull();
    expect(input.adId).toBeNull();
    expect(input.gclid).toBeNull();
  });
});
