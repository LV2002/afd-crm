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
  activity: {
    messages: { count: 4, last: new Date("2026-11-21T11:30:00Z") },
    echoes: { count: 2, last: new Date("2026-11-21T09:00:00Z") },
    history: { count: 3, last: new Date("2026-11-10T09:00:00Z") },
    statuses: { count: 10, last: new Date("2026-11-21T11:00:00Z") },
    unregistered: [],
  },
};
const none = { count: 0, last: null };
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
  it("says the account is not subscribed", () => {
    expect(status(evaluateCoexistenceCheck({ ...healthy, wabaSubscribed: false }, NOW), "waba")).toBe("problem");
  });
  it("separates 'Meta sends nothing' from 'receipts arrive but no messages'", () => {
    const receiptsOnly = evaluateCoexistenceCheck({ ...healthy, activity: { ...healthy.activity, messages: none, echoes: none } }, NOW);
    expect(status(receiptsOnly, "msgs")).toBe("problem");
    expect(receiptsOnly.find((l) => l.id === "msgs")!.detail).toMatch(/receipts do arrive/i);
    const silent = evaluateCoexistenceCheck({ ...healthy, activity: { ...healthy.activity, messages: none, echoes: none, statuses: none } }, NOW);
    expect(silent.find((l) => l.id === "msgs")!.detail).toMatch(/sending nothing/i);
  });
  it("flags a Coexistence number whose phone sends never arrive, and treats missing history as unknown", () => {
    const lines = evaluateCoexistenceCheck({ ...healthy, activity: { ...healthy.activity, echoes: none, history: none } }, NOW);
    expect(status(lines, "echoes")).toBe("problem");
    expect(status(lines, "history")).toBe("unknown");
  });
  it("shows deliveries Meta sent for a number the CRM does not know", () => {
    const lines = evaluateCoexistenceCheck({ ...healthy, activity: { ...healthy.activity, unregistered: [{ detail: "messages arrived for phone number id 999, which is not registered.", at: NOW }] } }, NOW);
    const line = lines.find((l) => l.id === "unregistered")!;
    expect(line.status).toBe("problem");
    expect(line.detail).toMatch(/999/);
  });
  it("does not ask about phone-sent messages when no Coexistence number exists", () => {
    const lines = evaluateCoexistenceCheck({ ...healthy, coexistenceNumbers: 0 }, NOW);
    expect(lines.find((l) => l.id === "echoes")).toBeUndefined();
  });
});
