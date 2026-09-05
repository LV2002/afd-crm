/**
 * Batch rosters: who is in a batch, how full it is, and who may still join.
 *
 * Pure, so the rules can be tested without a database. Two of them are
 * easy to get wrong in ways nobody notices until a room is over-booked:
 * a student who LEFT a batch must not count towards its capacity, and a
 * batch at a different centre must never be offered for a student who is
 * not at that centre.
 */

export interface BatchSummary {
  id: string;
  name: string;
  centerId: string;
  centerName: string | null;
  course: string;
  mode: string;
  academicYear: string;
  startDate: string | null;
  endDate: string | null;
  /** Null means no ceiling — a batch nobody has sized yet. */
  capacity: number | null;
  isActive: boolean;
}

export interface Membership {
  studentId: string;
  batchId: string;
  /** Null while the student is still in the batch. */
  leftAt: Date | string | null;
}

/** Members currently in the batch — a membership that ended does not count. */
export function liveMemberCount(memberships: Membership[], batchId: string): number {
  return memberships.filter((m) => m.batchId === batchId && m.leftAt === null).length;
}

export interface BatchCapacity {
  filled: number;
  capacity: number | null;
  /** Null when the batch has no capacity set — "spaces left" has no answer. */
  spacesLeft: number | null;
  isFull: boolean;
  /** True when more people are in it than it holds. Real, and worth showing. */
  isOverCapacity: boolean;
}

export function batchCapacity(filled: number, capacity: number | null): BatchCapacity {
  if (capacity === null) {
    return { filled, capacity: null, spacesLeft: null, isFull: false, isOverCapacity: false };
  }
  const spacesLeft = capacity - filled;
  return {
    filled,
    capacity,
    // Never negative: "-3 spaces left" reads as a bug. Over-capacity is
    // reported by its own flag, which is the honest way to say it.
    spacesLeft: Math.max(0, spacesLeft),
    isFull: spacesLeft <= 0,
    isOverCapacity: spacesLeft < 0,
  };
}

export interface AssignmentCandidate {
  studentCenterId: string | null;
  batch: BatchSummary;
  filled: number;
  alreadyInBatch: boolean;
}

/**
 * Whether a student may be put into a batch, and why not if not.
 *
 * Returns a message rather than a boolean because every refusal here is
 * something the person clicking needs explaining — "the button did
 * nothing" is the worst possible outcome.
 *
 * Capacity is deliberately a WARNING and not a refusal: rooms get one
 * more chair, and a system that flatly refuses the 31st student in a batch
 * of 30 gets worked around by someone editing the capacity, which loses
 * the information entirely. The caller decides whether to insist.
 */
export function checkAssignment(candidate: AssignmentCandidate): {
  allowed: boolean;
  warning: string | null;
  error: string | null;
} {
  const { batch, studentCenterId, filled, alreadyInBatch } = candidate;

  if (alreadyInBatch) {
    return { allowed: false, warning: null, error: "That student is already in this batch." };
  }

  if (!batch.isActive) {
    return {
      allowed: false,
      warning: null,
      error: "That batch is no longer running. Reactivate it first, or pick another.",
    };
  }

  // A student's centre is where they attend. Putting a Kochi student in a
  // Kannur batch is a data-entry mistake every time, not a preference.
  if (studentCenterId !== null && studentCenterId !== batch.centerId) {
    return {
      allowed: false,
      warning: null,
      error: "That batch runs at a different centre from this student's.",
    };
  }

  const capacity = batchCapacity(filled, batch.capacity);
  if (capacity.isFull) {
    return {
      allowed: true,
      warning: `This batch is already at its capacity of ${batch.capacity}. Added anyway — raise the capacity if the room really takes more.`,
      error: null,
    };
  }

  return { allowed: true, warning: null, error: null };
}

/** "Foundation · Offline · 2026-27", the line under a batch's name. */
export function describeBatch(batch: BatchSummary): string {
  return [batch.course, batch.mode, batch.academicYear].filter(Boolean).join(" · ");
}

/**
 * Batches a student could sensibly be put in: their own centre, still
 * running, and not one they are already in. Sorted with the emptiest
 * first, because that is the one somebody usually wants.
 */
export function assignableBatches(
  batches: BatchSummary[],
  filledByBatchId: Map<string, number>,
  studentCenterId: string | null,
  currentBatchIds: Set<string>,
): BatchSummary[] {
  return batches
    .filter((batch) => batch.isActive)
    .filter((batch) => studentCenterId === null || batch.centerId === studentCenterId)
    .filter((batch) => !currentBatchIds.has(batch.id))
    .sort((a, b) => (filledByBatchId.get(a.id) ?? 0) - (filledByBatchId.get(b.id) ?? 0));
}
