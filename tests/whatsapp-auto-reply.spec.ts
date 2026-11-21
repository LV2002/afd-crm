import { describe, expect, it } from "vitest";

import { decideAutoReply, isOpenNow, type AutoReplyConfig } from "../src/lib/whatsapp/auto-reply";

const greeting: AutoReplyConfig = { kind: "greeting", enabled: true, message: "Hi", days: [1, 2, 3, 4, 5, 6], opensAt: "09:00", closesAt: "18:00" };
const away: AutoReplyConfig = { kind: "away", enabled: true, message: "Closed", days: [1, 2, 3, 4, 5, 6], opensAt: "09:00", closesAt: "18:00" };
// 2026-11-18 is a Wednesday. 06:30Z = 12:00 IST (open); 19:30Z = 01:00 IST next day (closed).
const noon = new Date("2026-11-18T06:30:00Z");
const night = new Date("2026-11-18T19:30:00Z");
const sunday = new Date("2026-11-22T06:30:00Z");
const none = { greeting: null, away: null };

describe("isOpenNow", () => {
  it("uses India time and the open days", () => {
    expect(isOpenNow(away, noon)).toBe(true);
    expect(isOpenNow(away, night)).toBe(false);
    expect(isOpenNow(away, sunday)).toBe(false);
  });
});

describe("decideAutoReply", () => {
  it("greets a fresh conversation during opening hours", () => {
    expect(decideAutoReply({ now: noon, previousInboundAt: null, lastSent: none, configs: [greeting, away] })?.kind).toBe("greeting");
  });
  it("does not greet in the middle of a conversation", () => {
    const earlier = new Date(noon.getTime() - 3_600_000);
    expect(decideAutoReply({ now: noon, previousInboundAt: earlier, lastSent: none, configs: [greeting, away] })).toBeNull();
  });
  it("sends the closed message out of hours, in place of the greeting", () => {
    expect(decideAutoReply({ now: night, previousInboundAt: null, lastSent: none, configs: [greeting, away] })?.kind).toBe("away");
  });
  it("sends the closed message only once in 12 hours", () => {
    const recent = new Date(night.getTime() - 3_600_000);
    expect(decideAutoReply({ now: night, previousInboundAt: recent, lastSent: { greeting: null, away: recent }, configs: [away] })).toBeNull();
  });
  it("sends nothing when switched off", () => {
    expect(decideAutoReply({ now: noon, previousInboundAt: null, lastSent: none, configs: [{ ...greeting, enabled: false }] })).toBeNull();
  });
});
