import { describe, expect, it } from "vitest";

import {
  auditEntityHref,
  auditPayloadLines,
  describeAuditAction,
  describeEntityType,
} from "@/lib/audit/describe-entry";

describe("describeAuditAction", () => {
  it("puts what happened first", () => {
    expect(describeAuditAction("lead.update").sentence).toBe("Updated a lead");
    expect(describeAuditAction("payment.record").sentence).toBe("Recorded a payment");
  });

  it("spells out the irregular verbs that matter most", () => {
    expect(describeAuditAction("lead.reveal_phone").sentence).toBe(
      "Revealed the phone number of a lead",
    );
    expect(describeAuditAction("user.reset_password").sentence).toBe(
      "Reset the password of a user",
    );
    expect(describeAuditAction("payment.reversal").sentence).toBe("Reversed a payment");
  });

  it("reads a brand-new action nobody has taught it", () => {
    // The point of not using a lookup table: a call site added next month
    // should not print raw snake_case at somebody.
    expect(describeAuditAction("invoice.void_requested").sentence).toBe(
      "Void requested an invoice",
    );
    expect(describeAuditAction("invoice.void_requested").subject).toBe("invoice");
  });

  it("keeps known subjects readable", () => {
    expect(describeAuditAction("sla_policy.update").sentence).toBe("Updated an SLA policy");
    expect(describeAuditAction("org_settings.update").sentence).toBe(
      "Updated the organisation settings",
    );
    expect(describeAuditAction("whatsapp.message_send").sentence).toBe(
      "Sent a message on WhatsApp",
    );
  });

  it("survives an action with no verb at all", () => {
    expect(describeAuditAction("login")).toMatchObject({ sentence: "Login", subject: "login" });
  });
});

describe("describeEntityType", () => {
  it("unsnakes a table name", () => {
    expect(describeEntityType("assignment_rules")).toBe("Assignment rules");
    expect(describeEntityType("leads")).toBe("Leads");
  });
});

describe("auditEntityHref", () => {
  it("links the tables that have a page", () => {
    expect(auditEntityHref("leads", "abc")).toBe("/leads/abc");
    expect(auditEntityHref("assignment_rules", "r1")).toBe("/settings/rules/r1");
  });

  it("returns nothing where there is nowhere to go", () => {
    expect(auditEntityHref("payments", "p1")).toBeNull();
    expect(auditEntityHref("leads", null)).toBeNull();
  });
});

describe("auditPayloadLines", () => {
  it("flattens a payload to readable lines", () => {
    expect(auditPayloadLines({ student_name: "Anjali", is_active: true, tags: ["a", "b"] })).toEqual([
      { key: "student name", value: "Anjali" },
      { key: "is active", value: "yes" },
      { key: "tags", value: "a, b" },
    ]);
  });

  it("marks blanks and empties rather than showing nothing", () => {
    expect(auditPayloadLines({ city: "", note: null, tags: [] })).toEqual([
      { key: "city", value: "(blank)" },
      { key: "note", value: "—" },
      { key: "tags", value: "(none)" },
    ]);
  });

  it("handles a null payload and a bare scalar", () => {
    expect(auditPayloadLines(null)).toEqual([]);
    expect(auditPayloadLines("deleted")).toEqual([{ key: "value", value: "deleted" }]);
  });
});
