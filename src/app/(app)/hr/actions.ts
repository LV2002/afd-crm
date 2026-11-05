"use server";

import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { writeAuditLog } from "@/lib/audit/log";
import { can, getCurrentUser, type SessionUser } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { companyHolidays, employees, hrSettings, leaveRequests, profiles } from "@/lib/db/schema";
import { LEAVE_KIND_LABELS } from "@/lib/hr/leave";
import { applyForLeave, cancelLeave, decideLeave, employeeForUser, wouldCreateCycle } from "@/lib/hr/service";
import { notify } from "@/lib/notifications/notify";
import { createClient } from "@/lib/supabase/server";

export interface HrFormState {
  error?: string;
  success?: string;
}

function revalidate() {
  revalidatePath("/hr", "layout");
}

async function audit(user: SessionUser, action: string, entityType: string, entityId: string, after: Record<string, unknown>) {
  const supabase = await createClient();
  await writeAuditLog(supabase, { actorId: user.id, action, entityType, entityId, after });
}

async function hrManager(): Promise<SessionUser | null> {
  const user = await getCurrentUser();
  return user && can(user, "hr.manage") ? user : null;
}

const blank = (v: FormDataEntryValue | null) => {
  const s = String(v ?? "").trim();
  return s === "" ? null : s;
};
const num = (v: FormDataEntryValue | null) => {
  const s = blank(v);
  if (s === null) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
};
const day = (v: FormDataEntryValue | null) => {
  const s = blank(v);
  return s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
};

const employeeSchema = z.object({
  name: z.string().trim().min(1, "Enter the name."),
  empNo: z.string().trim().min(1, "Enter the employee number."),
});

async function readEmployee(formData: FormData) {
  const base = employeeSchema.safeParse({ name: formData.get("name"), empNo: formData.get("empNo") });
  if (!base.success) return { error: base.error.issues[0]?.message ?? "Check the form." } as const;

  const openingSl = num(formData.get("openingSl"));
  const openingCl = num(formData.get("openingCl"));
  if (Number.isNaN(openingSl) || Number.isNaN(openingCl)) return { error: "Leave balances must be numbers." } as const;
  const openingAsOf = day(formData.get("openingAsOf"));
  if ((openingSl !== null || openingCl !== null) && !openingAsOf) {
    return { error: "Say the date those leave balances are as of." } as const;
  }

  return {
    values: {
      name: base.data.name,
      empNo: base.data.empNo,
      userId: blank(formData.get("userId")),
      designation: blank(formData.get("designation")),
      department: blank(formData.get("department")),
      centerId: blank(formData.get("centerId")),
      address: blank(formData.get("address")),
      dateOfJoining: day(formData.get("dateOfJoining")),
      reportsToId: blank(formData.get("reportsToId")),
      biometricCode: blank(formData.get("biometricCode")),
      openingSl,
      openingCl,
      openingAsOf,
      status: formData.get("status") === "inactive" ? ("inactive" as const) : ("active" as const),
    },
  } as const;
}

/** Errors a unique index would raise, said in words. */
async function clashes(values: { empNo: string; userId: string | null; biometricCode: string | null }, exceptId: string | null): Promise<string | null> {
  if (values.biometricCode) {
    const sameCode = await db
      .select({ id: employees.id, name: employees.name })
      .from(employees)
      .where(and(eq(employees.biometricCode, values.biometricCode), isNull(employees.deletedAt)));
    const other = sameCode.find((e) => e.id !== exceptId);
    if (other) return `Biometric code ${values.biometricCode} already belongs to ${other.name}.`;
  }
  const sameNo = await db
    .select({ id: employees.id })
    .from(employees)
    .where(and(eq(employees.empNo, values.empNo), isNull(employees.deletedAt)));
  if (sameNo.some((e) => e.id !== exceptId)) return `Employee number ${values.empNo} is already in use.`;
  if (values.userId) {
    const sameUser = await db
      .select({ id: employees.id, name: employees.name })
      .from(employees)
      .where(and(eq(employees.userId, values.userId), isNull(employees.deletedAt)));
    const other = sameUser.find((e) => e.id !== exceptId);
    if (other) return `That login already belongs to ${other.name}.`;
  }
  return null;
}

