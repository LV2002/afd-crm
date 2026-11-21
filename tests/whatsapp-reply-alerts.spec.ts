import { describe, expect, it } from "vitest";

import { dueAlerts, type ChatRules } from "../src/lib/whatsapp/reply-alerts";

const rules: ChatRules = { alertEnabled: true, alertMinutes: 30, escalateMinutes: 120, autoAssignUnowned: false };
const now = new Date("2026-11-20T10:00:00Z");
const ago = (m: number) => new Date(now.getTime() - m * 60_000);

describe("dueAlerts", () => {
  it("waits until the first limit", () => {
    expect(dueAlerts([{ leadId: "a", inboundAt: ago(10), sentLevels: [] }], rules, now, true)).toEqual([]);
  });
  it("sends level 1 once, then level 2 later", () => {
    expect(dueAlerts([{ leadId: "a", inboundAt: ago(45), sentLevels: [] }], rules, now, true)[0].level).toBe(1);
    expect(dueAlerts([{ leadId: "a", inboundAt: ago(45), sentLevels: [1] }], rules, now, true)).toEqual([]);
    expect(dueAlerts([{ leadId: "a", inboundAt: ago(130), sentLevels: [1] }], rules, now, true)[0].level).toBe(2);
    expect(dueAlerts([{ leadId: "a", inboundAt: ago(130), sentLevels: [1, 2] }], rules, now, true)).toEqual([]);
  });
  it("sends only the escalation for a chat found already very late", () => {
    const due = dueAlerts([{ leadId: "a", inboundAt: ago(300), sentLevels: [] }], rules, now, true);
    expect(due.map((d) => d.level)).toEqual([2]);
  });
  it("sends nothing when off or the office is closed", () => {
    const chat = { leadId: "a", inboundAt: ago(300), sentLevels: [] };
    expect(dueAlerts([chat], { ...rules, alertEnabled: false }, now, true)).toEqual([]);
    expect(dueAlerts([chat], rules, now, false)).toEqual([]);
  });
});
