import "server-only";

import { and, eq } from "drizzle-orm";

import type { DbExecutor } from "@/lib/db/client";
import { employeePay, employees, payslips } from "@/lib/db/schema";
import { formatINR } from "@/lib/format/currency";
import { formatDateIST } from "@/lib/format/date";

import type { PayrollResult } from "./calc";
import type { PdfSlip } from "./pdf";
import { loadPayrollSettings, paymentStatuses } from "./service";

/** Everything a payslip PDF needs, for one slip. */
export async function pdfSlipFor(tx: DbExecutor, slip: typeof payslips.$inferSelect, withPayments: boolean): Promise<PdfSlip | null> {
  const [emp] = await tx.select().from(employees).where(eq(employees.id, slip.employeeId));
  if (!emp) return null;
  const [pay] = await tx.select().from(employeePay).where(eq(employeePay.employeeId, emp.id));
  const settings = await loadPayrollSettings(tx);
  let paid: string | null = null;
  if (withPayments) {
    const status = (await paymentStatuses(tx, [{ id: slip.id, netPaise: slip.netPaise }])).get(slip.id);
    if (status && status.payments.length > 0) {
      paid = `Paid ${formatINR(status.recordedPaise).replace("₹", "Rs. ")}: ${status.payments
        .map((p) => `${formatDateIST(`${p.occurredOn}T12:00:00+05:30`, "d MMM yyyy")} from ${p.accountName}`)
        .join("; ")}`;
    }
  }
  return {
    slipNo: slip.slipNo,
    result: slip.result as unknown as PayrollResult,
    employee: {
      empNo: emp.empNo,
      name: emp.name,
      designation: emp.designation,
      department: emp.department,
      dateOfJoining: emp.dateOfJoining,
      address: emp.address,
      pan: pay?.pan ?? null,
      bankName: pay?.bankName ?? null,
      bankAccount: pay?.bankAccount ?? null,
      ifsc: pay?.ifsc ?? null,
    },
    company: {
      name: settings.companyName,
      address: settings.companyAddress,
      contactEmail: settings.contactEmail,
      lateAllowance: settings.lateAllowanceMin,
      earlyAllowance: settings.earlyAllowanceMin,
    },
    paid,
  };
}

export async function currentSlipsForMonth(tx: DbExecutor, month: string) {
  return tx.select().from(payslips).where(and(eq(payslips.month, month), eq(payslips.status, "current"))).orderBy(payslips.slipNo);
}