export async function saveEmployee(_prev: HrFormState, formData: FormData): Promise<HrFormState> {
  const user = await hrManager();
  if (!user) return { error: "You don't have permission to do that." };

  const parsed = await readEmployee(formData);
  if ("error" in parsed) return { error: parsed.error };
  const v = parsed.values;
  const id = blank(formData.get("employeeId"));

  const clash = await clashes(v, id);
  if (clash) return { error: clash };
  if (v.userId) {
    const [p] = await db.select({ id: profiles.id }).from(profiles).where(eq(profiles.id, v.userId));
    if (!p) return { error: "That login doesn't exist." };
  }
  if (v.reportsToId) {
    if (id && (await wouldCreateCycle(db, id, v.reportsToId))) {
      return { error: "That would make two people report to each other." };
    }
  }

  let savedId: string;
  if (id) {
    await db.update(employees).set({ ...v, updatedAt: new Date() }).where(eq(employees.id, id));
    savedId = id;
  } else {
    const [row] = await db.insert(employees).values({ ...v, createdBy: user.id }).returning({ id: employees.id });
    savedId = row.id;
  }
  await audit(user, id ? "hr.employee_update" : "hr.employee_create", "employees", savedId, v);
  revalidate();
  return { success: id ? "Saved." : `Added ${v.name}.` };
}

const policySchema = z.object({
  annualSick: z.number().min(0).max(60),
  annualCasual: z.number().min(0).max(60),
  probationMonths: z.number().int().min(0).max(36),
  probationPaidPerMonth: z.number().min(0).max(10),
});

export async function savePolicy(_prev: HrFormState, formData: FormData): Promise<HrFormState> {
  const user = await hrManager();
  if (!user) return { error: "You don't have permission to do that." };

  const parsed = policySchema.safeParse({
    annualSick: Number(formData.get("annualSick")),
    annualCasual: Number(formData.get("annualCasual")),
    probationMonths: Number(formData.get("probationMonths")),
    probationPaidPerMonth: Number(formData.get("probationPaidPerMonth")),
  });
  if (!parsed.success) return { error: "Check the numbers." };
  const weeklyOff = formData
    .getAll("weeklyOff")
    .map((v) => Number(v))
    .filter((n) => Number.isInteger(n) && n >= 0 && n <= 6);
  const values = {
    ...parsed.data,
    joiningMonthCounts: formData.get("joiningMonthCounts") === "on",
    weeklyOff,
    updatedBy: user.id,
    updatedAt: new Date(),
  };
  await db.update(hrSettings).set(values).where(eq(hrSettings.id, 1));
  await audit(user, "hr.policy_update", "hr_settings", "1", values);
  revalidate();
  return { success: "Saved." };
}

export async function addHoliday(_prev: HrFormState, formData: FormData): Promise<HrFormState> {
  const user = await hrManager();
  if (!user) return { error: "You don't have permission to do that." };
  const onDate = day(formData.get("onDate"));
  const name = blank(formData.get("name"));
  if (!onDate || !name) return { error: "Give the date and what it is." };
  const centerId = blank(formData.get("centerId"));
  const exists = await db
    .select({ id: companyHolidays.id })
    .from(companyHolidays)
    .where(and(eq(companyHolidays.onDate, onDate), eq(companyHolidays.name, name), isNull(companyHolidays.deletedAt)));
  if (exists.length > 0) return { error: "That holiday is already on the list." };
  const [row] = await db.insert(companyHolidays).values({ onDate, name, centerId, createdBy: user.id }).returning({ id: companyHolidays.id });
  await audit(user, "hr.holiday_add", "company_holidays", row.id, { onDate, name, centerId });
  revalidate();
  return { success: "Added." };
}

export async function removeHoliday(_prev: HrFormState, formData: FormData): Promise<HrFormState> {
  const user = await hrManager();
  if (!user) return { error: "You don't have permission to do that." };
  const id = String(formData.get("holidayId") ?? "");
  await db.update(companyHolidays).set({ deletedAt: new Date() }).where(eq(companyHolidays.id, id));
  await audit(user, "hr.holiday_remove", "company_holidays", id, {});
  revalidate();
  return { success: "Removed." };
}

