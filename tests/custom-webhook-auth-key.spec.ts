/**
 * The authentication key, as a sender actually presents it.
 *
 * Pure — no database and no route — because the part worth pinning here
 * is the header parsing. Every platform that cannot sign a request has
 * its own idea of where a key goes, and each of those spellings is a
 * support conversation if it is wrong.
 */
import { describe, expect, it } from "vitest";

import { authKeyMatches, presentedAuthKey } from "../src/lib/integrations/custom-webhook/auth-key";
import { RESPONSE_CASES, SUCCESS_RESPONSE, samplePayload } from "../src/lib/integrations/custom-webhook/setup-guide";
import { mapFormPayload } from "../src/lib/integrations/form-payload/map-fields";
import { normalizePhone } from "../src/lib/identity/normalize-phone";

const KEY = "a".repeat(64);

function headers(init: Record<string, string>): Headers {
  return new Headers(init);
}

describe("reading the key off a request", () => {
  it("takes a bearer token", () => {
    expect(presentedAuthKey(headers({ authorization: `Bearer ${KEY}` }))).toBe(KEY);
  });

  it("does not care how the sender capitalised the scheme", () => {
    expect(presentedAuthKey(headers({ authorization: `bearer ${KEY}` }))).toBe(KEY);
  });

  it("takes the X-AFD-Key header, for senders that will not let you set Authorization", () => {
    expect(presentedAuthKey(headers({ "x-afd-key": KEY }))).toBe(KEY);
  });

  it("takes a bare Authorization value, for a box labelled 'header value'", () => {
    expect(presentedAuthKey(headers({ authorization: KEY }))).toBe(KEY);
  });

  it("prefers X-AFD-Key when both are sent", () => {
    expect(presentedAuthKey(headers({ "x-afd-key": KEY, authorization: "Bearer something-else" }))).toBe(KEY);
  });

  it("trims the whitespace a copy-paste leaves behind", () => {
    expect(presentedAuthKey(headers({ "x-afd-key": `  ${KEY}  ` }))).toBe(KEY);
  });

  it("is null when nothing was sent", () => {
    expect(presentedAuthKey(headers({}))).toBeNull();
  });
});

describe("comparing the key", () => {
  it("accepts the right one", () => {
    expect(authKeyMatches(KEY, KEY)).toBe(true);
  });

  it("refuses a wrong one of the same length", () => {
    expect(authKeyMatches(KEY, "b".repeat(64))).toBe(false);
  });

  it("refuses a wrong one of a different length, rather than throwing", () => {
    expect(authKeyMatches(KEY, "b")).toBe(false);
  });

  /*
    The case that would be a security hole rather than a bug: an endpoint
    with no key configured must not accept a request that presents one,
    or any caller could authenticate against every endpoint at once.
  */
  it("refuses when the endpoint has no key", () => {
    expect(authKeyMatches(null, KEY)).toBe(false);
    expect(authKeyMatches("", KEY)).toBe(false);
  });

  it("refuses when nothing was presented", () => {
    expect(authKeyMatches(KEY, null)).toBe(false);
  });
});

describe("the sample payload shown on the settings card", () => {
  /*
    The reason this module exists. A sample body is handed to somebody
    who cannot test it against anything, so a sample the mapper would
    reject is worse than no sample at all — it sends them looking for a
    fault in their own platform.
  */
  it("is a body the mapper actually accepts", () => {
    const parsed = JSON.parse(samplePayload()) as Record<string, unknown>;
    const mapped = mapFormPayload(parsed);

    expect(mapped.ok).toBe(true);
    if (!mapped.ok) return;
    expect(mapped.lead.studentName).toBe("Ananya Menon");
    // The mapper hands the phone on exactly as it arrived and leaves
    // normalisation to resolveOrCreateLead — so what matters about the
    // sample is that it normalises, not what it looks like.
    expect(normalizePhone(mapped.lead.primaryPhone)).toBe("+919847012345");
    expect(mapped.lead.email).toBe("ananya@example.com");
    expect(mapped.lead.city).toBe("Kochi");
    expect(mapped.lead.interestedExams).toEqual(["NID", "NIFT UG"]);
    expect(mapped.lead.formName).toBe("Foundation enquiry");
    // Attribution comes from the explicit utm_* fields, not from the URL
    // — see the note in setup-guide.ts. A sample that relied on the URL
    // would produce an unattributed lead and look fine doing it.
    expect(mapped.lead.utm?.utm_source).toBe("instagram");
    expect(mapped.lead.utm?.utm_campaign).toBe("foundation-2027");
  });

  it("is valid JSON a sender can paste whole", () => {
    expect(() => JSON.parse(samplePayload())).not.toThrow();
    expect(() => JSON.parse(SUCCESS_RESPONSE)).not.toThrow();
  });
});

describe("the documented replies", () => {
  it("are each valid JSON, since a sender may be asked to match one", () => {
    for (const reply of RESPONSE_CASES) {
      expect(() => JSON.parse(reply.body), reply.body).not.toThrow();
    }
  });

  it("lead with the success case the card shows above them", () => {
    expect(JSON.parse(RESPONSE_CASES[0].body)).toEqual(JSON.parse(SUCCESS_RESPONSE));
  });
});
