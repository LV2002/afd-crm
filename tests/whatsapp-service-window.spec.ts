/**
 * Meta's 24-hour customer service window.
 *
 * Pure arithmetic, so it can be tested at the boundary rather than by
 * waiting a day. It decides whether the composer is a text box or a
 * paragraph explaining why it isn't, on both the lead threads and —
 * since migration 0090 — the ones with nobody attached yet.
 *
 * Getting it wrong in either direction is bad in a different way. Too
 * generous and a counsellor types a reply that Meta refuses, after they
 * have written it. Too strict and the box is taken away from somebody
 * who could legitimately answer.
 */
import { describe, expect, it } from "vitest";

import { isWithinWindow } from "../src/lib/whatsapp/get-thread";

const NOW = new Date("2026-10-07T12:00:00.000Z");
const HOUR = 60 * 60 * 1000;

function hoursAgo(n: number): Date {
  return new Date(NOW.getTime() - n * HOUR);
}

describe("isWithinWindow", () => {
  it("is open a minute after they wrote", () => {
    expect(isWithinWindow(new Date(NOW.getTime() - 60_000), NOW)).toBe(true);
  });

  it("is open at twenty-three hours fifty-nine", () => {
    expect(isWithinWindow(new Date(NOW.getTime() - (24 * HOUR - 60_000)), NOW)).toBe(true);
  });

  it("is shut at exactly twenty-four hours", () => {
    // Meta's boundary is not inclusive, and a reply sent on the stroke
    // would be refused by the API after the CRM had promised it would go.
    expect(isWithinWindow(hoursAgo(24), NOW)).toBe(false);
  });

  it("is shut a day later", () => {
    expect(isWithinWindow(hoursAgo(48), NOW)).toBe(false);
  });

  it("is shut when they have never written", () => {
    // Not the same situation as a closed window, but the same answer:
    // the Cloud API accepts free-form only inside a window somebody
    // else opened, and nobody has opened one.
    expect(isWithinWindow(null, NOW)).toBe(false);
  });

  it("accepts the ISO string Postgres hands back", () => {
    expect(isWithinWindow(hoursAgo(1).toISOString(), NOW)).toBe(true);
    expect(isWithinWindow(hoursAgo(25).toISOString(), NOW)).toBe(false);
  });

  it("is shut rather than throwing on an unparseable timestamp", () => {
    // A bad value must not take the inbox down with it, and refusing the
    // send is the safe side: the worst case is somebody uses their phone.
    expect(isWithinWindow("not a date", NOW)).toBe(false);
  });

  it("does not treat a timestamp from the future as expired", () => {
    // Clock skew between Meta and this server is real and small. A
    // message dated two minutes ahead is still very much inside the
    // window, and arithmetic that went negative must not read as stale.
    expect(isWithinWindow(new Date(NOW.getTime() + 2 * 60_000), NOW)).toBe(true);
  });
});
