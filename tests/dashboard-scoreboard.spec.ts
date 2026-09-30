/**
 * The figures on a counsellor's screen and a centre head's team table.
 *
 * Pure functions, no database. The cases that matter are the ones where a
 * naive count would mislead somebody: an empty denominator, a lead that
 * was reassigned today, and a won lead that should stop appearing in the
 * working pile but still count as an admission.
 */
import { describe, expect, it } from "vitest";

import {
  buildCentreScoreboard,
  buildCounsellorScoreboard,
  buildTeamScoreboard,
  ratePercent,
  terminalStageIdsOf,
  type Boundaries,
  type ScoreboardEnrolment,
  type ScoreboardLead,
  type StageInfo,
} from "@/lib/dashboard/scoreboard";

const ATHIRA = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const RAHUL = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const KOCHI = "cccccccc-cccc-cccc-cccc-cccccccccccc";

const STAGES: StageInfo[] = [
  { id: "s-new", stageType: "open" },
  { id: "s-demo", stageType: "open" },
  { id: "s-won", stageType: "won" },
  { id: "s-lost", stageType: "lost" },
];

/** 30 September 2026, 14:00 IST. Today started at 00:00 IST, the month on the 1st. */
const BOUNDARIES: Boundaries = {
  startOfToday: new Date("2026-09-29T18:30:00Z"),
  startOfTomorrow: new Date("2026-09-30T18:30:00Z"),
  startOfMonth: new Date("2026-08-31T18:30:00Z"),
};

let seq = 0;
function lead(over: Partial<ScoreboardLead> = {}): ScoreboardLead {
  seq += 1;
  return {
    id: `lead-${seq}`,
    assignedTo: ATHIRA,
    centerId: KOCHI,
    stageId: "s-new",
    createdAt: "2026-09-10T06:00:00Z",
    assignedAt: "2026-09-10T06:00:00Z",
    firstResponseAt: "2026-09-10T08:00:00Z",
    nextFollowupAt: null,
    slaBreached: false,
    ...over,
  };
}

function admission(leadId: string, at = "2026-09-15T06:00:00Z"): ScoreboardEnrolment {
  return { leadId, salesToAccountsAt: at, droppedAt: null };
}

describe("ratePercent", () => {
  it("rounds to one decimal", () => {
    expect(ratePercent(1, 3)).toBe(33.3);
    expect(ratePercent(1, 8)).toBe(12.5);
    expect(ratePercent(3, 3)).toBe(100);
  });

  it("is null, not zero, when there is nothing to divide by", () => {
    // A counsellor with no leads this month has an undefined ratio, and
    // "0%" beside their name is an accusation the data cannot support.
    expect(ratePercent(0, 0)).toBeNull();
    expect(ratePercent(5, 0)).toBeNull();
  });

  it("is zero when there were leads and no admissions", () => {
    expect(ratePercent(0, 12)).toBe(0);
  });
});

describe("terminalStageIdsOf", () => {
  it("picks out won and lost only", () => {
    const terminal = terminalStageIdsOf(STAGES);
    expect(terminal.has("s-won")).toBe(true);
    expect(terminal.has("s-lost")).toBe(true);
    expect(terminal.has("s-new")).toBe(false);
  });
});

