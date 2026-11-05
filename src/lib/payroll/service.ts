import { and, desc, eq, isNull, lt, sql } from "drizzle-orm";

import type { DbExecutor } from "@/lib/db/client";
import {
  bankMatches,
  bankStatementLines,
  employeePay,
  employees,
  financeTransactions,
  leaveRequests,
  payRevisions,
  payrollSettings,
  payslipPayments,
  payslips,
} from "@/lib/db/schema";
import { resolveBankLines } from "@/lib/finance/bank-ledger";
import { matchSoon } from "@/lib/finance/reconcile";
import { postEntry } from "@/lib/finance/post";
import { workingDates } from "@/lib/hr/leave";
import { loadHolidays, loadPolicy, type Result } from "@/lib/hr/service";

import {
  calculatePayslip,
  resolveOpening,
  type Components,
  type PayrollEntry,
  type PayrollMoney,
  type PayrollResult,
  type PayrollSettings,
} from "./calc";

/**
 * The writes behind payroll. Callers have checked who is asking; what is
 * enforced here is what is true of the payslip: months are generated in
 * order, a month is regenerated only while it is the latest, imported months
 * never, a slip is paid only once approved, and a salary payment can never
 * exceed what is owed.
 */

export const SALARY_CATEGORY = "Salaries";

export interface RevisionInput {
  effectiveDate: string;
  newDesignation?: string | null;
  newComponents: Partial<Components>;
}

export async function loadPayrollSettings(tx: DbExecutor) {
  const [row] = await tx.select().from(payrollSettings).where(eq(payrollSettings.id, 1));
  return {
    companyName: row?.companyName ?? "afdindia",
    companyAddress: row?.companyAddress ?? "",
    lateAllowanceMin: row?.lateAllowanceMin ?? 60,
    earlyAllowanceMin: row?.earlyAllowanceMin ?? 60,
    divisor: row?.divisor ?? null,
    deductionFactor: row?.deductionFactor ?? 0.5,
    contactEmail: row?.contactEmail ?? "",
    requireApproval: row?.requireApproval ?? true,
  };
}

export function toCalcSettings(s: Awaited<ReturnType<typeof loadPayrollSettings>>): PayrollSettings {
  return {
    lateAllowanceMin: s.lateAllowanceMin,
    earlyAllowanceMin: s.earlyAllowanceMin,
    divisor: s.divisor,
    deductionFactor: s.deductionFactor,
  };
}

export const componentsOf = (p: { basicPaise: number; hraPaise: number; otherPaise: number; medicalPaise: number }): Components => ({
  basic: p.basicPaise,
  hra: p.hraPaise,
  other: p.otherPaise,
  medical: p.medicalPaise,
});

/** The most recent current payslip for an earlier month, if any. */
export async function previousClosing(tx: DbExecutor, employeeId: string, month: string) {
  const [row] = await tx
    .select()
    .from(payslips)
    .where(and(eq(payslips.employeeId, employeeId), eq(payslips.status, "current"), lt(payslips.month, month)))
    .orderBy(desc(payslips.month))
    .limit(1);
  return row ?? null;
}

async function laterExists(tx: DbExecutor, employeeId: string, month: string): Promise<boolean> {
  const rows = await tx
    .select({ id: payslips.id })
    .from(payslips)
    .where(and(eq(payslips.employeeId, employeeId), eq(payslips.status, "current"), sql`${payslips.month} > ${month}`))
    .limit(1);
  return rows.length > 0;
}

/**
 * Approved leave that falls in the month, as the entries payroll works from.
 * These are authoritative: whoever generates the slip cannot leave an
 * approved leave day out, or change what kind of day it was.
 */
