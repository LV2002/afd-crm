/**
 * The generic payload mapper, which is what makes a custom webhook
 * possible at all.
 *
 * A course platform, a form builder and a landing page nobody mentioned
 * post a flat object of strings with no agreement about what the keys are
 * called, and none of them will change to suit us. So the mapping is by
 * alias, nothing is ever dropped, and when it cannot find a name or a
 * phone it says which fields it DID receive — because the person reading
 * that message is setting up a new feed and needs to know what the sender
 * actually called things.
 */
import { describe, expect, it } from "vitest";

import { mapFormPayload, submissionId } from "../src/lib/integrations/form-payload/map-fields";

describe("mapFormPayload", () => {
  it("maps conventional field names", () => {
    const result = mapFormPayload({
      name: "Aarav Menon",
      phone: "9847012345",
      email: "aarav@example.com",
      city: "Kochi",
      exam_year: "2027",
      course: "Foundation",
    });

    expect(result).toMatchObject({
      ok: true,
      lead: {
        studentName: "Aarav Menon",
        primaryPhone: "9847012345",
        email: "aarav@example.com",
        city: "Kochi",
        examYear: "2027",
        interestedExams: ["Foundation"],
      },
    });
  });

  it("ignores case and punctuation in field names", () => {
    const result = mapFormPayload({ "Full Name": "Diya", "Mobile-Number": "9847012345" });
    expect(result).toMatchObject({ ok: true, lead: { studentName: "Diya" } });
  });

  it("keeps every field on the raw record, recognised or not", () => {
    const payload = {
      name: "Diya",
      phone: "9847012345",
      how_did_you_hear: "Instagram",
      favourite_colour: "blue",
    };
    const result = mapFormPayload(payload);

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.lead.raw).toEqual(payload);
  });

  describe("extra aliases", () => {
    it("finds a field the built-in list does not know", () => {
      const payload = { buyer: "Rahul", mob: "9847012345" };

      expect(mapFormPayload(payload)).toMatchObject({ ok: false });
      expect(
        mapFormPayload(payload, { name: ["buyer"], phone: ["mob"] }),
      ).toMatchObject({ ok: true, lead: { studentName: "Rahul", primaryPhone: "9847012345" } });
    });

    it("prefers the admin's alias over a built-in one", () => {
      // A platform that sends both a display `name` and the real buyer in
      // another field. The admin added the alias because the built-in
      // match was picking the wrong one, so theirs has to win.
      const result = mapFormPayload(
        { name: "Order #4821", customer_name: "Nivedita", phone: "9847012345" },
        { name: ["customer_name"] },
      );
      expect(result).toMatchObject({ ok: true, lead: { studentName: "Nivedita" } });
    });

    it("normalises an admin's alias the same way as a built-in one", () => {
      const result = mapFormPayload(
        { "Buyer Full Name": "Tara", phone: "9847012345" },
        { name: ["buyer_full_name"] },
      );
      expect(result).toMatchObject({ ok: true, lead: { studentName: "Tara" } });
    });
  });

  describe("when it cannot map a submission", () => {
    it("names the fields that did arrive", () => {
      const result = mapFormPayload({ buyer: "Rahul", mob: "9847012345" });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toContain("No name field found");
        expect(result.reason).toContain("buyer");
        expect(result.reason).toContain("mob");
      }
    });

    it("says so plainly when the payload is empty", () => {
      const result = mapFormPayload({});
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toContain("nothing");
    });

    it("rejects a phone number it cannot use, quoting it back", () => {
      const result = mapFormPayload({ name: "A", phone: "12" });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toContain('"12"');
    });

    it("does not list a hundred field names at somebody", () => {
      const payload: Record<string, string> = {};
      for (let i = 0; i < 40; i += 1) payload[`field_${i}`] = "x";

      const result = mapFormPayload(payload);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason.split(", ").length).toBeLessThanOrEqual(12);
      }
    });
  });

  it("collects utm fields however they are spelled", () => {
    const result = mapFormPayload({
      name: "A",
      phone: "9847012345",
      "UTM-Source": "meta",
      utmMedium: "cpc",
      gclid: "abc123",
    });

    expect(result).toMatchObject({
      ok: true,
      lead: { utm: { utm_source: "meta", utm_medium: "cpc", gclid: "abc123" } },
    });
  });

  it("accepts a number where a string was expected", () => {
    // A platform posting JSON built from a spreadsheet sends the phone as
    // a number, and losing the lead over a type is not acceptable.
    const result = mapFormPayload({ name: "A", phone: 9847012345 });
    expect(result).toMatchObject({ ok: true, lead: { primaryPhone: "9847012345" } });
  });
});

describe("submissionId", () => {
  it("uses the sender's own id when there is one", () => {
    expect(submissionId({ order_id: "KN-4821", phone: "9847012345" })).toBe("KN-4821");
  });

  it("recognises a course platform's transaction id", () => {
    expect(submissionId({ transaction_id: "txn_99", phone: "9847012345" })).toBe("txn_99");
  });

  it("falls back to the phone and timestamp", () => {
    expect(submissionId({ phone: "9847012345", timestamp: "2026-10-05T06:00:00Z" })).toBe(
      "+919847012345:2026-10-05T06:00:00Z",
    );
  });

  it("is stable for the same submission delivered twice", () => {
    const payload = { phone: "9847012345", submitted_at: "2026-10-05T06:00:00Z" };
    expect(submissionId(payload)).toBe(submissionId(payload));
  });
});
