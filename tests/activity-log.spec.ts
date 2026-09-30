/**
 * "What did my counsellors do today?"
 *
 * Pure functions, no database. The cases that matter are the ones a naive
 * roll-up gets wrong: the counsellor who logged nothing, five calls to one
 * lead, and two people who both rang the same person.
 */
import { describe, expect, it } from "vitest";

import {
  formatTalkTime,
  NO_OUTCOME,
  summariseActivity,
  totalActivity,
  type ActivityInteraction,
  type ActivityMember,
} from "@/lib/reports/activity-log";

const ATHIRA = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const RAHUL = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

const MEMBERS: ActivityMember[] = [
  { userId: ATHIRA, name: "Athira" },
  { userId: RAHUL, name: "Rahul" },
];

let seq = 0;
function log(over: Partial<ActivityInteraction> = {}): ActivityInteraction {
  seq += 1;
  return {
    id: `i-${seq}`,
    leadId: `lead-${seq}`,
    leadName: `Student ${seq}`,
    type: "Call",
    direction: "outbound",
    outcome: "Connected",
    occurredAt: "2026-09-30T05:00:00Z",
    durationSeconds: 120,
    createdBy: ATHIRA,
    notes: null,
    nextFollowupAt: "2026-10-02T05:00:00Z",
    ...over,
  };
}

describe("summariseActivity", () => {
  it("counts what one person did", () => {
    const rows = summariseActivity({
      members: MEMBERS,
      interactions: [
        log({ type: "Call" }),
        log({ type: "Call" }),
        log({ type: "WhatsApp", durationSeconds: null }),
      ],
    });

    const athira = rows.find((r) => r.userId === ATHIRA)!;
    expect(athira.total).toBe(3);
    expect(athira.byType).toEqual([
      { value: "Call", count: 2 },
      { value: "WhatsApp", count: 1 },
    ]);
    expect(athira.talkTimeSeconds).toBe(240);
  });

  it("keeps a counsellor who did nothing, at the bottom", () => {
    // The whole point of the screen. Deriving the rows from the
    // interactions would drop the one person a centre head is looking for.
    const rows = summariseActivity({ members: MEMBERS, interactions: [log()] });

    expect(rows).toHaveLength(2);
    expect(rows.at(-1)!.userId).toBe(RAHUL);
    expect(rows.at(-1)!.total).toBe(0);
    expect(rows.at(-1)!.byType).toEqual([]);
    expect(rows.at(-1)!.talkTimeSeconds).toBe(0);
  });

  it("counts people, not calls", () => {
    // Five attempts at one reluctant parent is one person contacted.
    const rows = summariseActivity({
      members: MEMBERS,
      interactions: [
        log({ leadId: "same", outcome: "Not Reachable" }),
        log({ leadId: "same", outcome: "Not Reachable" }),
        log({ leadId: "same", outcome: "Connected" }),
      ],
    });

    const athira = rows.find((r) => r.userId === ATHIRA)!;
    expect(athira.total).toBe(3);
    expect(athira.peopleContacted).toBe(1);
  });

  it("reports the real outcome names rather than a guessed reached/not-reached", () => {
    const rows = summariseActivity({
      members: MEMBERS,
      interactions: [
        log({ outcome: "Connected" }),
        log({ outcome: "Not Reachable" }),
        log({ outcome: "Not Reachable" }),
        log({ outcome: "Switched Off" }),
      ],
    });

    // Commonest first, alphabetical on a tie — and "Switched Off", a value
    // an admin could add tomorrow, needs no code change to appear.
    expect(rows[0].byOutcome).toEqual([
      { value: "Not Reachable", count: 2 },
      { value: "Connected", count: 1 },
      { value: "Switched Off", count: 1 },
    ]);
  });

  it("groups interactions with no outcome under a named bucket", () => {
    const rows = summariseActivity({
      members: MEMBERS,
      interactions: [log({ outcome: null }), log({ outcome: "" })],
    });
    expect(rows[0].byOutcome).toEqual([{ value: NO_OUTCOME, count: 2 }]);
  });

  it("separates what they initiated from what came in", () => {
    const rows = summariseActivity({
      members: MEMBERS,
      interactions: [
        log({ direction: "outbound" }),
        log({ direction: "outbound" }),
        log({ direction: "inbound" }),
        log({ direction: null }),
      ],
    });

    const athira = rows[0];
    expect(athira.outbound).toBe(2);
    expect(athira.inbound).toBe(1);
    // The one with no direction is counted in neither, but still in the total.
    expect(athira.total).toBe(4);
  });

  it("counts how many got a next step, which is the discipline that matters", () => {
    const rows = summariseActivity({
      members: MEMBERS,
      interactions: [
        log({ nextFollowupAt: "2026-10-02T05:00:00Z" }),
        log({ nextFollowupAt: null }),
      ],
    });
    expect(rows[0].withNextStep).toBe(1);
  });

  it("lists each person's own interactions, newest first", () => {
    const rows = summariseActivity({
      members: MEMBERS,
      interactions: [
        log({ id: "early", occurredAt: "2026-09-30T04:00:00Z" }),
        log({ id: "late", occurredAt: "2026-09-30T11:00:00Z" }),
        log({ id: "theirs", createdBy: RAHUL }),
      ],
    });

    const athira = rows.find((r) => r.userId === ATHIRA)!;
    expect(athira.interactions.map((i) => i.id)).toEqual(["late", "early"]);
    expect(rows.find((r) => r.userId === RAHUL)!.interactions.map((i) => i.id)).toEqual(["theirs"]);
  });

  it("ignores an interaction logged by somebody not on the list", () => {
    const rows = summariseActivity({
      members: [{ userId: ATHIRA, name: "Athira" }],
      interactions: [log({ createdBy: RAHUL }), log({ createdBy: null })],
    });
    expect(rows[0].total).toBe(0);
  });

  it("orders by volume, then by name", () => {
    const rows = summariseActivity({
      members: [
        { userId: ATHIRA, name: "Athira" },
        { userId: RAHUL, name: "Rahul" },
        { userId: "z", name: "Zoya" },
      ],
      interactions: [
        log({ createdBy: RAHUL }),
        log({ createdBy: RAHUL }),
        log({ createdBy: ATHIRA }),
      ],
    });
    expect(rows.map((r) => r.name)).toEqual(["Rahul", "Athira", "Zoya"]);
  });
});

