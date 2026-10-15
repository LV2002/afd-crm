import { desc } from "drizzle-orm";
import { eq, sql } from "drizzle-orm";

import { AccessDenied } from "@/components/layout/access-denied";
import { can, getCurrentUser, scopeFor } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { enrolments, leads, payments } from "@/lib/db/schema";
import { droppedAdmissionFilter } from "@/lib/enrolment/remove-dropped-admissions";
import { formatINR } from "@/lib/format/currency";
import { formatDateIST } from "@/lib/format/date";

import { RemoveForm, type DroppedRow } from "./remove-form";

export const dynamic = "force-dynamic";

/**
 * Remove dropped admissions that were only tests.
 *
 * Leon: the dropped students were all tests of the workflow, and they were
 * counting as dropped admissions in his reports. A real drop is kept on
 * purpose, so this is a separate, deliberate screen — administrators only,
 * a reason, a typed confirmation — rather than a button on every row.
 */
export default async function TestAdmissionsPage() {
  const user = await getCurrentUser();
  if (
    !user ||
    scopeFor(user, "settings.manage") !== "all" ||
    !can(user, "lead.delete") ||
    scopeFor(user, "lead.delete") !== "all"
  ) {
    return <AccessDenied />;
  }

  const dropped = await db
    .select({
      enrolmentId: enrolments.id,
      course: enrolments.course,
      droppedAt: enrolments.droppedAt,
      dropReason: enrolments.dropReason,
      name: leads.studentName,
      leadNumber: leads.leadNumber,
      paymentCount: sql<number>`(select count(*) from ${payments} where ${payments.enrolmentId} = ${enrolments.id})`,
      netPaise: sql<number>`(select coalesce(sum(case when ${payments.direction} = 'credit' then ${payments.amountPaise} else -${payments.amountPaise} end), 0) from ${payments} where ${payments.enrolmentId} = ${enrolments.id})`,
    })
    .from(enrolments)
    .leftJoin(leads, eq(leads.id, enrolments.leadId))
    .where(droppedAdmissionFilter)
    .orderBy(desc(enrolments.droppedAt));

  const rows: DroppedRow[] = dropped.map((row) => ({
    enrolmentId: row.enrolmentId,
    name: row.name ?? "Unknown",
    leadNumber: row.leadNumber ?? null,
    course: row.course,
    droppedOn: row.droppedAt ? formatDateIST(row.droppedAt.toISOString(), "d MMM yyyy") : "—",
    dropReason: row.dropReason,
    paymentCount: Number(row.paymentCount),
    netPayment: formatINR(Number(row.netPaise)),
  }));

  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Remove dropped admissions</h1>
        <p className="text-sm text-muted-foreground">
          For admissions that were only ever tests. Removed admissions disappear from the Accounts
          list, the Students list and every report. Nothing is destroyed — an administrator can put
          them back.
        </p>
      </div>

      <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
        <p>
          <strong>Money is not removed.</strong> Payments live on an append-only ledger that cannot
          be edited, so a test payment stays on it. Reports that start from the admission or the
          lead stop counting it; a total taken straight off the ledger would still include it. To
          take the money out as well, reverse the payment in Accounts first.
        </p>
        <p className="mt-2">
          Only <em>dropped</em> admissions are listed. A live admission has to be dropped first.
        </p>
      </div>

      <RemoveForm rows={rows} />
    </div>
  );
}
