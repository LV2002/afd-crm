import { describe, expect, it } from "vitest";

import { mapWebsiteForm, submissionId } from "@/lib/integrations/website/map-form-fields";

describe("mapWebsiteForm", () => {
  it("reads a typical submission", () => {
    const result = mapWebsiteForm({
      Name: "Anjali Menon",
      Phone: "9847012345",
      Email: "anjali@example.com",
      City: "Kochi",
      Course: "NIFT UG",
      form: "Homepage enquiry",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.lead).toMatchObject({
      studentName: "Anjali Menon",
      primaryPhone: "9847012345",
      email: "anjali@example.com",
      city: "Kochi",
      subSource: "Homepage enquiry",
    });
  });

  it("matches field names loosely, because the forms do not agree with each other", () => {
    // Three real-world spellings of the same two questions.
    for (const payload of [
      { "Full Name": "A", "Mobile Number": "9847012345" },
      { student_name: "A", contact_number: "9847012345" },
      { yourName: "A", whatsapp: "9847012345" },
    ]) {
      const result = mapWebsiteForm(payload);
      expect(result.ok, JSON.stringify(payload)).toBe(true);
    }
  });

  it("splits a multi-answer box into a list", () => {
    const result = mapWebsiteForm({ name: "A", phone: "9847012345", course: "NIFT, UCEED / NATA" });
    expect(result.ok && result.lead.interestedExams).toEqual(["NIFT", "UCEED", "NATA"]);
  });

  it("keeps every field, recognised or not", () => {
    // The promise that makes adding a question to a form safe: the answers
    // are stored even before anybody teaches the CRM what they mean.
    const result = mapWebsiteForm({
      name: "A",
      phone: "9847012345",
      "How did you hear about us": "My cousin",
      utm_campaign: "spring-nift",
    });
    expect(result.ok && result.lead.raw["How did you hear about us"]).toBe("My cousin");
    expect(result.ok && result.lead.raw.utm_campaign).toBe("spring-nift");
  });

  it("refuses a submission with no name or no usable phone, and says which", () => {
    expect(mapWebsiteForm({ phone: "9847012345" })).toMatchObject({
      ok: false,
      reason: expect.stringContaining("name"),
    });
    expect(mapWebsiteForm({ name: "A" })).toMatchObject({
      ok: false,
      reason: expect.stringContaining("phone"),
    });
    expect(mapWebsiteForm({ name: "A", phone: "12" })).toMatchObject({
      ok: false,
      reason: expect.stringContaining("not a phone number"),
    });
  });

  it("takes a number-typed phone from a spreadsheet without complaint", () => {
    // Sheets helpfully turns a phone column into a number.
    const result = mapWebsiteForm({ name: "A", phone: 9847012345 });
    expect(result.ok).toBe(true);
  });
});

describe("submissionId", () => {
  it("prefers an explicit id from the script", () => {
    expect(submissionId({ submission_id: "row42", phone: "9847012345" })).toBe("row42");
  });

  it("falls back to phone and timestamp, so a retry is not a second lead", () => {
    const payload = { phone: "9847012345", timestamp: "2026-09-15T10:00:00Z" };
    expect(submissionId(payload)).toBe(submissionId(payload));
    expect(submissionId(payload)).toContain("+919847012345");
  });

  it("gives two different people two different ids", () => {
    const at = "2026-09-15T10:00:00Z";
    expect(submissionId({ phone: "9847012345", timestamp: at })).not.toBe(
      submissionId({ phone: "9847099999", timestamp: at }),
    );
  });
});
