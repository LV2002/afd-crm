/**
 * Who gets chased about an overdue instalment, and when.
 *
 * Two ways this goes wrong, both bad in a way nobody notices immediately:
 * reminding the same student every single night until they block the
 * number, and silently never reminding anybody because the sweep missed
 * the one day a rung was due on.
 */
import { describe, expect, it } from "vitest";

import {
  daysBetweenDates,
  describeTiming,
  dueReminders,
  reminderKey,
  supersededRules,
  type OutstandingInstalment,
  type ReminderRule,
} from "../src/lib/finance/reminder-schedule";

function rule(overrides: Partial<ReminderRule> & { id: string; daysAfterDue: number }): ReminderRule {
  return {
    name: `Day ${overrides.daysAfterDue}`,
    channel: "notification",
    templateName: null,
    templateLanguage: "en_US",
    ...overrides,
  };
}

function instalment(overrides: Partial<OutstandingInstalment> = {}): OutstandingInstalment {
  return {
    instalmentId: "i1",
    enrolmentId: "e1",
    dueDate: "2026-03-01",
    outstandingPaise: 25_000_00,
    ...overrides,
  };
}

const LADDER = [
  rule({ id: "before", daysAfterDue: -3 }),
  rule({ id: "day1", daysAfterDue: 1 }),
  rule({ id: "day7", daysAfterDue: 7 }),
  rule({ id: "day30", daysAfterDue: 30 }),
];

describe("daysBetweenDates", () => {
  it("counts whole calendar days", () => {
    expect(daysBetweenDates("2026-03-01", "2026-03-08")).toBe(7);
    expect(daysBetweenDates("2026-03-01", "2026-03-01")).toBe(0);
  });

  it("is negative before the date", () => {
    expect(daysBetweenDates("2026-03-01", "2026-02-27")).toBe(-2);
  });

  it("crosses a month and a leap day without drifting", () => {
    expect(daysBetweenDates("2028-02-27", "2028-03-01")).toBe(3);
  });
});

describe("dueReminders", () => {
  it("fires nothing before the first rung is reached", () => {
    // Five days before the due date, and the earliest rung is three days
    // before.
    expect(dueReminders([instalment()], LADDER, new Set(), "2026-02-24")).toHaveLength(0);
  });

  it("fires the pre-due rung three days before the money is late", () => {
    const due = dueReminders([instalment()], LADDER, new Set(), "2026-02-26");
    expect(due).toHaveLength(1);
    expect(due[0].rule.id).toBe("before");
    expect(due[0].daysOverdue).toBe(-3);
  });

  it("fires the day-1 rung the day after it falls due", () => {
    const sent = new Set([reminderKey("i1", "before")]);
    const due = dueReminders([instalment()], LADDER, sent, "2026-03-02");
    expect(due[0].rule.id).toBe("day1");
  });

  it("never repeats a rung it has already fired", () => {
    // The whole anti-spam mechanism. Without it a nightly sweep sends the
    // same message every night until the student blocks the number.
    const sent = new Set([
      reminderKey("i1", "before"),
      reminderKey("i1", "day1"),
      reminderKey("i1", "day7"),
    ]);
    expect(dueReminders([instalment()], LADDER, sent, "2026-03-10")).toHaveLength(0);
  });

  it("catches up a rung the sweep missed on its exact day", () => {
    // Comparing for equality would be tidier and wrong: a sweep that did
    // not run on the 8th would skip the day-7 rung and never come back.
    const sent = new Set([reminderKey("i1", "before"), reminderKey("i1", "day1")]);
    const due = dueReminders([instalment()], LADDER, sent, "2026-03-12");
    expect(due).toHaveLength(1);
    expect(due[0].rule.id).toBe("day7");
    expect(due[0].daysOverdue).toBe(11);
  });

  it("sends only ONE rung per instalment per run", () => {
    // Switching a ladder on for the first time against a student who is
    // three months late must not fire four messages at once.
    const due = dueReminders([instalment()], LADDER, new Set(), "2026-06-01");
    expect(due).toHaveLength(1);
    expect(due[0].rule.id).toBe("day30");
  });

  it("ignores an instalment with nothing left owing", () => {
    const paid = instalment({ outstandingPaise: 0 });
    expect(dueReminders([paid], LADDER, new Set(), "2026-06-01")).toHaveLength(0);
  });

  it("handles several instalments independently", () => {
    const rows = [
      instalment({ instalmentId: "a", dueDate: "2026-03-01" }),
      instalment({ instalmentId: "b", dueDate: "2026-05-20" }),
      instalment({ instalmentId: "c", dueDate: "2026-03-01", outstandingPaise: 0 }),
    ];
    const due = dueReminders(rows, LADDER, new Set(), "2026-06-01");
    expect(due.map((d) => `${d.instalment.instalmentId}:${d.rule.id}`)).toEqual([
      "a:day30",
      "b:day7",
    ]);
  });

  it("fires nothing when the ladder is empty", () => {
    expect(dueReminders([instalment()], [], new Set(), "2026-06-01")).toHaveLength(0);
  });
});

describe("supersededRules", () => {
  it("writes off the earlier rungs when a later one fires", () => {
    // Otherwise the next run sends the day-7 message to somebody who is
    // three months late, which reads as a system that has lost track.
    const [fired] = dueReminders([instalment()], LADDER, new Set(), "2026-06-01");
    const superseded = supersededRules(fired, LADDER, new Set());
    expect(superseded.map((r) => r.id).sort()).toEqual(["before", "day1", "day7"]);
  });

  it("does not write off a rung that has not come round yet", () => {
    const [fired] = dueReminders([instalment()], LADDER, new Set(), "2026-03-02");
    // day1 fired; day7 and day30 are still ahead and must stay pending.
    const superseded = supersededRules(fired, LADDER, new Set());
    expect(superseded.map((r) => r.id)).toEqual(["before"]);
  });

  it("does not re-write-off a rung already recorded", () => {
    const sent = new Set([reminderKey("i1", "before"), reminderKey("i1", "day1")]);
    const [fired] = dueReminders([instalment()], LADDER, sent, "2026-06-01");
    expect(supersededRules(fired, LADDER, sent).map((r) => r.id)).toEqual(["day7"]);
  });
});

describe("describeTiming", () => {
  it("reads the way a person would say it", () => {
    expect(describeTiming(1)).toBe("1 day overdue");
    expect(describeTiming(11)).toBe("11 days overdue");
    expect(describeTiming(0)).toBe("due today");
    expect(describeTiming(-1)).toBe("due in 1 day");
    expect(describeTiming(-3)).toBe("due in 3 days");
  });
});
