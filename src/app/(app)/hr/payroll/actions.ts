"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { writeAuditLog } from "@/lib/audit/log";
import { can, getCurrentUser, type SessionUser } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { bankStatementLines, employeePay, employees, payrollSettings } from "@/lib/db/schema";
import { assertAccountInScope } from "@/lib/finance/account-scope";
import { parseRupeesToPaise } from "@/lib/format/currency";
import type { PayrollEntry } from "@/lib/payroll/calc";
import { reviewMonth } from "@/lib/payroll/review";
import {
  approvePayslip,
  generatePayslip,
  linkSalaryEntry,
  payFromBankLine,
  recordSalaryPayment,
} from "@/lib/payroll/service";
import { createClient } from "@/lib/supabase/server";

export interface PayrollFormState {
  error?: string;
  success?: string;
  /** Where to look at what was just made. */
  href?: string;
}

function revalidate() {
  revalidatePath("/hr", "layout");
}

async function audit(user: SessionUser, action: string, entityType: string, entityId: string, after: Record<string, unknown>) {
  const supabase = await createClient();
  await writeAuditLog(supabase, { actorId: user.id, action, entityType, entityId, after });
}

const blank = (v: FormDataEntryValue | null) => {
  const s = String(v ?? "").trim();
  return s === "" ? null : s;
};
const paise = (v: FormDataEntryValue | null) => (blank(v) === null ? 0 : parseRupeesToPaise(v));

export async function savePay(_prev: PayrollFormState, formData: FormData): Promise<PayrollFormState> {
  const user = await getCurrentUser();
  if (!user || !can(user, "payroll.manage")) return { error: "Only the people who set pay can do that." };
  const employeeId = String(formData.get("employeeId") ?? "");
  const [emp] = await db.select({ id: employees.id }).from(employees).where(eq(employees.id, employeeId));
  if (!emp) return { error: "That employee doesn't exist." };

  const basic = paise(formData.get("basic"));
  const hra = paise(formData.get("hra"));
  const other = paise(formData.get("other"));
  const medical = paise(formData.get("medical"));
  const advance = paise(formData.get("openingAdvance"));
  if ([basic, hra, other, medical, advance].some((v) => v === null)) return { error: "Amounts must be numbers, zero or more." };

  const values = {
    basicPaise: basic as number,
    hraPaise: hra as number,
    otherPaise: other as number,
    medicalPaise: medical as number,
    openingAdvancePaise: advance as number,
    pan: blank(formData.get("pan")),
    bankName: blank(formData.get("bankName")),
    bankAccount: blank(formData.get("bankAccount")),
    ifsc: blank(formData.get("ifsc")),
    updatedBy: user.id,
    updatedAt: new Date(),
  };
  const [before] = await db.select().from(employeePay).where(eq(employeePay.employeeId, employeeId));
  await db.insert(employeePay).values({ employeeId, ...values }).onConflictDoUpdate({ target: employeePay.employeeId, set: values });
  // Every change to somebody's pay is on the audit trail, with the old figures.
  await audit(user, "payroll.pay_update", "employee_pay", employeeId, {
    before: before ? { basic: before.basicPaise, hra: before.hraPaise, other: before.otherPaise, medical: before.medicalPaise } : null,
    after: { basic, hra, other, medical },
  });
  revalidate();
  return { success: "Saved." };
}

export async function savePayrollSettings(_prev: PayrollFormState, formData: FormData): Promise<PayrollFormState> {
  const user = await getCurrentUser();
  if (!user || !can(user, "payroll.manage")) return { error: "Only the people who set pay can do that." };
  const num = (k: string) => Number(formData.get(k));
  const divisor = blank(formData.get("divisor"));
  const values = {
    companyName: String(formData.get("companyName") ?? "").trim() || "afdindia",
    companyAddress: String(formData.get("companyAddress") ?? "").trim(),
    lateAllowanceMin: num("lateAllowanceMin"),
    earlyAllowanceMin: num("earlyAllowanceMin"),
    divisor: divisor === null ? null : Number(divisor),
    deductionFactor: num("deductionFactor"),
    contactEmail: String(formData.get("contactEmail") ?? "").trim(),
    requireApproval: formData.get("requireApproval") === "on",
    updatedBy: user.id,
    updatedAt: new Date(),
  };
  if ([values.lateAllowanceMin, values.earlyAllowanceMin, values.deductionFactor].some((n) => !Number.isFinite(n) || n < 0)) {
    return { error: "Check the numbers." };
  }
  if (values.divisor !== null && !(Number.isInteger(values.divisor) && values.divisor > 0)) return { error: "The divisor must be a whole number, or blank." };
  await db.update(payrollSettings).set(values).where(eq(payrollSettings.id, 1));
  await audit(user, "payroll.settings_update", "payroll_settings", "1", values);
  revalidate();
  return { success: "Saved." };
}

