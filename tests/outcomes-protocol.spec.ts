import { execFileSync } from "node:child_process";

import { describe, expect, it } from "vitest";

import {
  buildPayloadJson,
  buildRequestBody,
  formatEventAt,
  isValidSubmissionId,
  outcomeStatusFor,
  parseReply,
  rejectedEventNumber,
  revenueInr,
  signOutcome,
} from "@/lib/outcomes/protocol";

describe("signature", () => {
  it("matches the openssl command in the brief", () => {
    const secret = "the-phrase";
    const ts = 1767254400000;
    const payload =
      '{"version":1,"events":[{"submission_id":"TEST-1","status":"contacted","event_at":"2026-11-02T10:30:00+05:30"}]}';
    const viaOpenssl = execFileSync("openssl", ["dgst", "-sha256", "-hmac", secret], {
      input: `${ts}.${payload}`,
    })
      .toString()
      .replace(/^.*= /, "")
      .trim();
    expect(signOutcome(secret, ts, payload)).toBe(viaOpenssl);
    expect(signOutcome(secret, ts, payload)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("signs exactly the string it sends", () => {
    const body = JSON.parse(
      buildRequestBody("k", [{ submission_id: "a1", status: "lost", event_at: "2026-11-02T10:30:00+05:30" }], 1700000000000),
    );
    expect(body._afd_publish).toBe("outcome");
    expect(body.timestamp).toBe(1700000000000);
    expect(typeof body.payloadJson).toBe("string");
    expect(body.signature).toBe(signOutcome("k", 1700000000000, body.payloadJson));
  });
});

describe("payload", () => {
  it("takes 1 to 200 events", () => {
    const ev = { submission_id: "a", status: "lost", event_at: "x" };
    expect(() => buildPayloadJson([])).toThrow();
    expect(() => buildPayloadJson(Array(201).fill(ev))).toThrow();
    expect(JSON.parse(buildPayloadJson(Array(200).fill(ev))).version).toBe(1);
  });
  it("writes times in IST with the zone", () => {
    expect(formatEventAt(new Date("2026-11-02T05:00:00Z"))).toBe("2026-11-02T10:30:00+05:30");
    expect(formatEventAt(new Date("2026-11-02T20:00:00Z"))).toBe("2026-11-03T01:30:00+05:30");
  });
  it("keeps revenue to whole rupees inside the receiver's range", () => {
    expect(revenueInr(8500000)).toBe(85000);
    expect(revenueInr(null)).toBeUndefined();
    expect(revenueInr(10_000_000 * 100 + 100)).toBeUndefined();
  });
  it("accepts only ids the sheet accepts", () => {
    expect(isValidSubmissionId("a1b2c3")).toBe(true);
    expect(isValidSubmissionId("row-12_x")).toBe(true);
    expect(isValidSubmissionId("+919847:1700")).toBe(false);
    expect(isValidSubmissionId("a".repeat(81))).toBe(false);
    expect(isValidSubmissionId("")).toBe(false);
    expect(isValidSubmissionId(null)).toBe(false);
  });
});

describe("status from kind", () => {
  it("maps by what the status means, not what it is called", () => {
    expect(outcomeStatusFor("new", {})).toBeNull();
    expect(outcomeStatusFor("open", {})).toBe("contacted");
    expect(outcomeStatusFor("parked", {})).toBe("contacted");
    expect(outcomeStatusFor("won", {})).toBe("admitted");
    expect(outcomeStatusFor("lost", {})).toBe("lost");
  });
  it("lets an option name its own outcome, if the sheet would accept it", () => {
    expect(outcomeStatusFor("open", { outcome_status: "demo_booked" })).toBe("demo_booked");
    expect(outcomeStatusFor("open", { outcome_status: "Demo Booked!" })).toBe("contacted");
  });
});

describe("replies", () => {
  it("reads success and failure", () => {
    expect(parseReply('{"ok":true,"added":1,"duplicates":0}')).toEqual({ ok: true, added: 1, duplicates: 0 });
    expect(parseReply('{"ok":false,"error":"the signature does not match"}')).toEqual({
      ok: false,
      error: "the signature does not match",
    });
    expect(parseReply("<html>sign in</html>").ok).toBe(false);
  });
  it("finds which event was refused", () => {
    expect(rejectedEventNumber("an outcome is not valid (number 3)")).toBe(3);
    expect(rejectedEventNumber("the signature does not match")).toBeNull();
  });
});