export async function approvedLeaveEntries(tx: DbExecutor, employeeId: string, month: string): Promise<PayrollEntry[]> {
  const [emp] = await tx.select({ centerId: employees.centerId }).from(employees).where(eq(employees.id, employeeId));
  const policy = await loadPolicy(tx);
  const holidays = new Set((await loadHolidays(tx, emp?.centerId ?? null)).map((h) => h.onDate));
  const monthStart = `${month}-01`;
  const monthEnd = `${month}-${String(new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate()).padStart(2, "0")}`;
  const rows = await tx
    .select()
    .from(leaveRequests)
    .where(and(eq(leaveRequests.employeeId, employeeId), eq(leaveRequests.status, "approved")));

  const out: PayrollEntry[] = [];
  for (const r of rows) {
    if (r.toDate < monthStart || r.fromDate > monthEnd) continue;
    for (const date of workingDates(r.fromDate, r.toDate, holidays, policy.weeklyOff)) {
      if (date < monthStart || date > monthEnd) continue;
      out.push({ date, type: r.kind, notes: `Leave slip #${r.leaveNo}` });
    }
  }
  return out;
}

export interface GenerateInput {
  employeeId: string;
  month: string;
  money: PayrollMoney;
  /** Late coming, early exit, miss punch, and any leave not covered by a leave request. */
  entries: PayrollEntry[];
  revision?: RevisionInput | null;
  regenerate: boolean;
  userId: string;
}

export async function generatePayslip(
  tx: DbExecutor,
  input: GenerateInput,
): Promise<Result<{ id: string; slipNo: number; net: number; result: PayrollResult }>> {
  if (!/^\d{4}-\d{2}$/.test(input.month)) return { ok: false, error: "Pick the month." };

  const [employee] = await tx.select().from(employees).where(and(eq(employees.id, input.employeeId), isNull(employees.deletedAt)));
  if (!employee) return { ok: false, error: "That employee doesn't exist." };
  if (employee.status !== "active") return { ok: false, error: "This employee is inactive." };
  const [pay] = await tx.select().from(employeePay).where(eq(employeePay.employeeId, employee.id));
  if (!pay) return { ok: false, error: "Set this employee's salary first (HR → Employees → their page)." };

  const [existing] = await tx
    .select()
    .from(payslips)
    .where(and(eq(payslips.employeeId, employee.id), eq(payslips.month, input.month), eq(payslips.status, "current")));

  if (existing) {
    if (existing.imported) return { ok: false, error: "That month was imported from the old slips and can never be regenerated." };
    if (!input.regenerate) return { ok: false, error: "That month already has a payslip. Tick Regenerate to replace it." };
  }
  if (await laterExists(tx, employee.id, input.month)) {
    return { ok: false, error: "A later month already exists for this employee, so an earlier one can't be generated or replaced. Months go in order." };
  }
  if (!existing && input.regenerate) return { ok: false, error: "There is no payslip for that month to regenerate." };

  // Regenerating uses the pay rates stored with the slip, not the master,
  // which may already have been moved on by this month's promotion.
  const base: Components = existing ? (existing.baseComponents as unknown as Components) : componentsOf(pay);
  const priorRevision = existing ? ((existing.inputs as { revision?: RevisionInput | null }).revision ?? null) : null;
  const revision = input.revision ?? priorRevision;
  const baseDesignation = existing
    ? (((existing.inputs as { baseDesignation?: string | null }).baseDesignation) ?? employee.designation)
    : employee.designation;

  const settings = await loadPayrollSettings(tx);
  const leave = await loadPolicy(tx);
  const previous = await previousClosing(tx, employee.id, input.month);
  const opening = resolveOpening({
    month: input.month,
    previous: previous
      ? { month: previous.month, sl: previous.slClosing, cl: previous.clClosing, advancePaise: previous.advanceClosingPaise }
      : null,
    employee: {
      dateOfJoining: employee.dateOfJoining,
      openingSl: employee.openingSl,
      openingCl: employee.openingCl,
      openingAsOf: employee.openingAsOf,
      openingAdvancePaise: pay.openingAdvancePaise,
    },
    leave,
  });

  // Approved leave decides its own days; the person generating adds the rest.
  const approved = await approvedLeaveEntries(tx, employee.id, input.month);
  const approvedDates = new Set(approved.map((a) => a.date));
  const manual = input.entries.filter(
    (e) => !(approvedDates.has(e.date) && (e.type === "sick" || e.type === "casual" || e.type === "lop" || e.type === "half_day")),
  );
  const entries = [...approved, ...manual];

  const outcome = calculatePayslip({
    month: input.month,
    settings: toCalcSettings(settings),
    leave,
    employee: { dateOfJoining: employee.dateOfJoining, designation: baseDesignation },
    base,
    revision: revision ?? undefined,
    opening,
    money: input.money,
    entries,
  });
  if (!outcome.ok) return { ok: false, error: outcome.errors.join(" ") };
  const result = outcome.result;

  if (existing) {
    await tx
      .update(payslips)
      .set({ status: "superseded", supersededAt: sql`now()` })
      .where(eq(payslips.id, existing.id));
  }
  const [row] = await tx
    .insert(payslips)
    .values({
      employeeId: employee.id,
      month: input.month,
      version: (existing?.version ?? 0) + 1,
      inputs: { money: input.money, entries, revision, baseDesignation, manualEntries: manual } as unknown as Record<string, unknown>,
      result: result as unknown as Record<string, unknown>,
      baseComponents: base as unknown as Record<string, number>,
      netPaise: result.net,
      earningsPaise: result.earnings,
      slClosing: result.leave.slClosing,
      clClosing: result.leave.clClosing,
      advanceClosingPaise: result.advance.closing,
      generatedBy: input.userId,
    })
    .returning({ id: payslips.id, slipNo: payslips.slipNo });

  // A promotion updates the master to the new values; the ledger of
  // revisions keeps the old ones and the date.
  if (revision && JSON.stringify(revision) !== JSON.stringify(priorRevision)) {
    const merged = { ...base, ...revision.newComponents };
    await tx
      .update(employeePay)
      .set({
        basicPaise: merged.basic,
        hraPaise: merged.hra,
        otherPaise: merged.other,
        medicalPaise: merged.medical,
        updatedBy: input.userId,
        updatedAt: new Date(),
      })
      .where(eq(employeePay.employeeId, employee.id));
    if (revision.newDesignation) {
      await tx.update(employees).set({ designation: revision.newDesignation, updatedAt: new Date() }).where(eq(employees.id, employee.id));
    }
    await tx.insert(payRevisions).values({
      employeeId: employee.id,
      month: input.month,
      effectiveDate: revision.effectiveDate,
      oldComponents: base as unknown as Record<string, number>,
      newComponents: merged as unknown as Record<string, number>,
      oldDesignation: baseDesignation,
      newDesignation: revision.newDesignation ?? baseDesignation,
      createdBy: input.userId,
    });
  }

  return { ok: true, id: row.id, slipNo: row.slipNo, net: result.net, result };
}

