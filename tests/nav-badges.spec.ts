/**
 * Which queue badges a person gets, and what a waiting student's row says.
 *
 * The badge permissions matter more than they look. A red count on a screen
 * somebody cannot open is a dead end, and — worse — a grey zero shown to
 * somebody with no access reads as "nothing to do" rather than "not yours",
 * which is precisely the misreading these badges exist to prevent.
 */
import { describe, expect, it } from "vitest";

import type { PermissionCode } from "@/lib/auth/permissions";
import {
  NAV_BADGE_KEYS,
  NAV_BADGE_PERMISSION,
  navBadgesFor,
} from "@/lib/nav/badge-permissions";
import { daysWaiting, waitingBand } from "@/lib/students/onboarding-queue";

function holding(...codes: PermissionCode[]) {
  const set = new Set<string>(codes);
  return (code: PermissionCode) => set.has(code);
}

describe("navBadgesFor", () => {
  it("gives a counsellor only the two queues that are theirs", () => {
    // They cannot assign and cannot see payments or students, so those
    // three would be dead links. Their own conversations and the profile
    // forms their students send are exactly their work.
    expect(navBadgesFor(holding("lead.read", "lead.update", "whatsapp.read"))).toEqual([
      "profileForms",
      "whatsapp",
    ]);
  });

  it("gives the profile-form count to everybody who can see the forms", () => {
    // Leon's reason for asking: a student submitting a form is something
    // the office should find out about without going to look. So it is
    // gated on the same permission as the screen, not on a narrower one.
    expect(navBadgesFor(holding("lead.read"))).toEqual(["profileForms"]);
    expect(navBadgesFor(holding("payment.read"))).not.toContain("profileForms");
  });

  it("gives academics the onboarding queue and nothing else", () => {
    // The case Leon asked about: academics sees Dashboard and Students, so
    // the onboarding count is the only signal they have that somebody new
    // has arrived.
    expect(navBadgesFor(holding("student.read", "student.update", "batch.manage"))).toEqual([
      "onboarding",
    ]);
  });

  it("gives accounts the admissions queue", () => {
    expect(navBadgesFor(holding("payment.read", "payment.record"))).toEqual(["admissions"]);
  });

  it("gives academics the onboarding queue and nothing from sales", () => {
    const keys = navBadgesFor(holding("student.read", "student.update"));
    expect(keys).toEqual(["onboarding"]);
  });

  it("gives a centre head the unassigned pile", () => {
    const keys = navBadgesFor(holding("lead.assign", "lead.read", "report.center"));
    expect(keys).toContain("unassigned");
    expect(keys).not.toContain("onboarding");
  });

  it("gives an admin every one of them", () => {
    expect(navBadgesFor(() => true)).toEqual([...NAV_BADGE_KEYS]);
  });

  it("gives somebody with no permissions none", () => {
    expect(navBadgesFor(() => false)).toEqual([]);
  });

  it("names a real permission for every badge", () => {
    // A typo here would silently hide a badge from everybody, since
    // `can()` returns false for a code nobody is granted.
    for (const key of NAV_BADGE_KEYS) {
      expect(NAV_BADGE_PERMISSION[key], key).toBeTruthy();
    }
  });
});

describe("daysWaiting", () => {
  const now = new Date("2026-10-01T10:00:00+05:30");

  it("is 0 for somebody who paid this morning", () => {
    expect(daysWaiting("2026-10-01T09:00:00+05:30", now)).toBe(0);
  });

  it("is 1 for somebody who paid late last night", () => {
    // Elapsed hours would call this 0 — which would report a student
    // ignored since 9pm yesterday as "Today".
    expect(daysWaiting("2026-09-30T21:00:00+05:30", now)).toBe(1);
  });

  it("counts calendar days, not 24-hour blocks", () => {
    expect(daysWaiting("2026-09-28T23:59:00+05:30", now)).toBe(3);
    expect(daysWaiting("2026-09-29T00:01:00+05:30", now)).toBe(2);
  });

  it("uses midnight in Kochi, not the server's UTC midnight", () => {
    // 00:30 UTC on the 1st is 06:00 IST on the 1st. A UTC-based
    // subtraction would put the payment and "now" on different days and
    // report an extra day of waiting every night between 00:00 and 05:30.
    const earlyUtc = new Date("2026-10-01T00:30:00Z");
    expect(daysWaiting("2026-10-01T05:00:00+05:30", earlyUtc)).toBe(0);
  });

  it("never goes negative on a clock-skewed future timestamp", () => {
    expect(daysWaiting("2026-10-05T10:00:00+05:30", now)).toBe(0);
  });

  it("is 0 rather than NaN for an unparseable date", () => {
    expect(daysWaiting("not a date", now)).toBe(0);
  });
});

describe("waitingBand", () => {
  it("turns red at three days", () => {
    // Paid Friday, nothing by Monday. That is a bad first week at the
    // institute, and the only row in the queue worth shouting about.
    expect(waitingBand(0)).toBe("fresh");
    expect(waitingBand(2)).toBe("fresh");
    expect(waitingBand(3)).toBe("overdue");
    expect(waitingBand(40)).toBe("overdue");
  });
});