describe("buildCounsellorScoreboard", () => {
  it("counts an ordinary month", () => {
    const leads = [
      lead({ id: "l1" }),
      lead({ id: "l2" }),
      lead({ id: "l3", stageId: "s-won" }),
    ];
    const result = buildCounsellorScoreboard({
      leads,
      enrolments: [admission("l3")],
      stages: STAGES,
      boundaries: BOUNDARIES,
    });

    // The won lead leaves the working pile but stays in the month's counts.
    expect(result.activeLeads).toBe(2);
    expect(result.newThisMonth).toBe(3);
    expect(result.admissionsThisMonth).toBe(1);
    expect(result.admissionsPerLeadThisMonth).toBe(33.3);
  });

  it("counts a lead reassigned today as assigned today", () => {
    // The whole reason `assigned_at` exists: this lead arrived three weeks
    // ago and landed on this counsellor's desk this morning. Counting by
    // created_at would miss it entirely.
    const result = buildCounsellorScoreboard({
      leads: [
        lead({ createdAt: "2026-09-05T06:00:00Z", assignedAt: "2026-09-30T04:00:00Z" }),
        lead({ createdAt: "2026-09-05T06:00:00Z", assignedAt: "2026-09-05T06:00:00Z" }),
      ],
      enrolments: [],
      stages: STAGES,
      boundaries: BOUNDARIES,
    });

    expect(result.assignedToday).toBe(1);
    expect(result.newThisMonth).toBe(2);
  });

  it("does not count a lead assigned just before midnight as today", () => {
    const result = buildCounsellorScoreboard({
      leads: [lead({ assignedAt: "2026-09-29T18:29:59Z" })],
      enrolments: [],
      stages: STAGES,
      boundaries: BOUNDARIES,
    });
    expect(result.assignedToday).toBe(0);
  });

  it("separates an overdue follow-up from one due today", () => {
    const result = buildCounsellorScoreboard({
      leads: [
        lead({ nextFollowupAt: "2026-09-28T06:00:00Z" }),
        lead({ nextFollowupAt: "2026-09-30T06:00:00Z" }),
        lead({ nextFollowupAt: "2026-10-02T06:00:00Z" }),
        lead({ nextFollowupAt: null }),
      ],
      enrolments: [],
      stages: STAGES,
      boundaries: BOUNDARIES,
    });

    expect(result.overdueFollowups).toBe(1);
    expect(result.dueToday).toBe(1);
  });

  it("ignores an overdue follow-up on a lead already won or lost", () => {
    // Chasing a student who enrolled last week is not work, and counting
    // it as overdue makes the number worth ignoring.
    const result = buildCounsellorScoreboard({
      leads: [
        lead({ stageId: "s-won", nextFollowupAt: "2026-09-20T06:00:00Z" }),
        lead({ stageId: "s-lost", nextFollowupAt: "2026-09-20T06:00:00Z", slaBreached: true }),
      ],
      enrolments: [],
      stages: STAGES,
      boundaries: BOUNDARIES,
    });

    expect(result.overdueFollowups).toBe(0);
    expect(result.slaBreached).toBe(0);
    expect(result.activeLeads).toBe(0);
  });

  it("counts the never-contacted, which is the number worth acting on", () => {
    const result = buildCounsellorScoreboard({
      leads: [
        lead({ firstResponseAt: null }),
        lead({ firstResponseAt: null }),
        lead({ firstResponseAt: "2026-09-11T06:00:00Z" }),
      ],
      enrolments: [],
      stages: STAGES,
      boundaries: BOUNDARIES,
    });

    expect(result.neverContacted).toBe(2);
    expect(result.respondedThisMonth).toBe(1);
  });

  it("leaves out a dropped admission", () => {
    const result = buildCounsellorScoreboard({
      leads: [lead({ id: "l1" })],
      enrolments: [{ leadId: "l1", salesToAccountsAt: "2026-09-15T06:00:00Z", droppedAt: "2026-09-20T06:00:00Z" }],
      stages: STAGES,
      boundaries: BOUNDARIES,
    });
    expect(result.admissionsThisMonth).toBe(0);
  });

  it("leaves out an admission not yet confirmed at gate 1", () => {
    const result = buildCounsellorScoreboard({
      leads: [lead({ id: "l1" })],
      enrolments: [{ leadId: "l1", salesToAccountsAt: null, droppedAt: null }],
      stages: STAGES,
      boundaries: BOUNDARIES,
    });
    expect(result.admissionsThisMonth).toBe(0);
  });

  it("leaves out last month's admission", () => {
    const result = buildCounsellorScoreboard({
      leads: [lead({ id: "l1" })],
      enrolments: [admission("l1", "2026-08-20T06:00:00Z")],
      stages: STAGES,
      boundaries: BOUNDARIES,
    });
    expect(result.admissionsThisMonth).toBe(0);
  });

  it("ignores an enrolment on somebody else's lead", () => {
    const result = buildCounsellorScoreboard({
      leads: [lead({ id: "mine" })],
      enrolments: [admission("not-mine")],
      stages: STAGES,
      boundaries: BOUNDARIES,
    });
    expect(result.admissionsThisMonth).toBe(0);
  });

  it("reports an empty pipeline without dividing by zero", () => {
    const result = buildCounsellorScoreboard({
      leads: [],
      enrolments: [],
      stages: STAGES,
      boundaries: BOUNDARIES,
    });

    expect(result.activeLeads).toBe(0);
    expect(result.newThisMonth).toBe(0);
    expect(result.admissionsPerLeadThisMonth).toBeNull();
  });

  it("treats a lead with no stage as active", () => {
    // Leads arrive from a webhook before any stage is set.
    const result = buildCounsellorScoreboard({
      leads: [lead({ stageId: null })],
      enrolments: [],
      stages: STAGES,
      boundaries: BOUNDARIES,
    });
    expect(result.activeLeads).toBe(1);
  });
});