describe("totalActivity", () => {
  it("does not double-count a lead two counsellors both rang", () => {
    const interactions = [
      log({ leadId: "shared", createdBy: ATHIRA }),
      log({ leadId: "shared", createdBy: RAHUL }),
      log({ leadId: "other", createdBy: RAHUL }),
    ];
    const totals = totalActivity(summariseActivity({ members: MEMBERS, interactions }), interactions);

    expect(totals.interactions).toBe(3);
    // Two people between them, not three.
    expect(totals.peopleContacted).toBe(2);
    expect(totals.activeCounsellors).toBe(2);
    expect(totals.silent).toBe(0);
  });

  it("names how many logged nothing", () => {
    const interactions = [log({ createdBy: ATHIRA })];
    const totals = totalActivity(summariseActivity({ members: MEMBERS, interactions }), interactions);

    expect(totals.silent).toBe(1);
    expect(totals.activeCounsellors).toBe(1);
  });

  it("handles a completely quiet day without dividing by anything", () => {
    const totals = totalActivity(summariseActivity({ members: MEMBERS, interactions: [] }), []);

    expect(totals.interactions).toBe(0);
    expect(totals.peopleContacted).toBe(0);
    expect(totals.silent).toBe(2);
    expect(totals.byType).toEqual([]);
  });
});

describe("formatTalkTime", () => {
  it("reads the way a person would say it", () => {
    expect(formatTalkTime(45)).toBe("45s");
    expect(formatTalkTime(120)).toBe("2m");
    expect(formatTalkTime(4320)).toBe("1h 12m");
    expect(formatTalkTime(3600)).toBe("1h");
  });

  it("shows a dash rather than a zero for nothing recorded", () => {
    // Duration is optional on the interaction form, so zero almost always
    // means "not filled in", not "a call that lasted no time".
    expect(formatTalkTime(0)).toBe("—");
  });
});
