import Link from "next/link";

import { AccessDenied } from "@/components/layout/access-denied";
import { Badge } from "@/components/ui/badge";
import { can, getCurrentUser } from "@/lib/auth/session";
import { balancesForAll, getCenterOptions, getEmployees, getLoginOptions } from "@/lib/hr/queries";

import { EmployeeForm } from "../hr-forms";
import { dayText } from "../leave-ui";

export const dynamic = "force-dynamic";

export default async function EmployeesPage() {
  const user = await getCurrentUser();
  if (!user || !can(user, "hr.read")) return <AccessDenied />;
  const canManage = can(user, "hr.manage");

  const employees = await getEmployees();
  const balances = await balancesForAll(employees, new Date().getFullYear());
  const [logins, centers] = canManage ? await Promise.all([getLoginOptions(), getCenterOptions()]) : [[], []];

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">Employees ({employees.filter((e) => e.status === "active").length} active)</h2>
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
              <tr>
                <th className="p-2">No.</th>
                <th className="p-2">Name</th>
                <th className="p-2">Designation</th>
                <th className="p-2">Reports to</th>
                <th className="p-2">Joined</th>
                <th className="p-2">Sick left</th>
                <th className="p-2">Casual left</th>
                <th className="p-2">Login</th>
              </tr>
            </thead>
            <tbody>
              {employees.map((e) => {
                const b = balances.get(e.id);
                return (
                  <tr key={e.id} className={`border-t ${e.status === "inactive" ? "opacity-60" : ""}`}>
                    <td className="p-2">{e.empNo}</td>
                    <td className="p-2 font-medium">
                      <Link href={`/hr/employees/${e.id}`} className="underline">
                        {e.name}
                      </Link>{" "}
                      {e.status === "inactive" && <Badge variant="outline">inactive</Badge>}
                    </td>
                    <td className="p-2">{e.designation ?? "—"}</td>
                    <td className="p-2">{e.managerName ?? "HR"}</td>
                    <td className="p-2">{e.dateOfJoining ? dayText(e.dateOfJoining) : "—"}</td>
                    <td className="p-2">{b?.sick.remaining ?? "—"}</td>
                    <td className="p-2">{b?.casual.remaining ?? "—"}</td>
                    <td className="p-2">{e.loginName ?? <span className="text-muted-foreground">none</span>}</td>
                  </tr>
                );
              })}
              {employees.length === 0 && (
                <tr>
                  <td colSpan={8} className="p-6 text-center text-muted-foreground">
                    No employees yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {canManage && (
        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold">Add an employee</h2>
          <EmployeeForm
            values={{ empNo: "", name: "", userId: "", designation: "", department: "", centerId: "", address: "", dateOfJoining: "", reportsToId: "", openingSl: "", openingCl: "", openingAsOf: "", status: "active" }}
            logins={logins}
            centers={centers}
            managers={employees.filter((e) => e.status === "active").map((e) => ({ id: e.id, name: e.name }))}
          />
        </section>
      )}
    </div>
  );
}