describe("buildTeamScoreboard", () => {
  const members = [
    { userId: ATHIRA, name: "Athira" },
    { userId: RAHUL, name: "Rahul" },
  ];

  it("gives each counsellor their own figures", () => {
    const rows = buildTeamScoreboard({
      members,
      leads: [
        lead({ id: "a1", assignedTo: ATHIRA }),
        lead({ id: "a2", assignedTo: ATHIRA }),
        lead({ id: "r1", assignedTo: RAHUL }),
      ],
      enrolments: [admission("r1")],
      stages: STAGES,
      boundaries: BOUNDARIES,
    });

    const athira = rows.find((r) => r.userId === ATHIRA)!;
    const rahul = rows.find((r) => r.userId === RAHUL)!;

    expect(athira.scoreboard.activeLeads).toBe(2);
    expect(athira.scoreboard.admissionsThisMonth).toBe(0);
    expect(rahul.scoreboard.activeLeads).toBe(1);
    expect(rahul.scoreboard.admissionsThisMonth).toBe(1);
  });

  it("keeps a counsellor with nothing assigned in the table", () => {
    // The person with an empty pipeline is exactly who a centre head needs
    // to see. Deriving the rows from the leads would drop them.
    const rows = buildTeamScoreboard({
      members,
      leads: [lead({ assignedTo: ATHIRA })],
      enrolments: [],
      stages: STAGES,
      boundaries: BOUNDARIES,
    });

    expect(rows).toHaveLength(2);
    const rahul = rows.find((r) => r.userId === RAHUL)!;
    expect(rahul.scoreboard.activeLeads).toBe(0);
    expect(rahul.scoreboard.admissionsPerLeadThisMonth).toBeNull();
  });

  it("orders by admissions, then active leads, then name", () => {
    const rows = buildTeamScoreboard({
      members: [
        { userId: ATHIRA, name: "Athira" },
        { userId: RAHUL, name: "Rahul" },
        { userId: "z", name: "Zoya" },
      ],
      leads: [
        lead({ id: "r1", assignedTo: RAHUL }),
        lead({ id: "a1", assignedTo: ATHIRA }),
        lead({ id: "a2", assignedTo: ATHIRA }),
      ],
      enrolments: [admission("r1")],
      stages: STAGES,
      boundaries: BOUNDARIES,
    });

    // Rahul has the admission; Athira has more leads than Zoya's none.
    expect(rows.map((r) => r.name)).toEqual(["Rahul", "Athira", "Zoya"]);
  });

  it("ignores leads belonging to nobody on the list", () => {
    const rows = buildTeamScoreboard({
      members: [{ userId: ATHIRA, name: "Athira" }],
      leads: [lead({ assignedTo: RAHUL }), lead({ assignedTo: null })],
      enrolments: [],
      stages: STAGES,
      boundaries: BOUNDARIES,
    });
    expect(rows[0].scoreboard.activeLeads).toBe(0);
  });
});

describe("buildCentreScoreboard", () => {
  it("counts the unassigned, which no team row can", () => {
    // A lead with no owner appears in nobody's row, which is exactly why
    // the centre total has to say it out loud.
    const result = buildCentreScoreboard({
      leads: [
        lead({ assignedTo: ATHIRA }),
        lead({ assignedTo: RAHUL }),
        lead({ assignedTo: null }),
        lead({ assignedTo: null, stageId: "s-lost" }),
      ],
      enrolments: [],
      stages: STAGES,
      boundaries: BOUNDARIES,
    });

    expect(result.activeLeads).toBe(3);
    // The lost one is not waiting for anybody.
    expect(result.unassigned).toBe(1);
  });

  it("totals the whole centre, not one person", () => {
    const result = buildCentreScoreboard({
      leads: [lead({ id: "a1", assignedTo: ATHIRA }), lead({ id: "r1", assignedTo: RAHUL })],
      enrolments: [admission("a1"), admission("r1")],
      stages: STAGES,
      boundaries: BOUNDARIES,
    });

    expect(result.newThisMonth).toBe(2);
    expect(result.admissionsThisMonth).toBe(2);
    expect(result.admissionsPerLeadThisMonth).toBe(100);
  });
});