export async function approvePayslip(tx: DbExecutor, input: { payslipId: string; userId: string }): Promise<Result> {
  const [done] = await tx
    .update(payslips)
    .set({ approvedBy: input.userId, approvedAt: sql`now()` })
    .where(and(eq(payslips.id, input.payslipId), eq(payslips.status, "current"), isNull(payslips.approvedAt)))
    .returning({ id: payslips.id });
  return done ? { ok: true } : { ok: false, error: "That payslip is already approved, or has been replaced." };
}

export interface SlipPayment {
  transactionId: string;
  amountPaise: number;
  occurredOn: string;
  accountName: string;
  accountType: string;
  reference: string | null;
  /** A statement line proves it. Cash can't be, and shows as such. */
  onStatement: boolean;
}

export type PaidState = "paid" | "recorded" | "partial" | "unpaid";

export interface SlipPaymentStatus {
  payslipId: string;
  netPaise: number;
  /** Everything recorded against the slip (reversed payments excluded). */
  recordedPaise: number;
  /** The part of it that a bank statement line proves. */
  verifiedPaise: number;
  /** The part paid in cash, which has no statement. */
  cashPaise: number;
  remainingPaise: number;
  state: PaidState;
  payments: SlipPayment[];
}

export async function paymentStatuses(
  tx: DbExecutor,
  slips: Array<{ id: string; netPaise: number }>,
): Promise<Map<string, SlipPaymentStatus>> {
  const out = new Map<string, SlipPaymentStatus>();
  if (slips.length === 0) return out;
  const rows = await tx.execute<{
    payslip_id: string;
    transaction_id: string;
    amount_paise: string | number;
    occurred_on: string;
    account_name: string;
    account_type: string;
    reference: string | null;
    on_statement: boolean;
  }>(sql`
    select sp.payslip_id, t.id as transaction_id, t.amount_paise, t.occurred_on::text as occurred_on,
           a.name as account_name, a.type as account_type, t.reference,
           exists (select 1 from bank_matches m where m.transaction_id = t.id and m.active) as on_statement
    from payslip_payments sp
    join finance_transactions t on t.id = sp.transaction_id
    join finance_accounts a on a.id = t.account_id
    where sp.payslip_id in (${sql.join(slips.map((s) => sql`${s.id}::uuid`), sql`, `)})
      -- A payment that was reversed no longer counts as paid.
      and not exists (select 1 from finance_transactions r where r.reverses_transaction_id = t.id)
    order by t.occurred_on, t.txn_no
  `);
  const bySlip = new Map<string, SlipPayment[]>();
  for (const r of rows) {
    const list = bySlip.get(r.payslip_id) ?? [];
    list.push({
      transactionId: r.transaction_id,
      amountPaise: Math.abs(Number(r.amount_paise)),
      occurredOn: r.occurred_on,
      accountName: r.account_name,
      accountType: r.account_type,
      reference: r.reference,
      onStatement: r.on_statement,
    });
    bySlip.set(r.payslip_id, list);
  }
  for (const s of slips) {
    const payments = bySlip.get(s.id) ?? [];
    const recorded = payments.reduce((t, p) => t + p.amountPaise, 0);
    const verified = payments.filter((p) => p.onStatement).reduce((t, p) => t + p.amountPaise, 0);
    const cash = payments.filter((p) => p.accountType !== "bank").reduce((t, p) => t + p.amountPaise, 0);
    const state: PaidState =
      recorded === 0 ? "unpaid" : recorded < s.netPaise ? "partial" : verified + cash >= s.netPaise ? "paid" : "recorded";
    out.set(s.id, {
      payslipId: s.id,
      netPaise: s.netPaise,
      recordedPaise: recorded,
      verifiedPaise: verified,
      cashPaise: cash,
      remainingPaise: Math.max(0, s.netPaise - recorded),
      state,
      payments,
    });
  }
  return out;
}

