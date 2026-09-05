/**
 * Which overdue instalments get chased tonight, and with which rung.
 *
 * Collections has shown who is late since the finance module shipped, and
 * nothing has ever chased them. This decides who the sweep contacts.
 *
 * Pure, and tested, because the two ways this goes wrong are both bad in
 * a way nobody notices immediately: reminding the same student every
 * single night until they block the number, or silently never reminding
 * anybody because a rung was missed on the one day it was due.
 */

export interface ReminderRule {
  id: string;
  name: string;
  /** Days after the due date. Negative fires BEFORE the money is late. */
  daysAfterDue: number;
  channel: "notification" | "whatsapp";
  templateName: string | null;
  templateLanguage: string;
}

export interface OutstandingInstalment {
  instalmentId: string;
  enrolmentId: string;
  dueDate: string;
  outstandingPaise: number;
}

export interface DueReminder {
  instalment: OutstandingInstalment;
  rule: ReminderRule;
  /** Positive when late, negative when the rung fires before the due date. */
  daysOverdue: number;
}

/** Whole days between two Asia/Kolkata calendar dates. */
export function daysBetweenDates(fromDate: string, toDate: string): number {
  return Math.round(
    (Date.parse(`${toDate}T00:00:00Z`) - Date.parse(`${fromDate}T00:00:00Z`)) / 86_400_000,
  );
}

/**
 * The rungs that should fire tonight.
 *
 * ## The two rules that matter
 *
 * **A rung fires once per instalment, ever.** `alreadySent` is the set of
 * `instalmentId:ruleId` pairs already recorded, and a pair in it is never
 * produced again. Without this, a nightly sweep reminds the same person
 * about the same instalment every night until they block the number.
 *
 * **A rung is due at `daysAfterDue` OR LATER, not exactly on the day.**
 * Comparing for equality looks tidier and is wrong: a sweep that does not
 * run on the 7th — a failed deploy, a Vercel outage, a paused project —
 * would skip the day-7 rung for every instalment due that week and never
 * come back to it. `>=` means a missed night is caught up the next one,
 * which is what somebody chasing money actually wants.
 *
 * The catch-up has one edge worth knowing: switching a ladder on for the
 * first time fires every rung whose day has passed, all at once. That is
 * why the sweep sends at most one rung per instalment per run — the
 * highest one due — so a student who is 90 days late gets the day-90
 * message tonight and the earlier rungs are recorded as skipped rather
 * than delivered as a burst.
 */
export function dueReminders(
  instalments: OutstandingInstalment[],
  rules: ReminderRule[],
  alreadySent: Set<string>,
  asOf: string,
): DueReminder[] {
  const due: DueReminder[] = [];

  // Latest rung first, so the "one per instalment per run" pick below
  // takes the most advanced one rather than the earliest.
  const ordered = [...rules].sort((a, b) => b.daysAfterDue - a.daysAfterDue);

  for (const instalment of instalments) {
    if (instalment.outstandingPaise <= 0) continue;
    const daysOverdue = daysBetweenDates(instalment.dueDate, asOf);

    for (const rule of ordered) {
      if (daysOverdue < rule.daysAfterDue) continue;
      if (alreadySent.has(reminderKey(instalment.instalmentId, rule.id))) continue;
      due.push({ instalment, rule, daysOverdue });
      // One rung per instalment per run. See the module comment: turning a
      // ladder on for the first time must not fire four messages at once.
      break;
    }
  }

  return due;
}

export function reminderKey(instalmentId: string, ruleId: string): string {
  return `${instalmentId}:${ruleId}`;
}

/**
 * The rungs that are now moot and should be written off rather than sent.
 *
 * When the day-90 rung fires tonight, the day-1, day-7 and day-30 rungs
 * for that same instalment are recorded as `skipped` — otherwise they
 * remain outstanding forever and the next run sends the day-30 message to
 * somebody who is three months late, which reads as a system that has
 * lost track.
 */
export function supersededRules(
  fired: DueReminder,
  rules: ReminderRule[],
  alreadySent: Set<string>,
): ReminderRule[] {
  return rules.filter(
    (rule) =>
      rule.id !== fired.rule.id &&
      rule.daysAfterDue < fired.rule.daysAfterDue &&
      fired.daysOverdue >= rule.daysAfterDue &&
      !alreadySent.has(reminderKey(fired.instalment.instalmentId, rule.id)),
  );
}

/** "3 days overdue" / "due in 2 days" / "due today", for the message and the log. */
export function describeTiming(daysOverdue: number): string {
  if (daysOverdue > 0) return `${daysOverdue} day${daysOverdue === 1 ? "" : "s"} overdue`;
  if (daysOverdue < 0) {
    const days = Math.abs(daysOverdue);
    return `due in ${days} day${days === 1 ? "" : "s"}`;
  }
  return "due today";
}
