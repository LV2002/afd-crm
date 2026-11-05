import Link from "next/link";

import { AccessDenied } from "@/components/layout/access-denied";
import { can, getCurrentUser } from "@/lib/auth/session";
import { getRequests } from "@/lib/hr/queries";

import { DecideButtons } from "../hr-forms";
import { StatusBadge, kindText, rangeText } from "../leave-ui";

export const dynamic = "force-dynamic";

/** Every leave request, for HR. Pending ones can be decided here too. */
export default async function LeavePage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const user = await getCurrentUser();
  if (!user || !can(user, "hr.read")) return <AccessDenied />;
  const { status } = await searchParams;
  const canDecide = can(user, "hr.manage");
  const rows = await getRequests({ status: ["pending", "approved", "rejected", "cancelled"].includes(status ?? "") ? status : undefined });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted-foreground">Show:</span>
        {[["", "All"], ["pending", "Pending"], ["approved", "Approved"], ["rejected", "Turned down"], ["cancelled", "Withdrawn"]].map(([value, label]) => (
          <Link
            key={value}
            href={value ? `/hr/leave?status=${value}` : "/hr/leave"}
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
              <th className="p-2">Slip</th>
              <th className="p-2">Employee</th>
              <th className="p-2">Kind</th>
              <th className="p-2">Dates</th>
              <th className="p-2">Days</th>
              <th className="p-2">Status</th>
              {canDecide && <th className="p-2" />}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t align-top">
                <td className="p-2">
                  <Link href={`/hr/leave/${r.id}`} className="underline">
                    #{r.leaveNo}
                  </Link>
                </td>
                <td className="p-2 font-medium">{r.employeeName}</td>
                <td className="p-2">{kindText(r.kind)}</td>
                <td className="p-2">{rangeText(r)}</td>
                <td className="p-2">{r.days}</td>
                <td className="p-2">
                  <StatusBadge status={r.status} />
                  {r.decidedByName && <p className="text-xs text-muted-foreground">by {r.decidedByName}</p>}
                </td>
                {canDecide && <td className="p-2">{r.status === "pending" && <DecideButtons requestId={r.id} />}</td>}
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="p-6 text-center text-muted-foreground">
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