async function slipForPayment(tx: DbExecutor, payslipId: string, requireApproval: boolean) {
  const [slip] = await tx.select().from(payslips).where(eq(payslips.id, payslipId));
  if (!slip || slip.status !== "current") return { ok: false, error: "That payslip has been replaced. Open the latest one." } as const;
  if (requireApproval && !slip.approvedAt) return { ok: false, error: "The owner has to approve this payslip before it can be paid." } as const;
  const status = (await paymentStatuses(tx, [{ id: slip.id, netPaise: slip.netPaise }])).get(slip.id)!;
  return { ok: true, slip, status } as const;
}

/** Records the salary as paid from an account: one expense entry, linked to the slip. */
export async function recordSalaryPayment(
  tx: DbExecutor,
  input: { payslipId: string; accountId: string; amountPaise: number; occurredOn: string; reference: string | null; userId: string },
): Promise<Result<{ transactionId: string }>> {
  const settings = await loadPayrollSettings(tx);
  const found = await slipForPayment(tx, input.payslipId, settings.requireApproval);
  if (!found.ok) return { ok: false, error: found.error };
  const { slip, status } = found;
  if (!Number.isInteger(input.amountPaise) || input.amountPaise <= 0) return { ok: false, error: "Enter the amount paid." };
  if (input.amountPaise > status.remainingPaise) return { ok: false, error: "That is more than what is still owed on this payslip." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.occurredOn)) return { ok: false, error: "Pick the date it was paid." };

  const [employee] = await tx.select({ name: employees.name }).from(employees).where(eq(employees.id, slip.employeeId));
  const posted = await postEntry(tx, {
    occurredOn: input.occurredOn,
    direction: "out",
    kind: "expense",
    accountId: input.accountId,
    category: SALARY_CATEGORY,
    amountPaise: input.amountPaise,
    description: `Salary — ${employee?.name ?? "employee"} — ${slip.month}`,
    reference: input.reference,
    recordedBy: input.userId,
    source: "payroll",
  });
  await tx.insert(payslipPayments).values({ payslipId: slip.id, transactionId: posted.id, createdBy: input.userId });
  await matchSoon(tx, [input.accountId]);
  return { ok: true, transactionId: posted.id };
}

