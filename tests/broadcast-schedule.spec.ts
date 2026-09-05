/**
 * Compose on Monday, send on Tuesday at ten.
 *
 * Every assertion here is really about the time zone. A person in Kochi
 * types 10:00 and means 10:00 IST; the server, Postgres and Vercel's cron
 * are all UTC, five and a half hours behind. Getting that wrong sends the
 * campaign at half past four in the morning.
 */
import { describe, expect, it } from "vitest";

import {
  MAX_DAYS_AHEAD,
  defaultScheduleValue,
  describeSchedule,
  isDue,
  parseScheduleAt,
  toLocalInputValue,
} from "../src/lib/whatsapp/schedule";

const NOW = new Date("2026-09-05T12:00:00Z"); // 17:30 IST

describe("parseScheduleAt", () => {
  it("reads the box as Asia/Kolkata, not as the server's own clock", () => {
    const { at, error } = parseScheduleAt("2026-09-08T10:00", NOW);
    expect(error).toBeUndefined();
    // 10:00 IST is 04:30 UTC. If this ever reads 10:00Z, every scheduled
    // campaign in the system goes out at 15:30 IST.
    expect(at?.toISOString()).toBe("2026-09-08T04:30:00.000Z");
  });

  it("refuses a time that has already passed", () => {
    // Somebody who typed last Tuesday meant next Tuesday, and finding out
    // by having it send immediately is not recoverable.
    expect(parseScheduleAt("2026-09-01T10:00", NOW).error).toMatch(/already passed/);
    expect(parseScheduleAt("2026-09-05T17:00", NOW).error).toMatch(/already passed/);
  });

  it("accepts a time later the same IST day", () => {
    expect(parseScheduleAt("2026-09-05T18:00", NOW).at?.toISOString()).toBe(
      "2026-09-05T12:30:00.000Z",
    );
  });

  it("catches a typo in the year rather than queueing it for two centuries", () => {
    expect(parseScheduleAt("2226-09-08T10:00", NOW).error).toMatch(/365 days/);
    expect(MAX_DAYS_AHEAD).toBe(365);
  });

  it("refuses what it cannot read instead of guessing", () => {
    expect(parseScheduleAt("", NOW).error).toMatch(/Pick the date/);
    expect(parseScheduleAt("next tuesday", NOW).error).toMatch(/isn't readable/);
    expect(parseScheduleAt("2026-13-45T10:00", NOW).error).toBeTruthy();
  });
});

describe("isDue", () => {
  it("fires at or after the moment, never only exactly on it", () => {
    // The sweep runs on a cron and will essentially never be looking at
    // the exact scheduled minute. A broadcast whose time passed while
    // nobody was looking must go late rather than never.
    expect(isDue("2026-09-05T11:59:00Z", NOW)).toBe(true);
    expect(isDue("2026-09-05T12:00:00Z", NOW)).toBe(true);
    expect(isDue("2026-09-05T12:01:00Z", NOW)).toBe(false);
  });

  it("is never due when nothing was scheduled", () => {
    expect(isDue(null, NOW)).toBe(false);
    expect(isDue("not a date", NOW)).toBe(false);
  });
});

describe("describeSchedule / toLocalInputValue", () => {
  it("always reads back in IST", () => {
    expect(describeSchedule("2026-09-08T04:30:00.000Z")).toBe("Tue 8 Sep 2026, 10:00 AM");
    expect(toLocalInputValue("2026-09-08T04:30:00.000Z")).toBe("2026-09-08T10:00");
  });

  it("says so plainly when there is no time", () => {
    expect(describeSchedule("nonsense")).toBe("—");
  });
});

describe("defaultScheduleValue", () => {
  it("offers tomorrow at 10am, not an hour from now", () => {
    // The reason to schedule at all is to land in working hours.
    expect(defaultScheduleValue(NOW)).toBe("2026-09-06T10:00");
  });

  it("is still in the future when composed late at night IST", () => {
    // 01:30 IST on the 6th. "Tomorrow" has to mean the 7th, or the
    // default value is a time the parser refuses.
    const lateNight = new Date("2026-09-05T20:00:00Z");
    const value = defaultScheduleValue(lateNight);
    expect(value).toBe("2026-09-07T10:00");
    expect(parseScheduleAt(value, lateNight).error).toBeUndefined();
  });
});
