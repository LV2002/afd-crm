import { describe, expect, it } from "vitest";

import { buildMyDayQueue, type MyDayLead, type MyDayTask } from "../src/lib/my-day/build-queue";
import { startOfDayIST, startOfTomorrowIST } from "../src/lib/format/date";

function lead(overrides: Partial<MyDayLead> & Pick<MyDayLead, "id">): MyDayLead {
  return {
    leadNumber: 1,
    studentName: "Test Student",
    primaryPhone: "+919847100000",
    temperature: null,
    stageId: null,
    centerId: null,
    nextFollowupAt: null,
    slaBreached: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

// A fixed "now" well clear of IST midnight in either direction, so the
// bucket math below doesn't depend on when the suite happens to run.
const NOW = new Date("2026-08-29T09:00:00.000Z"); // 14:30 IST
const startOfToday = startOfDayIST(NOW);
const startOfTomorrow = startOfTomorrowIST(NOW);

function emptyInput(overrides: Partial<Parameters<typeof buildMyDayQueue>[0]> = {}) {
  return {
    leads: [],
    openTasks: [] as MyDayTask[],
    leadIdsWithInteraction: new Set<string>(),
    startOfToday,
    startOfTomorrow,
    ...overrides,
  };
}

describe("startOfDayIST / startOfTomorrowIST", () => {
  it("puts 09:00 UTC (14:30 IST) and 19:00 UTC (00:30 IST next day) on different IST days", () => {
    const morning = startOfDayIST(new Date("2026-08-29T09:00:00.000Z"));
    const lateNight = startOfDayIST(new Date("2026-08-29T19:00:00.000Z")); // 00:30 IST on the 30th
    expect(morning.toISOString()).not.toBe(lateNight.toISOString());
  });

  it("start of tomorrow is exactly 24h after start of today (no DST in IST)", () => {
    const diffMs = startOfTomorrow.getTime() - startOfToday.getTime();
    expect(diffMs).toBe(24 * 60 * 60 * 1000);
  });

  it("IST midnight is 18:30 UTC the previous calendar day", () => {
    // 2026-08-29T00:00:00+05:30 == 2026-08-28T18:30:00Z
    expect(startOfDayIST(new Date("2026-08-29T09:00:00.000Z")).toISOString()).toBe(
      "2026-08-28T18:30:00.000Z",
    );
  });
});

describe("buildMyDayQueue", () => {
  it("returns all-empty buckets for no leads", () => {
    const queue = buildMyDayQueue(emptyInput());
    expect(queue).toEqual({ overdue: [], dueToday: [], newAssignments: [], atRisk: [] });
  });

  it("buckets a lead with a past-due follow-up as overdue", () => {
    const l = lead({ id: "l1", nextFollowupAt: "2026-08-27T00:00:00.000Z" });
    const queue = buildMyDayQueue(
      emptyInput({ leads: [l], leadIdsWithInteraction: new Set(["l1"]) }),
    );
    expect(queue.overdue).toHaveLength(1);
    expect(queue.overdue[0].reason.kind).toBe("followup_overdue");
    expect(queue.dueToday).toHaveLength(0);
  });

  it("buckets a lead with a follow-up later today as due today, not overdue", () => {
    const laterToday = new Date(startOfToday.getTime() + 2 * 60 * 60 * 1000).toISOString();
    const l = lead({ id: "l1", nextFollowupAt: laterToday });
    const queue = buildMyDayQueue(
      emptyInput({ leads: [l], leadIdsWithInteraction: new Set(["l1"]) }),
    );
    expect(queue.dueToday).toHaveLength(1);
    expect(queue.dueToday[0].reason.kind).toBe("followup_due_today");
    expect(queue.overdue).toHaveLength(0);
  });

  it("ignores a follow-up scheduled for tomorrow or later", () => {
    const l = lead({ id: "l1", nextFollowupAt: startOfTomorrow.toISOString() });
    const queue = buildMyDayQueue(
      emptyInput({ leads: [l], leadIdsWithInteraction: new Set(["l1"]) }),
    );
    expect(queue.overdue).toHaveLength(0);
    expect(queue.dueToday).toHaveLength(0);
    expect(queue.newAssignments).toHaveLength(0);
    expect(queue.atRisk).toHaveLength(0);
  });

  it("an overdue open task outranks a not-yet-due follow-up", () => {
    const l = lead({ id: "l1", nextFollowupAt: startOfTomorrow.toISOString() });
    const task: MyDayTask = { id: "t1", leadId: "l1", title: "Send brochure", dueAt: "2026-08-27T00:00:00.000Z" };
    const queue = buildMyDayQueue(
      emptyInput({ leads: [l], openTasks: [task], leadIdsWithInteraction: new Set(["l1"]) }),
    );
    expect(queue.overdue).toHaveLength(1);
    expect(queue.overdue[0].reason).toMatchObject({ kind: "task_overdue", taskTitle: "Send brochure" });
  });

  it("picks the earlier of two open tasks for the same lead", () => {
    const l = lead({ id: "l1" });
    const tasks: MyDayTask[] = [
      { id: "t1", leadId: "l1", title: "Later task", dueAt: "2026-08-27T12:00:00.000Z" },
      { id: "t2", leadId: "l1", title: "Earlier task", dueAt: "2026-08-26T00:00:00.000Z" },
    ];
    const queue = buildMyDayQueue(
      emptyInput({ leads: [l], openTasks: tasks, leadIdsWithInteraction: new Set(["l1"]) }),
    );
    expect(queue.overdue[0].reason.taskTitle).toBe("Earlier task");
  });

  it("a lead with no interaction ever logged is a new assignment, even with a future task", () => {
    const l = lead({ id: "l1" });
    const task: MyDayTask = { id: "t1", leadId: "l1", title: "Future task", dueAt: startOfTomorrow.toISOString() };
    const queue = buildMyDayQueue(emptyInput({ leads: [l], openTasks: [task] })); // no interaction recorded
    expect(queue.newAssignments).toHaveLength(1);
    expect(queue.newAssignments[0].reason.kind).toBe("new_assignment");
  });

  it("an untouched lead with an overdue task is overdue, not a new assignment", () => {
    const l = lead({ id: "l1" });
    const task: MyDayTask = { id: "t1", leadId: "l1", title: "Call back", dueAt: "2026-08-27T00:00:00.000Z" };
    const queue = buildMyDayQueue(emptyInput({ leads: [l], openTasks: [task] })); // no interaction recorded
    expect(queue.overdue).toHaveLength(1);
    expect(queue.newAssignments).toHaveLength(0);
  });

  it("flags sla_breached as at-risk when nothing else applies", () => {
    const l = lead({ id: "l1", slaBreached: true });
    const queue = buildMyDayQueue(
      emptyInput({ leads: [l], leadIdsWithInteraction: new Set(["l1"]) }),
    );
    expect(queue.atRisk).toHaveLength(1);
    expect(queue.atRisk[0].reason.kind).toBe("at_risk_sla");
  });

  it("flags a hot lead with nothing scheduled as at-risk", () => {
    const l = lead({ id: "l1", temperature: "hot" });
    const queue = buildMyDayQueue(
      emptyInput({ leads: [l], leadIdsWithInteraction: new Set(["l1"]) }),
    );
    expect(queue.atRisk).toHaveLength(1);
    expect(queue.atRisk[0].reason.kind).toBe("at_risk_stalled");
  });

  it("a hot lead with a follow-up already scheduled is not at-risk", () => {
    const l = lead({ id: "l1", temperature: "hot", nextFollowupAt: startOfTomorrow.toISOString() });
    const queue = buildMyDayQueue(
      emptyInput({ leads: [l], leadIdsWithInteraction: new Set(["l1"]) }),
    );
    expect(queue.atRisk).toHaveLength(0);
  });

  it("a contacted, non-hot, non-breached lead with nothing due appears nowhere", () => {
    const l = lead({ id: "l1", temperature: "warm" });
    const queue = buildMyDayQueue(
      emptyInput({ leads: [l], leadIdsWithInteraction: new Set(["l1"]) }),
    );
    expect(queue.overdue).toHaveLength(0);
    expect(queue.dueToday).toHaveLength(0);
    expect(queue.newAssignments).toHaveLength(0);
    expect(queue.atRisk).toHaveLength(0);
  });

  it("every lead lands in at most one bucket, in overdue > due-today > new > at-risk priority", () => {
    const overdueAndHot = lead({ id: "l1", temperature: "hot", nextFollowupAt: "2026-08-27T00:00:00.000Z" });
    const queue = buildMyDayQueue(
      emptyInput({ leads: [overdueAndHot], leadIdsWithInteraction: new Set(["l1"]) }),
    );
    expect(queue.overdue).toHaveLength(1);
    expect(queue.atRisk).toHaveLength(0);
  });

  it("sorts overdue and due-today by due date ascending", () => {
    const l1 = lead({ id: "l1", nextFollowupAt: "2026-08-25T00:00:00.000Z" });
    const l2 = lead({ id: "l2", nextFollowupAt: "2026-08-20T00:00:00.000Z" });
    const queue = buildMyDayQueue(
      emptyInput({ leads: [l1, l2], leadIdsWithInteraction: new Set(["l1", "l2"]) }),
    );
    expect(queue.overdue.map((i) => i.lead.id)).toEqual(["l2", "l1"]);
  });

  it("sorts new assignments by creation date ascending (oldest untouched first)", () => {
    const l1 = lead({ id: "l1", createdAt: "2026-08-20T00:00:00.000Z" });
    const l2 = lead({ id: "l2", createdAt: "2026-08-10T00:00:00.000Z" });
    const queue = buildMyDayQueue(emptyInput({ leads: [l1, l2] }));
    expect(queue.newAssignments.map((i) => i.lead.id)).toEqual(["l2", "l1"]);
  });
});
