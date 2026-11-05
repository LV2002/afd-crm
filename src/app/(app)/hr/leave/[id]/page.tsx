import Link from "next/link";
import { notFound } from "next/navigation";

import { AccessDenied } from "@/components/layout/access-denied";
import { can, getCurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { formatDateIST } from "@/lib/format/date";
import { getEmployee, getRequest } from "@/lib/hr/queries";
import { managerUserId } from "@/lib/hr/service";

import { StatusBadge, kindText, rangeText } from "../../leave-ui";

export const dynamic = "force-dynamic";

/**
 * The leave slip. Shown to the employee it is for, to their manager, and to
 * HR, and to nobody else: the same three the request itself is visible to.
 */
export default async function LeaveSlipPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return <AccessDenied />;
  const { id } = await params;
  const request = await getRequest(id);
  if (!request) notFound();
  const employee = await getEmployee(request.employeeId);
  if (!employee) notFound();

  const isHr = can(user, "hr.read");
  const isSelf = employee.userId === user.id;
  const isManager = (await managerUserId(db, employee.id)) === user.id;
  if (!isHr && !isSelf && !isManager) return <AccessDenied />;

  const approved = request.status === "approved";
  return (
    <div className="flex flex-col gap-4">
      <Link href="/hr/leave" className="text-sm text-muted-foreground underline print:hidden">
        {isHr ? "All leave" : "Back"}
      </Link>
      <article className="max-w-xl rounded-lg border bg-card p-6 print:border-0">
        <header className="flex items-start justify-between border-b pb-3">
          <div>
            <h2 className="text-lg font-semibold">Leave slip #{request.leaveNo}</h2>
            <p className="text-xs text-muted-foreground">
              Applied {formatDateIST(request.createdAt, "d MMM yyyy, h:mm a")}
            </p>
          </div>
          <StatusBadge status={request.status} />
        </header>
        <dl className="mt-4 grid grid-cols-[8rem_1fr] gap-y-2 text-sm">
          <dt className="text-muted-foreground">Employee</dt>
          <dd className="font-medium">
            {employee.name} <span className="font-normal text-muted-foreground">({employee.empNo})</span>
          </dd>
          <dt className="text-muted-foreground">Designation</dt>
          <dd>{employee.designation ?? "—"}</dd>
          <dt className="text-muted-foreground">Leave</dt>
          <dd>{kindText(request.kind)}</dd>
          <dt className="text-muted-foreground">Dates</dt>
          <dd>{rangeText(request)}</dd>
          <dt className="text-muted-foreground">Days</dt>
          <dd>{request.days}</dd>
          {request.reason && (
            <>
              <dt className="text-muted-foreground">Reason</dt>
              <dd>{request.reason}</dd>
            </>
          )}
          {request.decidedByName && (
            <>
              <dt className="text-muted-foreground">{approved ? "Approved by" : "Decided by"}</dt>
              <dd>
                {request.decidedByName}
                {request.decidedAt ? `, ${formatDateIST(request.decidedAt, "d MMM yyyy")}` : ""}
              </dd>
            </>
          )}
          {request.decisionNote && (
            <>
              <dt className="text-muted-foreground">Note</dt>
              <dd>{request.decisionNote}</dd>
            </>
          )}
        </dl>
        {!approved && request.status === "pending" && (
          <p className="mt-4 text-xs text-muted-foreground">Waiting for approval. This slip is final once approved.</p>
        )}
      </article>
    </div>
  );
}
