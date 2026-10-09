/**
 * Which pile a booked follow-up falls into, counted in Kochi's day.
 *
 * The Follow-ups screen is a list in date order, and a flat list in date
 * order is almost useless on its own: a counsellor opening it at nine in
 * the morning needs to see, before reading a single name, whether they
 * are behind. So the same ordering is cut into five named piles and the
 * overdue one is first.
 *
 * Pure, and the boundaries are the reason. "Overdue" versus "today"
 * turns on midnight in Asia/Kolkata, not on the server's clock or the
 * browser's, and a boundary that cannot be tested without waiting until
 * midnight is a boundary that gets tested in production.
 */

export const FOLLOWUP_BUCKETS = ["overdue", "today", "tomorrow", "week", "later"] as const;

export type FollowupBucket = (typeof FOLLOWUP_BUCKETS)[number];

export const FOLLOWUP_BUCKET_LABEL: Record<FollowupBucket, string> = {
  overdue: "Overdue",
  today: "Today",
  tomorrow: "Tomorrow",
  week: "Later this week",
  later: "Later",
};

/**
 * What each pile means in words, for the screen.
 *
 * On the screen rather than in a manual nobody opens, because the one
 * question a counsellor asks of a list like this is "why is this person
 * here and not there".
 */
export const FOLLOWUP_BUCKET_NOTE: Record<FollowupBucket, string> = {
  overdue: "Due before today and still waiting.",
  today: "Booked for today.",
  tomorrow: "Booked for tomorrow.",
  week: "Due within the next seven days.",
  later: "Booked further ahead than a week.",
};

export interface FollowupBoundaries {
  /** Midnight IST today, as the UTC instant it really is. */
  startOfToday: Date;
  startOfTomorrow: Date;
  /** Midnight IST at the end of the seven-day window. */
  startOfDayEight: Date;
}

/**
 * Where a follow-up date sits relative to today.
 *
 * A date exactly at midnight today is "today", not overdue — the
 * comparison is half-open at each boundary for the same reason the lead
 * date filters are: a lead booked for 00:00 belongs to the day that is
 * starting, and an inclusive end would put it in two piles at once.
 */
export function bucketFor(at: Date, bounds: FollowupBoundaries): FollowupBucket {
  if (at < bounds.startOfToday) return "overdue";
  if (at < bounds.startOfTomorrow) return "today";
  // Tomorrow is one day wide: the day-eight boundary is seven days out,
  // so "later this week" is the five days between.
  const startOfDayThree = new Date(bounds.startOfTomorrow.getTime() + DAY_MS);
  if (at < startOfDayThree) return "tomorrow";
  if (at < bounds.startOfDayEight) return "week";
  return "later";
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The three instants every comparison above is made against.
 *
 * Derived from the two IST helpers the rest of the app already uses, so
 * "today" means the same thing here as it does on the dashboard queue
 * and in the lead date filters. Seven days is added as seven times the
 * day length rather than through calendar arithmetic: India has no
 * daylight saving, so the two agree, and the simpler one cannot drift.
 */
export function boundariesFrom(startOfToday: Date, startOfTomorrow: Date): FollowupBoundaries {
  return {
    startOfToday,
    startOfTomorrow,
    startOfDayEight: new Date(startOfToday.getTime() + 7 * DAY_MS),
  };
}
