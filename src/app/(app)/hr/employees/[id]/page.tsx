import Link from "next/link";
import { notFound } from "next/navigation";

import { AccessDenied } from "@/components/layout/access-denied";
import { can, getCurrentUser } from "@/lib/auth/session";
import { balanceFor, getCenterOptions, getEmployee, getEmployees, getLoginOptions, getRequests } from "@/lib/hr/queries";

import { EmployeeForm, WorkingWeekForm } from "../../hr-forms";
import { loadWeek } from "@/lib/hr/schedule";
import { PayRatesForm } from "../../payroll/payroll-forms";
import { db } from "@/lib/db/client";
import { employeePay, payslips } from "@/lib/db/schema";
import { and, desc, eq } from "drizzle-orm";
import { formatINR } from "@/lib/format/currency";
import { BalanceCards, StatusBadge, kindText, rangeText } from "../../leave-ui";

export const dynamic = "force-dynamic";

export default async function EmployeePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user || !can(user, "hr.read")) return <AccessDenied />;
  const { id } = await params;
  const employee = await getEmployee(id);
  if (!employee) notFound();
  const canManage = can(user, "hr.manage");
  const canPayroll = can(user, "payroll.read");
  const canSetPay = can(user, "payroll.manage");
  const [pay] = canPayroll ? await db.select().from(employeePay).where(eq(employeePay.employeeId, id)) : [];
  const slips = canPayroll
    ? await db.select().from(payslips).where(and(eq(payslips.employeeId, id), eq(payslips.status, "current"))).orderBy(desc(payslips.month)).limit(24)
    : [];
  const { week, custom } = await loadWeek(db, id);
  const rupees = (p: number | undefined) => (p ? String(p / 100) : "");

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
            biometricCode: employee.biometricCode ?? "",
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
        <h3 className="text-sm font-semibold">Working week</h3>
        {canManage ? (
          <WorkingWeekForm employeeId={employee.id} week={week} custom={custom} />
        ) : (
          <p className="text-sm text-muted-foreground">
            {week.map((d, i) => (d.working ? `${["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][i]} ${d.start}–${d.end}` : null)).filter(Boolean).join(" · ")}
          </p>
        )}
      </section>

      {canPayroll && (
        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold">Pay</h3>
          {canSetPay ? (
            <PayRatesForm
              employeeId={employee.id}
              values={{
                basic: rupees(pay?.basicPaise), hra: rupees(pay?.hraPaise), other: rupees(pay?.otherPaise), medical: rupees(pay?.medicalPaise),
                openingAdvance: rupees(pay?.openingAdvancePaise),
                pan: pay?.pan ?? "", bankName: pay?.bankName ?? "", bankAccount: pay?.bankAccount ?? "", ifsc: pay?.ifsc ?? "",
              }}
            />
          ) : pay ? (
            <p className="text-sm text-muted-foreground">
              Basic {formatINR(pay.basicPaise)} · HRA {formatINR(pay.hraPaise)} · Other {formatINR(pay.otherPaise)} · Medical {formatINR(pay.medicalPaise)}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">No pay set yet.</p>
          )}
          {slips.length > 0 && (
            <ul className="text-sm">
              {slips.map((s) => (
                <li key={s.id}>
                  <Link href={`/hr/payroll/${s.id}`} className="underline">{s.month}</Link> · {formatINR(s.netPaise)} · #{s.slipNo}
                </li>
              ))}
            </ul>
          )}
        </section>
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
