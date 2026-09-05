import "server-only";

import { and, desc, inArray, isNull } from "drizzle-orm";

import { db } from "@/lib/db/client";
import {
  batches,
  centers,
  enrolmentInstalments,
  enrolments,
  payments,
  profiles,
} from "@/lib/db/schema";
import { allocatePayments } from "@/lib/finance/allocate";
import { formatINR } from "@/lib/format/currency";
import { formatDateIST } from "@/lib/format/date";

import { firstName } from "./personalise";
import type { MergeEntity } from "./merge-variables";

/**
 * Filling in each recipient's own words.
 *
 * `merge-variables.ts` says what exists; this fetches it. Everything is
 * done for the WHOLE audience in a handful of queries rather than per
 * person — a four-hundred-recipient broadcast that looked up a centre
 * name four hundred times would take longer to compose than to send.
 *
 * Only the variables actually used are resolved. Nobody pays for the fee
 * allocation on a broadcast that just says "Hi Anjali".
 *
 * ## Why the direct client
 *
 * The subjects handed in here came out of `resolveAudience`, which reads
 * through the composer's own RLS-bound client — so every person named
 * below was already visible to them. These lookups only decorate that
 * list: a centre's name, a counsellor's name, what the person owes on
 * their own admission. Re-reading them through RLS would mean a
 * marketing user without finance read composing a fee reminder that
 * silently said "₹0" to everybody, which is worse than the alternative in
 * every direction.
 */

export interface MergeSubject {
  id: string;
  /** The name already read off the record by `resolveAudience`. */
  name: string;
  /** The raw row. Server-side only — never serialise this to a client. */
  record: Record<string, unknown>;
}

/** Values for one person, keyed by merge variable. A blank string means "we don't know", and the fallback takes over. */
export type MergeValues = Record<string, string>;

function readString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  return typeof value === "string" ? value.trim() : "";
}

function readUuid(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return typeof value === "string" && value ? value : null;
}

/**
 * A lead's course is an array — somebody can enquire about NID and NIFT
 * at once. The first is used rather than a joined list, because "your NID,
 * NIFT class starts Monday" is not a sentence anybody wants to receive.
 */
function firstCourse(record: Record<string, unknown>): string {
  const value = record.courses_interested;
  if (Array.isArray(value)) {
    const first = value.find((entry) => typeof entry === "string" && entry.trim());
    return typeof first === "string" ? first.trim() : "";
  }
  return typeof value === "string" ? value.trim() : "";
}

async function namesById(
  ids: string[],
  table: typeof centers | typeof batches,
): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const rows = await db
    .select({ id: table.id, name: table.name })
    .from(table)
    .where(inArray(table.id, ids));
  return new Map(rows.map((row) => [row.id, row.name]));
}

/**
 * What this person still owes, and when the next piece of it falls due.
 *
 * Uses the same `allocatePayments` as Collections and the overdue
 * reminder sweep, so a message saying "₹45,000 outstanding" and the
 * Collections screen can never disagree — the one thing guaranteed to
 * cost the institute a difficult phone call.
 */
async function feeValues(
  entity: MergeEntity,
  subjectIds: string[],
): Promise<Map<string, { amountDue: string; nextDueDate: string }>> {
  const out = new Map<string, { amountDue: string; nextDueDate: string }>();
  if (subjectIds.length === 0) return out;

  const subjectColumn = entity === "lead" ? enrolments.leadId : enrolments.studentId;
  const liveEnrolments = await db
    .select({
      id: enrolments.id,
      leadId: enrolments.leadId,
      studentId: enrolments.studentId,
    })
    .from(enrolments)
    .where(
      and(
        inArray(subjectColumn, subjectIds),
        isNull(enrolments.deletedAt),
        // Somebody who left is not being asked for money in a marketing
        // message.
        isNull(enrolments.droppedAt),
      ),
    )
    .orderBy(desc(enrolments.createdAt));

  if (liveEnrolments.length === 0) return out;

  // Most recent admission per person: a repeat student has two, and the
  // one they are currently paying for is the newer.
  const enrolmentBySubject = new Map<string, string>();
  for (const row of liveEnrolments) {
    const subjectId = entity === "lead" ? row.leadId : row.studentId;
    if (subjectId && !enrolmentBySubject.has(subjectId)) enrolmentBySubject.set(subjectId, row.id);
  }

  const enrolmentIds = [...enrolmentBySubject.values()];
  const [instalmentRows, paymentRows] = await Promise.all([
    db
      .select()
      .from(enrolmentInstalments)
      .where(inArray(enrolmentInstalments.enrolmentId, enrolmentIds)),
    db
      .select({
        id: payments.id,
        enrolmentId: payments.enrolmentId,
        amountPaise: payments.amountPaise,
        direction: payments.direction,
        receivedAt: payments.receivedAt,
      })
      .from(payments)
      .where(inArray(payments.enrolmentId, enrolmentIds)),
  ]);

  const asOf = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
  }).format(new Date());

  for (const [subjectId, enrolmentId] of enrolmentBySubject) {
    const schedule = instalmentRows
      .filter((row) => row.enrolmentId === enrolmentId)
      .map((row) => ({
        id: row.id,
        sequence: row.sequence,
        dueDate: row.dueDate,
        amountPaise: row.amountPaise,
      }));
    if (schedule.length === 0) continue;

    const received = paymentRows
      .filter((row) => row.enrolmentId === enrolmentId)
      .map((row) => ({
        id: row.id,
        // A debit is a reversal or refund — it puts the money back on the
        // schedule, exactly as the reminder sweep treats it.
        amountPaise: row.direction === "credit" ? row.amountPaise : -row.amountPaise,
        receivedOn: row.receivedAt.toISOString().slice(0, 10),
      }));

    const settled = allocatePayments(schedule, received, asOf).instalments;
    const owing = settled.filter((row) => row.outstandingPaise > 0);
    const total = owing.reduce((sum, row) => sum + row.outstandingPaise, 0);
    if (total <= 0) continue;

    const next = owing.reduce((earliest, row) => (row.dueDate < earliest.dueDate ? row : earliest));

    out.set(subjectId, {
      amountDue: formatINR(total),
      nextDueDate: formatDateIST(next.dueDate, "d MMM yyyy"),
    });
  }

  return out;
}