/** Links a ledger entry that already exists (a Salaries expense nobody tied to a slip) to a payslip. */
export async function linkSalaryEntry(
  tx: DbExecutor,
  input: { payslipId: string; transactionId: string; userId: string },
): Promise<Result> {
  const settings = await loadPayrollSettings(tx);
  const found = await slipForPayment(tx, input.payslipId, settings.requireApproval);
  if (!found.ok) return { ok: false, error: found.error };
  const [txn] = await tx.select().from(financeTransactions).where(eq(financeTransactions.id, input.transactionId));
  if (!txn) return { ok: false, error: "That entry no longer exists." };
  if (txn.category !== SALARY_CATEGORY || txn.direction !== "out" || txn.amountPaise <= 0) {
    return { ok: false, error: "Only an expense entry under Salaries can be linked to a payslip." };
  }
  if (txn.amountPaise > found.status.remainingPaise) return { ok: false, error: "That is more than what is still owed on this payslip." };
  const inserted = await tx
    .insert(payslipPayments)
    .values({ payslipId: input.payslipId, transactionId: txn.id, createdBy: input.userId })
    .onConflictDoNothing()
    .returning({ id: payslipPayments.id });
  return inserted.length ? { ok: true } : { ok: false, error: "That entry already pays a payslip." };
}

/**
 * One step from a bank statement line to a paid payslip: the line becomes a
 * Salaries entry in the books (paired with it, as every entry made from a
 * line is), and the entry is linked to the slip.
 */
export async function payFromBankLine(
  tx: DbExecutor,
  input: { payslipId: string; bankLineId: string; userId: string },
): Promise<Result> {
  const settings = await loadPayrollSettings(tx);
  const found = await slipForPayment(tx, input.payslipId, settings.requireApproval);
  if (!found.ok) return { ok: false, error: found.error };
  const [line] = await tx.select().from(bankStatementLines).where(eq(bankStatementLines.id, input.bankLineId));
  if (!line) return { ok: false, error: "That statement line no longer exists." };
  if (line.direction !== "out") return { ok: false, error: "That line is money coming in." };
  if (line.amountPaise > found.status.remainingPaise) return { ok: false, error: "That is more than what is still owed on this payslip." };
  const taken = await tx
    .select({ id: bankMatches.id })
    .from(bankMatches)
    .where(and(eq(bankMatches.bankLineId, line.id), eq(bankMatches.active, true)));
  if (taken.length > 0) return { ok: false, error: "That line is already accounted for." };

  const done = await resolveBankLines(tx, {
    lines: [line],
    direction: "out",
    choice: SALARY_CATEGORY,
    skipReason: null,
    userId: input.userId,
  });
  if (done === 0) return { ok: false, error: "That line was just dealt with by somebody else." };
  const [after] = await tx.select({ transactionId: bankStatementLines.transactionId }).from(bankStatementLines).where(eq(bankStatementLines.id, line.id));
  if (!after?.transactionId) return { ok: false, error: "The entry could not be created." };
  await tx.insert(payslipPayments).values({ payslipId: input.payslipId, transactionId: after.transactionId, createdBy: input.userId });
  return { ok: true };
}

/** Everyone's payslips for a month, with how much of each has been paid. */
export async function monthOverview(tx: DbExecutor, month: string) {
  const slips = await tx
    .select({ slip: payslips, name: employees.name, empNo: employees.empNo })
    .from(payslips)
    .innerJoin(employees, eq(employees.id, payslips.employeeId))
    .where(and(eq(payslips.month, month), eq(payslips.status, "current")))
    .orderBy(employees.name);
  const statuses = await paymentStatuses(tx, slips.map((s) => ({ id: s.slip.id, netPaise: s.slip.netPaise })));
  return slips.map((s) => ({ ...s, status: statuses.get(s.slip.id)! }));
}