const KINDS = ["sick", "casual", "lop", "half_day"] as const;

export async function applyLeave(_prev: HrFormState, formData: FormData): Promise<HrFormState> {
  const user = await getCurrentUser();
  if (!user || !can(user, "hr.self")) return { error: "You don't have permission to do that." };
  const employee = await employeeForUser(db, user.id);
  if (!employee) return { error: "Your login isn't linked to an employee record yet. Ask HR." };

  const kind = String(formData.get("kind") ?? "") as (typeof KINDS)[number];
  if (!KINDS.includes(kind)) return { error: "Pick the kind of leave." };

  const result = await applyForLeave(db, {
    employeeId: employee.id,
    kind,
    fromDate: String(formData.get("fromDate") ?? ""),
    toDate: String(formData.get("toDate") ?? formData.get("fromDate") ?? ""),
    reason: blank(formData.get("reason")),
  });
  if (!result.ok) return { error: result.error };

  await audit(user, "hr.leave_apply", "leave_requests", result.id, { kind, days: result.days });
  const fromDate = String(formData.get("fromDate"));
  await notify({
    eventKey: "leave.requested",
    context: {
      employee_name: employee.name,
      leave_type: LEAVE_KIND_LABELS[kind],
      from_date: fromDate,
      to_date: kind === "half_day" ? fromDate : String(formData.get("toDate") ?? fromDate),
      days: result.days,
      reason: blank(formData.get("reason")) ?? "",
    },
    href: `/hr/leave/${result.id}`,
    entityType: "leave_requests",
    entityId: result.id,
    centerId: employee.centerId,
    ownerId: result.approverUserId,
    actorId: user.id,
  });
  revalidate();
  return {
    success: result.approverUserId
      ? `Sent for approval (${result.days} day${result.days === 1 ? "" : "s"}).`
      : `Sent to HR (${result.days} day${result.days === 1 ? "" : "s"}). You have no manager set, so HR approves it.`,
  };
}

export async function decideLeaveRequest(_prev: HrFormState, formData: FormData): Promise<HrFormState> {
  const user = await getCurrentUser();
  if (!user) return { error: "You don't have permission to do that." };
  const requestId = String(formData.get("requestId") ?? "");
  const decision = formData.get("decision") === "rejected" ? "rejected" : "approved";

  const result = await decideLeave(db, {
    requestId,
    user: { id: user.id, isHr: can(user, "hr.manage") },
    decision,
    note: blank(formData.get("note")),
  });
  if (!result.ok) return { error: result.error };

  await audit(user, `hr.leave_${decision}`, "leave_requests", requestId, { note: blank(formData.get("note")) });
  const [r] = await db.select().from(leaveRequests).where(eq(leaveRequests.id, requestId));
  const [me] = await db.select({ name: profiles.fullName }).from(profiles).where(eq(profiles.id, user.id));
  await notify({
    eventKey: "leave.decided",
    context: {
      leave_type: LEAVE_KIND_LABELS[r.kind],
      from_date: r.fromDate,
      to_date: r.toDate,
      decision: decision === "approved" ? "approved" : "turned down",
      decided_by: me?.name ?? "HR",
      note: r.decisionNote ?? "",
    },
    href: `/hr/leave/${requestId}`,
    entityType: "leave_requests",
    entityId: requestId,
    ownerId: result.employeeUserId,
    actorId: user.id,
  });
  revalidate();
  return { success: decision === "approved" ? "Approved." : "Turned down." };
}

export async function cancelLeaveRequest(_prev: HrFormState, formData: FormData): Promise<HrFormState> {
  const user = await getCurrentUser();
  if (!user || !can(user, "hr.self")) return { error: "You don't have permission to do that." };
  const requestId = String(formData.get("requestId") ?? "");
  const result = await cancelLeave(db, { requestId, userId: user.id, today: new Date().toISOString().slice(0, 10) });
  if (!result.ok) return { error: result.error };
  await audit(user, "hr.leave_cancel", "leave_requests", requestId, {});
  revalidate();
  return { success: "Withdrawn." };
}

