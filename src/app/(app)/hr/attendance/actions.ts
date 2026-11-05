"use server";

import { createHash, randomBytes } from "node:crypto";

import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { writeAuditLog } from "@/lib/audit/log";
import { can, getCurrentUser, type SessionUser } from "@/lib/auth/session";
import { ingestPunches, mapCode } from "@/lib/attendance/ingest";
import { parsePunchCsv } from "@/lib/attendance/parse";
import { db } from "@/lib/db/client";
import { attendanceAdjustments, biometricDevices, employees, payrollSettings } from "@/lib/db/schema";
import { createClient } from "@/lib/supabase/server";

export interface AttendanceFormState {
  error?: string;
  success?: string;
  /** Shown once, when a key is generated. */
  key?: string;
}

async function audit(user: SessionUser, action: string, entityId: string, after: Record<string, unknown>) {
  const supabase = await createClient();
  await writeAuditLog(supabase, { actorId: user.id, action, entityType: "attendance", entityId, after });
}

const MAX_CSV_BYTES = 3 * 1024 * 1024;

export async function importPunchFile(_prev: AttendanceFormState, formData: FormData): Promise<AttendanceFormState> {
  const user = await getCurrentUser();
  if (!user || !can(user, "hr.manage")) return { error: "You don't have permission to do that." };
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose the file exported from the attendance software." };
  if (file.size > MAX_CSV_BYTES) return { error: "That file is over 3 MB. Export a shorter period." };

  const parsed = parsePunchCsv(await file.text());
  if (parsed.error) return { error: parsed.error };
  const result = await ingestPunches(db, parsed.punches, { source: "csv" });
  await audit(user, "attendance.import", "csv", { received: result.received, added: result.added, skipped: parsed.skipped });
  revalidatePath("/hr/attendance");
  return {
    success:
      `${result.added} new punch${result.added === 1 ? "" : "es"} added (${result.received - result.added} were already here` +
      `${parsed.skipped ? `, ${parsed.skipped} rows could not be read` : ""}).` +
      (result.unmapped.length ? ` Codes with nobody mapped yet: ${result.unmapped.slice(0, 12).join(", ")}${result.unmapped.length > 12 ? "…" : ""}.` : ""),
  };
}

export async function mapPunchCode(_prev: AttendanceFormState, formData: FormData): Promise<AttendanceFormState> {
  const user = await getCurrentUser();
  if (!user || !can(user, "hr.manage")) return { error: "You don't have permission to do that." };
  const result = await mapCode(db, { code: String(formData.get("code") ?? ""), employeeId: String(formData.get("employeeId") ?? "") });
  if (!result.ok) return { error: result.error };
  await audit(user, "attendance.map_code", String(formData.get("employeeId")), { code: String(formData.get("code")), claimed: result.claimed });
  revalidatePath("/hr", "layout");
  return { success: `Mapped. ${result.claimed} waiting punch${result.claimed === 1 ? "" : "es"} now count.` };
}

export async function saveShift(_prev: AttendanceFormState, formData: FormData): Promise<AttendanceFormState> {
  const user = await getCurrentUser();
  if (!user || !can(user, "payroll.manage")) return { error: "Only the people who set pay can do that." };
  const start = String(formData.get("shiftStart") ?? "");
  const end = String(formData.get("shiftEnd") ?? "");
  if (!/^\d{2}:\d{2}$/.test(start) || !/^\d{2}:\d{2}$/.test(end) || end <= start) return { error: "Give a start and an end time, with the end after the start." };
  await db.update(payrollSettings).set({ shiftStart: start, shiftEnd: end, updatedBy: user.id, updatedAt: new Date() }).where(eq(payrollSettings.id, 1));
  await audit(user, "attendance.shift", "1", { start, end });
  revalidatePath("/hr/attendance");
  return { success: "Saved." };
}

