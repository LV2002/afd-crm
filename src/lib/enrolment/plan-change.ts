/**
 * What changed when somebody edits a confirmed admission's course, batch,
 * mode or academic year — and whether the new fee is one the ledger can
 * live with.
 *
 * Pure on purpose. The write itself touches four tables and has to be
 * atomic, but the two judgements worth testing — "did anything actually
 * change, and in what words" and "is this fee legal given what has already
 * been collected" — are arithmetic over plain objects.
 */

export interface PlanSnapshot {
  course: string;
  batchId: string | null;
  mode: string;
  academicYear: string;
}

/**
 * Display names for the codes in a snapshot. Courses and modes are
 * `dropdown_options` values, batches are rows — none of them read as
 * themselves, and a notification saying "Course: dwo → drh" is one nobody
 * can check at a glance.
 */
export interface PlanLabels {
  course: (value: string) => string;
  mode: (value: string) => string;
  batch: (id: string | null) => string;
}

export interface PlanChange {
  field: "course" | "batch" | "mode" | "academicYear";
  label: string;
  from: string;
  to: string;
}

/**
 * The fields that moved, in the order a person reads them.
 *
 * An empty array means nothing changed, which the caller treats as a
 * no-op rather than an error: pressing Save on an untouched form should
 * not write an audit row, fire a notification and tell three departments
 * that a student's course changed to the course it already was.
 */
export function planChanges(
  before: PlanSnapshot,
  after: PlanSnapshot,
  labels: PlanLabels,
): PlanChange[] {
  const changes: PlanChange[] = [];

  if (before.course !== after.course) {
    changes.push({
      field: "course",
      label: "Course",
      from: labels.course(before.course),
      to: labels.course(after.course),
    });
  }
  if (before.batchId !== after.batchId) {
    changes.push({
      field: "batch",
      label: "Batch",
      from: labels.batch(before.batchId),
      to: labels.batch(after.batchId),
    });
  }
  if (before.mode !== after.mode) {
    changes.push({
      field: "mode",
      label: "Mode",
      from: labels.mode(before.mode),
      to: labels.mode(after.mode),
    });
  }
  if (before.academicYear !== after.academicYear) {
    changes.push({
      field: "academicYear",
      label: "Academic year",
      from: before.academicYear,
      to: after.academicYear,
    });
  }

  return changes;
}

/** "Course: Foundation → DWO · Batch: Kochi A → Kochi B", for a notification. */
export function describeChanges(changes: PlanChange[]): string {
  return changes.map((c) => `${c.label}: ${c.from} → ${c.to}`).join(" · ");
}

export interface FeeFloorInput {
  /** The new agreed fee after any discount — what the student would owe. */
  netFeePaise: number;
  /** Credits minus debits on the ledger: money actually received and kept. */
  netPaidPaise: number;
}

/**
 * Whether a new fee is one the ledger can represent.
 *
 * The rule is a floor, not a freeze. Accounts correcting a fee that was
 * typed wrong is ordinary work and must stay possible after money has
 * come in — but a fee set *below* what has already been collected would
 * make the balance negative, and there is no such thing as a student who
 * owes minus three thousand rupees. The institute owes *them*, and that is
 * a refund: a reversal entry against the original payment, which is the
 * one way money leaves this system (CLAUDE.md non-negotiable #7).
 *
 * So the fee can go anywhere at or above what is already paid, and the
 * only blocked move names the refund that has to happen first.
 */
export function checkFeeFloor(input: FeeFloorInput): { allowed: boolean; error: string | null } {
  if (input.netFeePaise >= input.netPaidPaise) {
    return { allowed: true, error: null };
  }
  return { allowed: false, error: "below-paid" };
}
