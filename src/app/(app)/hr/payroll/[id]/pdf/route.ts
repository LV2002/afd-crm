import { eq } from "drizzle-orm";

import { can, getCurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { employees, payslips } from "@/lib/db/schema";
import { renderPayslips } from "@/lib/payroll/pdf";
import { pdfSlipFor } from "@/lib/payroll/pdf-data";
import { loadPayrollSettings } from "@/lib/payroll/service";

export const dynamic = "force-dynamic";

/**
 * One payslip as a PDF. Payroll (admin, co-admin, HR, accounts) can download
 * any; an employee can download their own once it has been approved.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new Response("Sign in first", { status: 401 });
  const { id } = await params;
  const [slip] = await db.select().from(payslips).where(eq(payslips.id, id));
  if (!slip) return new Response("Not found", { status: 404 });
  const [emp] = await db.select({ userId: employees.userId, name: employees.name }).from(employees).where(eq(employees.id, slip.employeeId));

  const isPayroll = can(user, "payroll.read");
  if (!isPayroll) {
    const settings = await loadPayrollSettings(db);
    const ownAndVisible = emp?.userId === user.id && slip.status === "current" && (!settings.requireApproval || Boolean(slip.approvedAt));
    if (!ownAndVisible) return new Response("Not found", { status: 404 });
  }

  const pdf = await pdfSlipFor(db, slip, isPayroll);
  if (!pdf) return new Response("Not found", { status: 404 });
  const buffer = await renderPayslips([pdf]);
  const file = `Payslip - ${emp?.name ?? "employee"} - ${slip.month}.pdf`.replace(/[^\w .-]/g, "");
  return new Response(new Uint8Array(buffer), {
    headers: { "content-type": "application/pdf", "content-disposition": `attachment; filename="${file}"`, "cache-control": "private, no-store" },
  });
}
