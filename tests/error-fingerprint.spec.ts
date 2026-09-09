/**
 * Grouping failures, and rationing the emails about them.
 *
 * The way error alerting fails is not silence — it is four hundred emails
 * in an hour, after which somebody makes a filter rule and never hears
 * about anything again.
 */
import { describe, expect, it } from "vitest";

import {
  alertSubject,
  fingerprintError,
  generaliseMessage,
  shouldAlert,
} from "../src/lib/errors/fingerprint";

describe("fingerprintError", () => {
  it("treats the same bug with different ids as one failure", () => {
    const a = "Lead 3f2a8c1e-0b4d-4f2a-9c1e-2b4d6f8a0c2e not found";
    const b = "Lead 9b1c7d2f-1a3e-4b5c-8d7e-3f5a7c9e1b3d not found";
    expect(fingerprintError("leads", a)).toBe(fingerprintError("leads", b));
  });

  it("keeps genuinely different failures apart", () => {
    expect(fingerprintError("leads", "Lead not found")).not.toBe(
      fingerprintError("leads", "Payment failed"),
    );
  });

  it("keeps the same message from different places apart", () => {
    // A timeout in the WhatsApp sweep and a timeout in the fee panel are
    // two problems, and lumping them together hides one of them.
    expect(fingerprintError("cron:whatsapp", "Request timed out")).not.toBe(
      fingerprintError("action:saveFeePlan", "Request timed out"),
    );
  });

  it("generalises the values that vary run to run", () => {
    expect(generaliseMessage("Template 'fee_reminder_v2' was rejected")).toBe(
      "Template '<value>' was rejected",
    );
    expect(generaliseMessage("Could not reach +919847123456")).toBe("Could not reach <number>");
    expect(generaliseMessage("wamid.HBgMOTE5ODQ3 failed")).toBe("<wamid> failed");
  });

  it("is stable across calls, because it is the grouping key", () => {
    expect(fingerprintError("x", "boom")).toBe(fingerprintError("x", "boom"));
    expect(fingerprintError("x", "boom")).toMatch(/^[0-9a-f]{8}$/);
  });
});

describe("shouldAlert", () => {
  it("always reports the first occurrence", () => {
    expect(shouldAlert(1, null)).toBe(true);
  });

  it("stays quiet until the count is ten times what was last reported", () => {
    // The whole anti-flood mechanism. Without it a fault that fires every
    // few seconds sends an email every few seconds.
    expect(shouldAlert(2, 1)).toBe(false);
    expect(shouldAlert(9, 1)).toBe(false);
    expect(shouldAlert(10, 1)).toBe(true);
    expect(shouldAlert(99, 10)).toBe(false);
    expect(shouldAlert(100, 10)).toBe(true);
  });

  it("sends roughly one message per order of magnitude", () => {
    // A storm of four hundred failures should produce three emails, not
    // four hundred.
    let lastNotified: number | null = null;
    let sent = 0;
    for (let count = 1; count <= 400; count += 1) {
      if (shouldAlert(count, lastNotified)) {
        sent += 1;
        lastNotified = count;
      }
    }
    expect(sent).toBe(3);
  });

  it("never alerts on a count of nothing", () => {
    expect(shouldAlert(0, null)).toBe(false);
  });
});

describe("alertSubject", () => {
  it("says where and what, in the width of a phone notification", () => {
    expect(alertSubject("cron:payment-reminders", "Template 'x' was rejected", 1)).toBe(
      "AFD CRM: cron:payment-reminders — Template '<value>' was rejected",
    );
  });

  it("says how many when it has happened more than once", () => {
    expect(alertSubject("webhook:whatsapp", "Boom", 12)).toContain("(12×)");
  });
});