const ENTRY_TYPES = ["sick", "casual", "lop", "half_day", "late", "early", "miss_punch"] as const;

export async function generate(_prev: PayrollFormState, formData: FormData): Promise<PayrollFormState> {
  const user = await getCurrentUser();
  if (!user || !can(user, "payroll.generate")) return { error: "You don't have permission to do that." };
  // Regenerating replaces a slip that may already be approved: that is the owner's call.
  const regenerate = formData.get("regenerate") === "on";
  if (regenerate && !can(user, "payroll.manage")) return { error: "Only the people who set pay can regenerate a payslip." };

  const money = {
    overtime: paise(formData.get("overtime")),
    arrears: paise(formData.get("arrears")),
    incentives: paise(formData.get("incentives")),
    insurance: paise(formData.get("insurance")),
    bonus: paise(formData.get("bonus")),
    advanceGiven: paise(formData.get("advanceGiven")),
    advanceRepaid: paise(formData.get("advanceRepaid")),
  };
  if (Object.values(money).some((v) => v === null)) return { error: "Amounts must be numbers, zero or more." };

  let entries: PayrollEntry[] = [];
  try {
    const raw: unknown = JSON.parse(String(formData.get("entries") ?? "[]"));
    entries = (Array.isArray(raw) ? raw : [])
      .map((r: { date?: string; type?: string; minutes?: number | string; notes?: string }) => ({
        date: String(r.date ?? ""),
        type: r.type as PayrollEntry["type"],
        minutes: r.minutes === undefined || r.minutes === "" ? undefined : Number(r.minutes),
        notes: r.notes ? String(r.notes) : undefined,
      }))
      .filter((e) => e.date && ENTRY_TYPES.includes(e.type));
  } catch {
    return { error: "The attendance entries could not be read." };
  }

  let revision;
  if (formData.get("promotion") === "on") {
    if (!can(user, "payroll.manage")) return { error: "Only the people who set pay can revise it." };
    const effectiveDate = String(formData.get("revDate") ?? "");
    const comp = (k: string) => (blank(formData.get(k)) === null ? undefined : (parseRupeesToPaise(formData.get(k)) ?? NaN));
    const newComponents = { basic: comp("revBasic"), hra: comp("revHra"), other: comp("revOther"), medical: comp("revMedical") };
    if (Object.values(newComponents).some((v) => v !== undefined && Number.isNaN(v))) return { error: "The new amounts must be numbers." };
    revision = {
      effectiveDate,
      newDesignation: blank(formData.get("revDesignation")),
      newComponents: Object.fromEntries(Object.entries(newComponents).filter(([, v]) => v !== undefined)) as Record<string, number>,
    };
  } else if (blank(formData.get("revDate")) || blank(formData.get("revBasic"))) {
    return { error: "A promotion is filled in but not switched on. Tick it, or clear the boxes." };
  }

  const result = await generatePayslip(db, {
    employeeId: String(formData.get("employeeId") ?? ""),
    month: String(formData.get("month") ?? ""),
    money: money as Record<keyof typeof money, number>,
    entries,
    revision,
    regenerate,
    userId: user.id,
  });
  if (!result.ok) return { error: result.error };

  await audit(user, regenerate ? "payroll.regenerate" : "payroll.generate", "payslips", result.id, {
    month: String(formData.get("month")),
    net: result.net,
    money,
    revision: revision ?? null,
  });
  revalidate();
  const r = result.result;
  return {
    success: `Payslip #${result.slipNo} generated. Net pay ₹${(r.net / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 })}; sick ${r.leave.slClosing}, casual ${r.leave.clClosing}; advance outstanding ₹${(r.advance.closing / 100).toLocaleString("en-IN")}.`,
    href: `/hr/payroll/${result.id}`,
  };
}

export async function approve(_prev: PayrollFormState, formData: FormData): Promise<PayrollFormState> {
  const user = await getCurrentUser();
  if (!user || !can(user, "payroll.manage")) return { error: "Only the owner can approve a payslip." };
  const payslipId = String(formData.get("payslipId") ?? "");
  const result = await approvePayslip(db, { payslipId, userId: user.id });
  if (!result.ok) return { error: result.error };
  await audit(user, "payroll.approve", "payslips", payslipId, {});
  revalidate();
  return { success: "Approved." };
}