export async function generateKey(): Promise<AttendanceFormState> {
  const user = await getCurrentUser();
  if (!user || !can(user, "payroll.manage")) return { error: "Only the people who set pay can do that." };
  const key = `afd_${randomBytes(24).toString("hex")}`;
  await db
    .update(payrollSettings)
    .set({ attendanceKeyHash: createHash("sha256").update(key).digest("hex"), attendanceKeySetAt: new Date() })
    .where(eq(payrollSettings.id, 1));
  await audit(user, "attendance.key_generated", "1", {});
  revalidatePath("/hr/attendance");
  return { success: "New key made. Copy it now: it is not shown again, and any relay using the old key stops working.", key };
}

export async function addDevice(_prev: AttendanceFormState, formData: FormData): Promise<AttendanceFormState> {
  const user = await getCurrentUser();
  if (!user || !can(user, "payroll.manage")) return { error: "Only the people who set pay can do that." };
  const serial = String(formData.get("serial") ?? "").trim();
  if (!/^[A-Za-z0-9]{4,40}$/.test(serial)) return { error: "Enter the serial number shown on the device (letters and digits)." };
  const inserted = await db
    .insert(biometricDevices)
    .values({ serial, name: String(formData.get("name") ?? "").trim() || null, createdBy: user.id })
    .onConflictDoNothing()
    .returning({ id: biometricDevices.id });
  if (inserted.length === 0) return { error: "That device is already registered." };
  await audit(user, "attendance.device_add", inserted[0].id, { serial });
  revalidatePath("/hr/attendance");
  return { success: "Registered. It will be accepted the next time it connects." };
}

const KINDS = ["present", "comp_off", "excused", "worked_off_day"] as const;

/** HR marks a day: present, a comp-off, excused lateness, or worked on a day off. One mark per person per day. */
export async function setAdjustment(_prev: AttendanceFormState, formData: FormData): Promise<AttendanceFormState> {
  const user = await getCurrentUser();
  if (!user || !can(user, "hr.manage")) return { error: "You don't have permission to do that." };
  const employeeId = String(formData.get("employeeId") ?? "");
  const onDate = String(formData.get("onDate") ?? "");
  const kind = String(formData.get("kind") ?? "") as (typeof KINDS)[number];
  const note = String(formData.get("note") ?? "").trim();
  if (!KINDS.includes(kind) || !/^\d{4}-\d{2}-\d{2}$/.test(onDate)) return { error: "Pick what to mark the day as." };
  if (note.length < 3) return { error: "Say why, in a few words. It is kept with who marked it." };
  const [emp] = await db.select({ id: employees.id }).from(employees).where(eq(employees.id, employeeId));
  if (!emp) return { error: "That employee doesn't exist." };

  await db.transaction(async (tx) => {
    await tx
      .update(attendanceAdjustments)
      .set({ removedAt: new Date(), removedBy: user.id })
      .where(and(eq(attendanceAdjustments.employeeId, employeeId), eq(attendanceAdjustments.onDate, onDate), isNull(attendanceAdjustments.removedAt)));
    await tx.insert(attendanceAdjustments).values({ employeeId, onDate, kind, note, createdBy: user.id });
  });
  await audit(user, "attendance.adjust", employeeId, { onDate, kind, note });
  revalidatePath("/hr", "layout");
  return { success: "Marked." };
}

export async function clearAdjustment(_prev: AttendanceFormState, formData: FormData): Promise<AttendanceFormState> {
  const user = await getCurrentUser();
  if (!user || !can(user, "hr.manage")) return { error: "You don't have permission to do that." };
  const employeeId = String(formData.get("employeeId") ?? "");
  const onDate = String(formData.get("onDate") ?? "");
  await db
    .update(attendanceAdjustments)
    .set({ removedAt: new Date(), removedBy: user.id })
    .where(and(eq(attendanceAdjustments.employeeId, employeeId), eq(attendanceAdjustments.onDate, onDate), isNull(attendanceAdjustments.removedAt)));
  await audit(user, "attendance.adjust_clear", employeeId, { onDate });
  revalidatePath("/hr", "layout");
  return { success: "Cleared." };
}