export async function resolveMergeValues(
  entity: MergeEntity,
  subjects: MergeSubject[],
  keys: string[],
): Promise<Map<string, MergeValues>> {
  const wanted = new Set(keys);
  const values = new Map<string, MergeValues>(subjects.map((subject) => [subject.id, {}]));
  if (subjects.length === 0 || wanted.size === 0) return values;

  // Name variables need nothing beyond what the audience already read.
  for (const subject of subjects) {
    const row = values.get(subject.id)!;
    if (wanted.has("full_name")) row.full_name = subject.name;
    if (wanted.has("first_name")) row.first_name = firstName(subject.name);
    if (wanted.has("course")) {
      row.course =
        entity === "lead"
          ? firstCourse(subject.record)
          : readString(subject.record, "current_course");
    }
  }

  const lookups: Array<Promise<void>> = [];

  if (wanted.has("center_name")) {
    const ids = [
      ...new Set(
        subjects
          .map((s) => readUuid(s.record, "center_id"))
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    lookups.push(
      namesById(ids, centers).then((byId) => {
        for (const subject of subjects) {
          const centerId = readUuid(subject.record, "center_id");
          values.get(subject.id)!.center_name = (centerId && byId.get(centerId)) || "";
        }
      }),
    );
  }

  if (wanted.has("batch_name")) {
    const ids = [
      ...new Set(
        subjects
          .map((s) => readUuid(s.record, "current_batch_id"))
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    lookups.push(
      namesById(ids, batches).then((byId) => {
        for (const subject of subjects) {
          const batchId = readUuid(subject.record, "current_batch_id");
          values.get(subject.id)!.batch_name = (batchId && byId.get(batchId)) || "";
        }
      }),
    );
  }

  if (wanted.has("counsellor_name")) {
    const ids = [
      ...new Set(
        subjects
          .map((s) => readUuid(s.record, "assigned_to"))
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    lookups.push(
      (async () => {
        const rows = ids.length
          ? await db
              .select({ id: profiles.id, fullName: profiles.fullName })
              .from(profiles)
              .where(inArray(profiles.id, ids))
          : [];
        const byId = new Map(rows.map((row) => [row.id, row.fullName]));
        for (const subject of subjects) {
          const ownerId = readUuid(subject.record, "assigned_to");
          // The counsellor's first name: "reply to Athira" is how a
          // student thinks of them, not "Athira Suresh Kumar".
          const full = (ownerId && byId.get(ownerId)) || "";
          values.get(subject.id)!.counsellor_name = full ? firstName(full) : "";
        }
      })(),
    );
  }

  if (wanted.has("amount_due") || wanted.has("next_due_date")) {
    lookups.push(
      feeValues(
        entity,
        subjects.map((subject) => subject.id),
      ).then((byId) => {
        for (const subject of subjects) {
          const fees = byId.get(subject.id);
          if (wanted.has("amount_due")) values.get(subject.id)!.amount_due = fees?.amountDue ?? "";
          if (wanted.has("next_due_date")) {
            values.get(subject.id)!.next_due_date = fees?.nextDueDate ?? "";
          }
        }
      }),
    );
  }

  await Promise.all(lookups);
  return values;
}
