/**
 * My Day (docs/02-BUILD-PHASES.md § Phase 2): "overdue → due today → new
 * assignments → at-risk", in that priority order — each lead lands in
 * exactly one bucket, the most urgent one that applies, so the same lead
 * never has to be worked twice off two different lists.
 *
 * Pure logic, no DB access, so it's fully unit-testable the same way
 * normalizePhone()/the assignment evaluator are (CLAUDE.md's testing
 * list): the page component does the fetching and hands in plain data.
 */

export interface MyDayLead {
  id: string;
  leadNumber: number;
  studentName: string;
  primaryPhone: string;
  temperature: string | null;
  stageId: string | null;
  centerId: string | null;
  nextFollowupAt: string | null;
  slaBreached: boolean;
  createdAt: string;
}

export interface MyDayTask {
  id: string;
  leadId: string;
  title: string;
  dueAt: string;
}

export type MyDayReasonKind =
  | "task_overdue"
  | "task_due_today"
  | "followup_overdue"
  | "followup_due_today"
  | "new_assignment"
  | "at_risk_sla"
  | "at_risk_stalled";

export interface MyDayReason {
  kind: MyDayReasonKind;
  /** ISO timestamp, only present for the due-date-driven reason kinds. */
  dueAt?: string;
  /** Only present for task_* kinds. */
  taskTitle?: string;
}

export interface MyDayItem {
  lead: MyDayLead;
  reason: MyDayReason;
}

export interface MyDayQueue {
  overdue: MyDayItem[];
  dueToday: MyDayItem[];
  newAssignments: MyDayItem[];
  atRisk: MyDayItem[];
}

export interface BuildMyDayQueueInput {
  /** Already filtered by the caller: assigned to this user, not soft-deleted, not in a won/lost stage. */
  leads: MyDayLead[];
  /** Open tasks for those same leads. */
  openTasks: MyDayTask[];
  /** Lead ids that have at least one interactions row ever logged. */
  leadIdsWithInteraction: ReadonlySet<string>;
  /** Both in UTC — see startOfDayIST()/startOfTomorrowIST() in lib/format/date.ts. */
  startOfToday: Date;
  startOfTomorrow: Date;
}

export function buildMyDayQueue(input: BuildMyDayQueueInput): MyDayQueue {
  const { leads, openTasks, leadIdsWithInteraction, startOfToday, startOfTomorrow } = input;

  const earliestTaskByLead = new Map<string, MyDayTask>();
  for (const task of openTasks) {
    const existing = earliestTaskByLead.get(task.leadId);
    if (!existing || new Date(task.dueAt) < new Date(existing.dueAt)) {
      earliestTaskByLead.set(task.leadId, task);
    }
  }

  const queue: MyDayQueue = { overdue: [], dueToday: [], newAssignments: [], atRisk: [] };

  for (const lead of leads) {
    const task = earliestTaskByLead.get(lead.id);
    const taskDue = task ? new Date(task.dueAt) : null;
    const followupDue = lead.nextFollowupAt ? new Date(lead.nextFollowupAt) : null;

    // A task due date and a scheduled follow-up can both exist for the same
    // lead; the queue surfaces one reason per lead, so the earlier (more
    // urgent) of the two wins.
    const dueCandidates = [
      taskDue && { due: taskDue, isTask: true as const },
      followupDue && { due: followupDue, isTask: false as const },
    ].filter((c): c is { due: Date; isTask: boolean } => c !== null && c !== undefined);
    dueCandidates.sort((a, b) => a.due.getTime() - b.due.getTime());
    const earliest = dueCandidates[0];

    let reason: MyDayReason | null = null;

    if (earliest && earliest.due < startOfToday) {
      reason = earliest.isTask
        ? { kind: "task_overdue", dueAt: earliest.due.toISOString(), taskTitle: task!.title }
        : { kind: "followup_overdue", dueAt: earliest.due.toISOString() };
    } else if (earliest && earliest.due < startOfTomorrow) {
      reason = earliest.isTask
        ? { kind: "task_due_today", dueAt: earliest.due.toISOString(), taskTitle: task!.title }
        : { kind: "followup_due_today", dueAt: earliest.due.toISOString() };
    }

    // A lead with no interaction logged yet is untouched regardless of
    // whether a task happens to exist for it — creating a task isn't
    // "contact" (CLAUDE.md's mandatory next-action lives on interactions,
    // not tasks).
    if (!reason && !leadIdsWithInteraction.has(lead.id)) {
      reason = { kind: "new_assignment" };
    }

    // SLA breach detection (a real cron computing `sla_breached`) isn't
    // built yet — see docs/DECISIONS.md — so a hot lead with nothing
    // scheduled is the honest proxy available today: it's the one signal
    // that already exists (temperature + the absence of a planned next
    // step) for "this is about to fall through the cracks."
    if (!reason && lead.slaBreached) {
      reason = { kind: "at_risk_sla" };
    }
    if (!reason && lead.temperature === "hot" && !lead.nextFollowupAt) {
      reason = { kind: "at_risk_stalled" };
    }

    if (!reason) continue;

    const item: MyDayItem = { lead, reason };
    switch (reason.kind) {
      case "task_overdue":
      case "followup_overdue":
        queue.overdue.push(item);
        break;
      case "task_due_today":
      case "followup_due_today":
        queue.dueToday.push(item);
        break;
      case "new_assignment":
        queue.newAssignments.push(item);
        break;
      case "at_risk_sla":
      case "at_risk_stalled":
        queue.atRisk.push(item);
        break;
    }
  }

  const byDueAtAscending = (a: MyDayItem, b: MyDayItem) =>
    new Date(a.reason.dueAt!).getTime() - new Date(b.reason.dueAt!).getTime();
  queue.overdue.sort(byDueAtAscending);
  queue.dueToday.sort(byDueAtAscending);
  queue.newAssignments.sort(
    (a, b) => new Date(a.lead.createdAt).getTime() - new Date(b.lead.createdAt).getTime(),
  );
  queue.atRisk.sort((a, b) => a.lead.leadNumber - b.lead.leadNumber);

  return queue;
}
