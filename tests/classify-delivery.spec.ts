import { describe, expect, it } from "vitest";

import { classifyDelivery } from "../src/lib/integrations/classify-delivery";

describe("classifyDelivery", () => {
  it("a delivery that made a new lead", () => {
    expect(classifyDelivery({ signatureOk: true, status: "done", enquiry: { wasDuplicate: false } })).toBe("created");
  });

  it("an enquiry on somebody already in the CRM is linked, not missing", () => {
    expect(classifyDelivery({ signatureOk: true, status: "done", enquiry: { wasDuplicate: true } })).toBe("linked");
  });

  it("turned away at the door vs accepted-then-failed", () => {
    expect(classifyDelivery({ signatureOk: false, status: "failed", enquiry: null })).toBe("refused");
    expect(classifyDelivery({ signatureOk: true, status: "failed", enquiry: null })).toBe("failed");
  });

  it("an unsigned delivery an endpoint accepts is not refused", () => {
    expect(classifyDelivery({ signatureOk: false, status: "done", enquiry: { wasDuplicate: false } })).toBe("created");
  });

  it("pending, and processed-but-not-a-lead", () => {
    expect(classifyDelivery({ signatureOk: true, status: "pending", enquiry: null })).toBe("pending");
    expect(classifyDelivery({ signatureOk: true, status: "done", enquiry: null })).toBe("accepted");
  });
});
