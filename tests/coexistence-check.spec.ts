import { describe, expect, it } from "vitest";

import { evaluateCoexistenceCheck, missingFields, type CheckInput } from "../src/lib/whatsapp/coexistence-check";

const NOW = new Date("2026-11-21T12:00:00Z");
const healthy: CheckInput = {
  hasAppCredentials: true,
  hasVerifyToken: true,
  subscription: { callbackUrl: "https://crm.example/api/webhooks/whatsapp", active: true, fields: ["messages", "smb_message_echoes", "history", "smb_app_state_sync"] },
  expectedCallback: "https://crm.example/api/webhooks/whatsapp",
  wabaSubscribed: true,
  coexistenceNumbers: 1,
  lastDeliveryAt: new Date("2026-11-21T11:30:00Z"),
};
const status = (lines: ReturnType<typeof evaluateCoexistenceCheck>, id: string) => lines.find((l) => l.id === id)?.status;

describe("missingFields", () => {
  it("needs the three Coexistence fields only when a Coexistence number exists", () => {
    expect(missingFields(["messages"], false)).toEqual([]);
    expect(missingFields(["messages"], true)).toEqual(["smb_message_echoes", "history", "smb_app_state_sync"]);
    expect(missingFields([], false)).toEqual(["messages"]);
  });
});

describe("evaluateCoexistenceCheck", () => {
  it("is all green when everything is in place", () => {
    const lines = evaluateCoexistenceCheck(healthy, NOW);
    expect(lines.every((l) => l.status === "ok")).toBe(true);
  });
  it("flags the missing Coexistence fields and offers the fix", () => {
    const lines = evaluateCoexistenceCheck({ ...healthy, subscription: { ...healthy.subscription!, fields: ["messages"] } }, NOW);
    const fields = lines.find((l) => l.id === "fields")!;
    expect(fields.status).toBe("problem");
    expect(fields.fixable).toBe(true);
    expect(fields.detail).toMatch(/smb_message_echoes/);
  });
  it("will not offer the fix without a verify token", () => {
    const lines = evaluateCoexistenceCheck({ ...healthy, hasVerifyToken: false, subscription: { ...healthy.subscription!, fields: [] } }, NOW);
    expect(lines.find((l) => l.id === "fields")!.fixable).toBe(false);
  });
  it("catches Meta delivering to a different address", () => {
    const lines = evaluateCoexistenceCheck({ ...healthy, subscription: { ...healthy.subscription!, callbackUrl: "https://old.example/hook" } }, NOW);
    expect(status(lines, "webhook")).toBe("problem");
  });
  it("reports no webhook at all, and an unreadable one as unknown rather than wrong", () => {
    expect(status(evaluateCoexistenceCheck({ ...healthy, subscription: null }, NOW), "webhook")).toBe("problem");
    expect(status(evaluateCoexistenceCheck({ ...healthy, subscription: undefined }, NOW), "webhook")).toBe("unknown");
  });
  it("asks for the app credentials before anything else", () => {
    const lines = evaluateCoexistenceCheck({ ...healthy, hasAppCredentials: false }, NOW);
    expect(lines).toHaveLength(1);
    expect(lines[0].status).toBe("problem");
  });
  it("says so when nothing has ever arrived, and when the account is not subscribed", () => {
    const lines = evaluateCoexistenceCheck({ ...healthy, lastDeliveryAt: null, wabaSubscribed: false }, NOW);
    expect(status(lines, "delivery")).toBe("problem");
    expect(status(lines, "waba")).toBe("problem");
  });
});
