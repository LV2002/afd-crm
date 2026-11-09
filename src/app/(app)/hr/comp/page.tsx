import Link from "next/link";

import { AccessDenied } from "@/components/layout/access-denied";
import { can, getCurrentUser } from "@/lib/auth/session";
import { getCompRequests } from "@/lib/hr/queries";

import { CompDecideButtons } from "../comp-forms";
import { StatusBadge, dayText } from "../leave-ui";

export const dynamic = "force-dynamic";

const part = (p: "full" | "half") => (p === "half" ? "half day" : "full day");

/** Every comp working day request, for HR. Pending ones can be decided here too. */
export default async function CompDaysPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const user = await getCurrentUser();
  if (!user || !can(user, "hr.read")) return <AccessDenied />;
  const { status } = await searchParams;
  const canDecide = can(user, "hr.manage");
  const rows = await getCompRequests({
    status: ["pending", "approved", "rejected", "cancelled"].includes(status ?? "") ? status : undefined,
    limit: 300,
  });

  return (
    <div className="flex flex-col gap-4">
      <p className="max-w-2xl text-sm text-muted-foreground">
        Staff working a day off (or a holiday) in return for another day off. An approved request covers the day off in attendance and payroll, so it is
        not charged as loss of pay.
      </p>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted-foreground">Show:</span>
        {[["", "All"], ["pending", "Pending"], ["approved", "Approved"], ["rejected", "Turned down"], ["cancelled", "Withdrawn"]].map(([value, label]) => (
          <Link
            key={value}
            href={value ? `/hr/comp?status=${value}` : "/hr/comp"}
            className={`rounded-md px-2.5 py-1 ${(status ?? "") === value ? "bg-secondary font-medium" : "text-muted-foreground hover:bg-accent/50"}`}
          >
            {label}
          </Link>
        ))}
      </div>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
            <tr>
              <th className="p-2">Employee</th>
              <th className="p-2">Works</th>
              <th className="p-2">Takes off</th>
              <th className="p-2">Reason</th>
              <th className="p-2">Status</th>
              {canDecide && <th className="p-2" />}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t align-top">
                <td className="p-2 font-medium">{r.employeeName}</td>
                <td className="p-2">
                  {dayText(r.workDate)} <span className="text-muted-foreground">({part(r.workPart)})</span>
                </td>
                <td className="p-2">
                  {dayText(r.offDate)} <span className="text-muted-foreground">({part(r.offPart)})</span>
                </td>
                <td className="p-2 text-muted-foreground">{r.reason ?? "—"}</td>
                <td className="p-2">
                  <StatusBadge status={r.status} />
                  {r.decidedByName && <p className="text-xs text-muted-foreground">by {r.decidedByName}</p>}
                  {r.decisionNote && <p className="text-xs text-muted-foreground">{r.decisionNote}</p>}
                </td>
                {canDecide && <td className="p-2">{r.status === "pending" && <CompDecideButtons requestId={r.id} />}</td>}
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={canDecide ? 6 : 5} className="p-6 text-center text-muted-foreground">
                  Nothing here.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