export async function payOut(_prev: PayrollFormState, formData: FormData): Promise<PayrollFormState> {
  const user = await getCurrentUser();
  if (!user || !can(user, "payroll.generate")) return { error: "You don't have permission to do that." };
  const accountId = String(formData.get("accountId") ?? "");
  const scope = await assertAccountInScope(accountId, "finance.record");
  if (!scope.ok) return { error: scope.error };
  const amount = parseRupeesToPaise(formData.get("amount"));
  if (!amount) return { error: "Enter the amount paid." };

  const result = await recordSalaryPayment(db, {
    payslipId: String(formData.get("payslipId") ?? ""),
    accountId,
    amountPaise: amount,
    occurredOn: String(formData.get("paidOn") ?? ""),
    reference: blank(formData.get("reference")),
    userId: user.id,
  });
  if (!result.ok) return { error: result.error };
  await audit(user, "payroll.pay", "finance_transactions", result.transactionId, {
    payslipId: String(formData.get("payslipId")),
    amount,
    advance: result.advancePaise,
  });
  revalidate();
  revalidatePath("/finance", "layout");
  return {
    success:
      result.advancePaise > 0
        ? `Recorded. ₹${(result.advancePaise / 100).toLocaleString("en-IN")} of it was more than the salary owed, so it is an advance: it is added to the next payslip and recovered through "advance repaid".`
        : "Recorded. It shows as paid once a bank statement line proves it.",
  };
}

export async function linkEntry(_prev: PayrollFormState, formData: FormData): Promise<PayrollFormState> {
  const user = await getCurrentUser();
  if (!user || !can(user, "payroll.generate")) return { error: "You don't have permission to do that." };
  const result = await linkSalaryEntry(db, {
    payslipId: String(formData.get("payslipId") ?? ""),
    transactionId: String(formData.get("transactionId") ?? ""),
    userId: user.id,
  });
  if (!result.ok) return { error: result.error };
  await audit(user, "payroll.link_entry", "payslips", String(formData.get("payslipId")), { transactionId: String(formData.get("transactionId")) });
  revalidate();
  return { success: "Linked." };
}

export async function payFromLine(_prev: PayrollFormState, formData: FormData): Promise<PayrollFormState> {
  const user = await getCurrentUser();
  if (!user || !can(user, "payroll.generate")) return { error: "You don't have permission to do that." };
  const bankLineId = String(formData.get("bankLineId") ?? "");
  const [line] = await db.select({ accountId: bankStatementLines.accountId }).from(bankStatementLines).where(eq(bankStatementLines.id, bankLineId));
  if (!line) return { error: "That statement line no longer exists." };
  const scope = await assertAccountInScope(line.accountId, "finance.record");
  if (!scope.ok) return { error: scope.error };

  const result = await payFromBankLine(db, { payslipId: String(formData.get("payslipId") ?? ""), bankLineId, userId: user.id });
  if (!result.ok) return { error: result.error };
  await audit(user, "payroll.pay_from_line", "bank_statement_lines", bankLineId, { payslipId: String(formData.get("payslipId")) });
  revalidate();
  revalidatePath("/finance", "layout");
  return { success: "That bank line is now this salary, and it is verified." };
}


/**
 * Generates every payslip in the review list that is ready, exactly as
 * previewed: approved leave and the biometric suggestions, no extras. Anyone
 * who needs overtime, an advance or a correction is generated one at a time
 * instead. Everything still waits for the owner's approval.
 */
export async function generateReviewed(_prev: PayrollFormState, formData: FormData): Promise<PayrollFormState> {
  const user = await getCurrentUser();
  if (!user || !can(user, "payroll.generate")) return { error: "You don't have permission to do that." };
  if (formData.get("reviewed") !== "on") return { error: "Tick the box to say you have reviewed the list." };
  const month = String(formData.get("month") ?? "");
  if (!/^\d{4}-\d{2}$/.test(month)) return { error: "Pick the month." };
  const skip = new Set(formData.getAll("skip").map(String));

  const rows = (await reviewMonth(db, month)).filter((r) => r.state === "ready" && !skip.has(r.employeeId));
  let made = 0;
  const failed: string[] = [];
  for (const r of rows) {
    const result = await generatePayslip(db, {
      employeeId: r.employeeId,
      month,
      money: { overtime: 0, arrears: 0, incentives: 0, insurance: 0, bonus: 0, advanceGiven: 0, advanceRepaid: 0 },
      entries: r.entries,
      regenerate: false,
      userId: user.id,
    });
    if (result.ok) {
      made += 1;
      await audit(user, "payroll.generate", "payslips", result.id, { month, net: result.net, bulk: true });
    } else failed.push(`${r.name}: ${result.error}`);
  }
  revalidate();
  return {
    success: `Generated ${made} payslip${made === 1 ? "" : "s"}. They wait for the owner's approval.`,
    error: failed.length ? failed.join(" ") : undefined,
  };
}
