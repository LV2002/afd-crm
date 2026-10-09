/**
 * Which pile a follow-up lands in, around the boundaries that matter.
 *
 * All of these turn on midnight in Asia/Kolkata rather than on the
 * server's clock. A counsellor in Kochi opening the screen at 00:05
 * must see yesterday's calls as overdue and today's as today — and the
 * server runs in UTC, where it is still the previous evening.
 */
import { describe, expect, it } from "vitest";

import { startOfDayIST, startOfTomorrowIST } from "@/lib/format/date";
import {
  FOLLOWUP_BUCKETS,
  FOLLOWUP_BUCKET_LABEL,
  FOLLOWUP_BUCKET_NOTE,
  boundariesFrom,
  bucketFor,
} from "@/lib/leads/followup-buckets";

/** 09:00 IST on 9 October 2026 — mid-morning, when somebody opens this. */
const NOW = new Date("2026-10-09T03:30:00Z");

const bounds = boundariesFrom(startOfDayIST(NOW), startOfTomorrowIST(NOW));

/** An IST wall-clock time, as the UTC instant it really is. */
function ist(local: string): Date {
  return new Date(new Date(`${local}+05:30`).toISOString());
}

describe("bucketing a follow-up date", () => {
  it("puts yesterday in overdue", () => {
    expect(bucketFor(ist("2026-10-08T17:00:00"), bounds)).toBe("overdue");
  });

  it("puts this morning in today, even though it has already passed", () => {
    // The distinction the screen is built on: a call booked for 8am and
    // missed at 9am is still today's work, not a backlog item.
    expect(bucketFor(ist("2026-10-09T08:00:00"), bounds)).toBe("today");
  });

  it("puts midnight exactly in today, not overdue", () => {
    expect(bucketFor(ist("2026-10-09T00:00:00"), bounds)).toBe("today");
  });

  it("puts one minute before midnight in overdue", () => {
    expect(bucketFor(ist("2026-10-08T23:59:00"), bounds)).toBe("overdue");
  });

  it("puts tomorrow in tomorrow", () => {
    expect(bucketFor(ist("2026-10-10T11:00:00"), bounds)).toBe("tomorrow");
  });

  it("puts the day after tomorrow in this week", () => {
    expect(bucketFor(ist("2026-10-11T11:00:00"), bounds)).toBe("week");
  });

  it("keeps day seven in this week and pushes day eight out", () => {
    expect(bucketFor(ist("2026-10-15T23:00:00"), bounds)).toBe("week");
    expect(bucketFor(ist("2026-10-16T00:00:00"), bounds)).toBe("later");
  });

  /*
    The case that fails if any of this is done in UTC: just after
    midnight in Kochi it is still 18:xx the previous day in UTC, so a
    naive implementation reads "today" as yesterday and shows an empty
    screen to somebody who has calls waiting.
  */
  it("is right five minutes after midnight in Kochi", () => {
    const justAfterMidnight = new Date("2026-10-08T18:35:00Z"); // 00:05 IST on the 9th
    const b = boundariesFrom(startOfDayIST(justAfterMidnight), startOfTomorrowIST(justAfterMidnight));

    expect(bucketFor(ist("2026-10-09T09:00:00"), b)).toBe("today");
    expect(bucketFor(ist("2026-10-08T09:00:00"), b)).toBe("overdue");
  });
});

describe("the bucket list itself", () => {
  it("is ordered most urgent first, which is the order the screen renders", () => {
    expect([...FOLLOWUP_BUCKETS]).toEqual(["overdue", "today", "tomorrow", "week", "later"]);
  });

  it("has a label and a note for every bucket", () => {
    for (const bucket of FOLLOWUP_BUCKETS) {
      expect(FOLLOWUP_BUCKET_LABEL[bucket], bucket).toBeTruthy();
      expect(FOLLOWUP_BUCKET_NOTE[bucket], bucket).toBeTruthy();
    }
  });

  it("covers every instant — nothing can fall between two buckets", () => {
    const probes = [
      ist("2020-01-01T00:00:00"),
      ist("2026-10-08T23:59:59"),
      ist("2026-10-09T00:00:00"),
      ist("2026-10-10T00:00:00"),
      ist("2026-10-16T00:00:00"),
      ist("2099-01-01T00:00:00"),
    ];
    for (const probe of probes) {
      expect(FOLLOWUP_BUCKETS).toContain(bucketFor(probe, bounds));
    }
  });
});
