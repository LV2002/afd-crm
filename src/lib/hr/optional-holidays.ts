import { and, eq, inArray, isNull } from "drizzle-orm";

import type { DbExecutor } from "@/lib/db/client";
import { companyHolidays, employeeOptionalHolidays, leaveRequests } from "@/lib/db/schema";

import { rangesOverlap } from "./leave";
import type { Result } from "./service";

/**
 * Optional holidays: a few days on the list that each person may take one of.
 * Choosing one makes it a holiday for that person alone and uses up their
 * choice for the year; the rest are then closed to them.
 */

export interface OptionalHoliday {
  id: string;
  onDate: string;
  name: string;
}

export interface OptionalChoices {
  year: number;
  options: OptionalHoliday[];
  /** The one they took this year, if any. */
  chosen: OptionalHoliday | null;
}

/** The optional holidays open to somebody at this centre in a year, and which one they took. */
export async function optionalChoices(tx: DbExecutor, employeeId: string, centerId: string | null, year: number): Promise<OptionalChoices> {
  const rows = await tx
    .select({ id: companyHolidays.id, onDate: companyHolidays.onDate, name: companyHolidays.name, centerId: companyHolidays.centerId })
    .from(companyHolidays)
    .where(and(isNull(companyHolidays.deletedAt), eq(companyHolidays.isOptional, true)))
    .orderBy(companyHolidays.onDate);
  const options = rows
    .filter((r) => r.onDate.startsWith(`${year}-`) && (r.centerId === null || r.centerId === centerId))
    .map(({ id, onDate, name }) => ({ id, onDate, name }));
  const [pick] = await tx
    .select({ holidayId: employeeOptionalHolidays.holidayId })
    .from(employeeOptionalHolidays)
    .where(and(eq(employeeOptionalHolidays.employeeId, employeeId), eq(employeeOptionalHolidays.year, year)));
  return { year, options, chosen: options.find((o) => o.id === pick?.holidayId) ?? null };
}

/** Takes an optional holiday. One per person per year, and only before the day. */
export async function chooseOptionalHoliday(
  tx: DbExecutor,
  input: { employeeId: string; centerId: string | null; holidayId: string; userId: string; today: string },
): Promise<Result<{ name: string; onDate: string }>> {
  const [holiday] = await tx
    .select()
    .from(companyHolidays)
    .where(and(eq(companyHolidays.id, input.holidayId), isNull(companyHolidays.deletedAt), eq(companyHolidays.isOptional, true)));
  if (!holiday) return { ok: false, error: "That isn't an optional holiday." };
  if (holiday.centerId !== null && holiday.centerId !== input.centerId) return { ok: false, error: "That holiday isn't for your centre." };
  if (holiday.onDate <= input.today) return { ok: false, error: "That day has already come. An optional holiday has to be chosen before it." };

  const year = Number(holiday.onDate.slice(0, 4));
  const [existing] = await tx
    .select({ holidayId: employeeOptionalHolidays.holidayId })
    .from(employeeOptionalHolidays)
    .where(and(eq(employeeOptionalHolidays.employeeId, input.employeeId), eq(employeeOptionalHolidays.year, year)));
  if (existing) return { ok: false, error: `You have already taken your optional holiday for ${year}.` };

  // Not on top of leave they have already applied for: the day would be counted twice.
  const live = await tx
    .select({ fromDate: leaveRequests.fromDate, toDate: leaveRequests.toDate })
    .from(leaveRequests)
    .where(and(eq(leaveRequests.employeeId, input.employeeId), inArray(leaveRequests.status, ["pending", "approved"])));
  if (live.some((r) => rangesOverlap(r.fromDate, r.toDate, holiday.onDate, holiday.onDate))) {
    return { ok: false, error: "You have leave applied for on that day. Withdraw it first." };
  }

  try {
    await tx.insert(employeeOptionalHolidays).values({
      employeeId: input.employeeId,
      holidayId: holiday.id,
      year,
      chosenBy: input.userId,
    });
  } catch {
    // The primary key is the real guard: two taps at once take it once.
    return { ok: false, error: `You have already taken your optional holiday for ${year}.` };
  }
  return { ok: true, name: holiday.name, onDate: holiday.onDate };
}

/** HR undoes somebody's choice, if the day has not come yet. */
export async function clearOptionalChoice(
  tx: DbExecutor,
  input: { employeeId: string; year: number; today: string },
): Promise<Result> {
  const [pick] = await tx
    .select({ onDate: companyHolidays.onDate })
    .from(employeeOptionalHolidays)
    .innerJoin(companyHolidays, eq(companyHolidays.id, employeeOptionalHolidays.holidayId))
    .where(and(eq(employeeOptionalHolidays.employeeId, input.employeeId), eq(employeeOptionalHolidays.year, input.year)));
  if (!pick) return { ok: false, error: "They haven't chosen one for that year." };
  if (pick.onDate <= input.today) return { ok: false, error: "That day has already come, so it can't be changed." };
  await tx
    .delete(employeeOptionalHolidays)
    .where(and(eq(employeeOptionalHolidays.employeeId, input.employeeId), eq(employeeOptionalHolidays.year, input.year)));
  return { ok: true };
}
