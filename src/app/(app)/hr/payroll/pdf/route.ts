import { can, getCurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { renderPayslips } from "@/lib/payroll/pdf";
import { currentSlipsForMonth, pdfSlipFor } from "@/lib/payroll/pdf-data";

export const dynamic = "force-dynamic";

/** Every current payslip for a month in one PDF, a page each, for printing. Payroll only. */
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user || !can(user, "payroll.read")) return new Response("Not allowed", { status: 403 });
  const month = new URL(request.url).searchParams.get("month") ?? "";
  if (!/^\d{4}-\d{2}$/.test(month)) return new Response("Give a month, like ?month=2026-11", { status: 400 });

  const slips = await currentSlipsForMonth(db, month);
  if (slips.length === 0) return new Response("No payslips for that month", { status: 404 });
  const pdfs = (await Promise.all(slips.map((s) => pdfSlipFor(db, s, true)))).filter((p): p is NonNullable<typeof p> => p !== null);
  const buffer = await renderPayslips(pdfs);
  return new Response(new Uint8Array(buffer), {
    headers: { "content-type": "application/pdf", "content-disposition": `attachment; filename="Payslips ${month}.pdf"`, "cache-control": "private, no-store" },
  });
}
