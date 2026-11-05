import Link from "next/link";
import { notFound } from "next/navigation";

import { AccessDenied } from "@/components/layout/access-denied";
import { can, getCurrentUser } from "@/lib/auth/session";
import { balanceFor, getCenterOptions, getEmployee, getEmployees, getLoginOptions, getRequests } from "@/lib/hr/queries";

import { EmployeeForm } from "../../hr-forms";
import { BalanceCards, StatusBadge, kindText, rangeText } from "../../leave-ui";

export const dynamic = "force-dynamic";

export default async function EmployeePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user || !can(user, "hr.read")) return <AccessDenied />;
  const { id } = await params;
  const employee = await getEmployee(id);
  if (!employee) notFound();
  const canManage = can(user, "hr.manage");

  const [balance, requests, all, logins, centers] = await Promise.all([
    balanceFor(employee, new Date().getFullYear()),
    getRequests({ employeeId: id }),
    getEmployees(),
    canManage ? getLoginOptions() : Promise.resolve([]),
    canManage ? getCenterOptions() : Promise.resolve([]),
  ]);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <Link href="/hr/employees" className="text-sm text-muted-foreground underline">
          All employees
        </Link>
        <h2 className="text-lg font-semibold">{employee.name}</h2>
      </div>

      <section className="flex flex-col gap-3">
        <h3 className="text-sm font-semibold">Leave</h3>
        <BalanceCards balance={balance} />
      </section>

      {canManage ? (
        <EmployeeForm
          values={{
            id: employee.id,
            empNo: employee.empNo,
            name: employee.name,
            userId: employee.userId ?? "",
            designation: employee.designation ?? "",
            department: employee.department ?? "",
            centerId: employee.centerId ?? "",
            address: employee.address ?? "",
            dateOfJoining: employee.dateOfJoining ?? "",
            reportsToId: employee.reportsToId ?? "",
            openingSl: employee.openingSl === null ? "" : String(employee.openingSl),
            openingCl: employee.openingCl === null ? "" : String(employee.openingCl),
            openingAsOf: employee.openingAsOf ?? "",
            status: employee.status,
          }}
          logins={logins}
          centers={centers}
          managers={all.filter((e) => e.id !== employee.id && e.status === "active").map((e) => ({ id: e.id, name: e.name }))}
        />
      ) : (
        <p className="text-sm text-muted-foreground">
          {[employee.designation, employee.department, employee.empNo].filter(Boolean).join(" · ")}
        </p>
      )}

      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold">Leave history</h3>
        {requests.length === 0 ? (
          <p className="text-sm text-muted-foreground">None.</p>
        ) : (
          <table className="w-full text-sm">
            <tbody>
              {requests.map((r) => (
                <tr key={r.id} className="border-t">
                  <td className="p-2">
                    <Link href={`/hr/leave/${r.id}`} className="underline">
                      #{r.leaveNo}
                    </Link>
                  </td>
                  <td className="p-2">{kindText(r.kind)}</td>
                  <td className="p-2">{rangeText(r)}</td>
                  <td className="p-2">{r.days}</td>
                  <td className="p-2">
                    <StatusBadge status={r.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
