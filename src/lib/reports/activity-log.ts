/**
 * What a counsellor actually did today.
 *
 * A centre head's real question is not "how is the pipeline" — the
 * dashboard answers that — but "did my people work yesterday, and on
 * whom". Until now the only record of that was the timeline on each
 * individual lead, so answering it meant opening forty leads.
 *
 * Pure: rows in, summaries out. No database, no clock.
 *
 * ## Why outcomes are not classified into reached / not reached
 *
 * `interaction_outcome` is a `dropdown_options` category, so the values are
 * whatever the institute configured — "Connected", "Not Reachable", "Wrong
 * Number", "Switched Off", anything. Hardcoding which of those count as a
 * successful contact would be exactly the kind of buried list CLAUDE.md
 * says must live in the database, and it would silently misclassify every
 * outcome an admin adds later.
 *
 * So the breakdown reports the real outcome names with their counts. "How
 * many did not respond" is then a number the reader can see rather than one
 * this module has guessed at — and it stays correct when the list changes.
 */

export interface ActivityInteraction {
  id: string;
  leadId: string;
  /** The lead's name, resolved by the caller so this stays pure. */
  leadName: string;
  /** `dropdown_options` category `interaction_type` — Call, WhatsApp, Email, Walk-in. */
  type: string;
  direction: "inbound" | "outbound" | null;
  outcome: string | null;
  occurredAt: string;
  durationSeconds: number | null;
  createdBy: string | null;
  notes: string | null;
  nextFollowupAt: string | null;
}

export interface ActivityMember {
  userId: string;
  name: string;
}

export interface CountedValue {
  value: string;
  count: number;
}

export interface CounsellorActivity {
  userId: string;
  name: string;
  /** Every interaction they logged in the window, newest first. */
  interactions: ActivityInteraction[];
  total: number;
  /** How many distinct people they touched — five calls to one lead is one person. */
  peopleContacted: number;
  /** Counts per interaction type, commonest first. */
  byType: CountedValue[];
  /** Counts per recorded outcome, commonest first. Entries with no outcome are grouped. */
  byOutcome: CountedValue[];
  /** Outbound only — what they initiated, as opposed to what came in. */
  outbound: number;
  inbound: number;
  /** Total logged call time, in seconds, where duration was recorded. */
  talkTimeSeconds: number;
  /** How many of their logged interactions set a next follow-up date. */
  withNextStep: number;
}

/** No outcome recorded. Named rather than blank so it cannot be mistaken for a configured value. */
export const NO_OUTCOME = "Not recorded";

/** Descending by count, then alphabetical, so the order is stable between refreshes. */
function tally(values: ReadonlyArray<string | null>, fallback: string): CountedValue[] {
  const counts = new Map<string, number>();
  for (const raw of values) {
    const key = raw && raw.trim() !== "" ? raw : fallback;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => (b.count !== a.count ? b.count - a.count : a.value.localeCompare(b.value)));
}

function summariseOne(
  member: ActivityMember,
  interactions: readonly ActivityInteraction[],
): CounsellorActivity {
  const mine = [...interactions].sort(
    (a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime(),
  );

  return {
    userId: member.userId,
    name: member.name,
    interactions: mine,
    total: mine.length,
    peopleContacted: new Set(mine.map((row) => row.leadId)).size,
    byType: tally(
      mine.map((row) => row.type),
      "Unspecified",
    ),
    byOutcome: tally(
      mine.map((row) => row.outcome),
      NO_OUTCOME,
    ),
    outbound: mine.filter((row) => row.direction === "outbound").length,
    inbound: mine.filter((row) => row.direction === "inbound").length,
    talkTimeSeconds: mine.reduce((sum, row) => sum + (row.durationSeconds ?? 0), 0),
    withNextStep: mine.filter((row) => row.nextFollowupAt !== null).length,
  };
}

/**
 * One summary per person, busiest first.
 *
 * `members` is passed in rather than derived from the interactions, so
 * somebody who logged **nothing** still gets a row. That is the entire point
 * of the screen: a counsellor with no activity is what a centre head is
 * looking for, and deriving the list from the data would hide exactly that
 * person.
 *
 * Ties break alphabetically so the order does not shuffle between refreshes,
 * and the zero rows sort to the bottom rather than being dropped.
 */
export function summariseActivity(input: {
  members: readonly ActivityMember[];
  interactions: readonly ActivityInteraction[];
}): CounsellorActivity[] {
  const byPerson = new Map<string, ActivityInteraction[]>();
  for (const row of input.interactions) {
    if (!row.createdBy) continue;
    const list = byPerson.get(row.createdBy);
    if (list) list.push(row);
    else byPerson.set(row.createdBy, [row]);
  }

  return input.members
    .map((member) => summariseOne(member, byPerson.get(member.userId) ?? []))
    .sort((a, b) => (b.total !== a.total ? b.total - a.total : a.name.localeCompare(b.name)));
}

export interface ActivityTotals {
  interactions: number;
  peopleContacted: number;
  byType: CountedValue[];
  byOutcome: CountedValue[];
  /** How many of the people listed logged nothing at all. */
  silent: number;
  activeCounsellors: number;
}

/**
 * The same window across everybody.
 *
 * `peopleContacted` is recomputed from the interactions rather than summed
 * across the rows: two counsellors who both rang the same lead touched one
 * person between them, and adding their figures would say two.
 */
export function totalActivity(
  summaries: readonly CounsellorActivity[],
  interactions: readonly ActivityInteraction[],
): ActivityTotals {
  return {
    interactions: interactions.length,
    peopleContacted: new Set(interactions.map((row) => row.leadId)).size,
    byType: tally(
      interactions.map((row) => row.type),
      "Unspecified",
    ),
    byOutcome: tally(
      interactions.map((row) => row.outcome),
      NO_OUTCOME,
    ),
    silent: summaries.filter((row) => row.total === 0).length,
    activeCounsellors: summaries.filter((row) => row.total > 0).length,
  };
}

/** "1h 12m", "12m", "45s". Blank when nothing was recorded. */
export function formatTalkTime(seconds: number): string {
  if (seconds <= 0) return "—";
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}
