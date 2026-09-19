/**
 * "Who can take Saturday 10–13?"
 *
 * The question the timetable generator will ask a few hundred times a
 * week, and the one the coordinator answers today from memory. Four things
 * can stop somebody: they do not teach at that centre, they do not teach
 * that subject, the hour is outside the windows they gave, or they are
 * already booked — or on leave.
 *
 * All four are reported, not just the first. "Anil is busy" sends you
 * looking for another slot; "Anil is busy AND does not teach Drawing"
 * tells you to stop considering Anil. A checker that short-circuits hides
 * the second kind of answer.
 *
 * Pure: no database, no clock. `parseTimeToMinutes` and `dayOfWeekIST` are
 * shared with the pacing module rather than reimplemented, because two
 * functions that both answer "what day is this" will eventually disagree.
 */

import { dayOfWeekIST, parseTimeToMinutes } from "@/lib/curriculum/pacing";

export interface TimeWindow {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
}

export interface LeavePeriod {
  /** Inclusive, both ends: "away the 12th to the 15th" is four days. */
  startDate: string;
  endDate: string;
  reason?: string | null;
}

/** Something already in this person's diary. */
export interface Booking {
  date: string;
  startTime: string;
  endTime: string;
  /** What it is, so the answer can name it rather than just saying "busy". */
  label?: string;
}

export interface FacultyProfile {
  id: string;
  name: string;
  availabilityMode: "always" | "by_window";
  centerIds: readonly string[];
  subjects: readonly string[];
  windows: readonly TimeWindow[];
  leave: readonly LeavePeriod[];
  bookings: readonly Booking[];
  isActive?: boolean;
}

/** The slot we are trying to fill. */
export interface SlotRequest {
  date: string;
  startTime: string;
  endTime: string;
  centerId: string;
  /** Omit when the block has no subject — then any faculty qualifies on that axis. */
  subject?: string | null;
}

export type BlockerCode =
  | "inactive"
  | "wrong_centre"
  | "wrong_subject"
  | "outside_hours"
  | "on_leave"
  | "clash";

export interface Blocker {
  code: BlockerCode;
  /** Written for the coordinator, not the log. */
  message: string;
}

export interface FacultyCheck {
  facultyId: string;
  name: string;
  available: boolean;
  blockers: Blocker[];
}

/**
 * Do two time ranges on the same day overlap?
 *
 * Touching is not overlapping: a class ending at 13:00 and one starting at
 * 13:00 are back to back, which is normal and must not be reported as a
 * clash. Hence `<` on both sides rather than `<=`.
 */
export function timesOverlap(
  aStart: string,
  aEnd: string,
  bStart: string,
  bEnd: string,
): boolean {
  const a1 = parseTimeToMinutes(aStart);
  const a2 = parseTimeToMinutes(aEnd);
  const b1 = parseTimeToMinutes(bStart);
  const b2 = parseTimeToMinutes(bEnd);
  return a1 < b2 && b1 < a2;
}

/** Does `window` fully contain the requested hours? Partial cover is not cover. */
export function windowCovers(window: TimeWindow, startTime: string, endTime: string): boolean {
  return (
    parseTimeToMinutes(window.startTime) <= parseTimeToMinutes(startTime) &&
    parseTimeToMinutes(window.endTime) >= parseTimeToMinutes(endTime)
  );
}

/** Inclusive of both ends. ISO dates compare correctly as strings. */
export function dateWithin(date: string, period: LeavePeriod): boolean {
  return date >= period.startDate && date <= period.endDate;
}

export function checkFacultyForSlot(
  person: FacultyProfile,
  slot: SlotRequest,
): FacultyCheck {
  const blockers: Blocker[] = [];

  if (person.isActive === false) {
    blockers.push({ code: "inactive", message: "No longer teaching here" });
  }

  if (!person.centerIds.includes(slot.centerId)) {
    blockers.push({ code: "wrong_centre", message: "Does not teach at this centre" });
  }

  if (slot.subject && !person.subjects.includes(slot.subject)) {
    blockers.push({ code: "wrong_subject", message: `Does not teach ${slot.subject}` });
  }

  // Only a `by_window` person has hours to be outside of. Somebody on
  // `always` is assumed free, which is the default precisely so that a
  // half-filled availability table does not silently make everyone
  // unschedulable.
  if (person.availabilityMode === "by_window") {
    const dayOfWeek = dayOfWeekIST(slot.date);
    const covered = person.windows.some(
      (window) =>
        window.dayOfWeek === dayOfWeek && windowCovers(window, slot.startTime, slot.endTime),
    );
    if (!covered) {
      blockers.push({ code: "outside_hours", message: "Outside the hours they gave" });
    }
  }

  const leave = person.leave.find((period) => dateWithin(slot.date, period));
  if (leave) {
    blockers.push({
      code: "on_leave",
      message: leave.reason ? `On leave — ${leave.reason}` : "On leave",
    });
  }

  const clash = person.bookings.find(
    (booking) =>
      booking.date === slot.date &&
      timesOverlap(booking.startTime, booking.endTime, slot.startTime, slot.endTime),
  );
  if (clash) {
    blockers.push({
      code: "clash",
      message: clash.label ? `Already taking ${clash.label}` : "Already booked",
    });
  }

  return {
    facultyId: person.id,
    name: person.name,
    available: blockers.length === 0,
    blockers,
  };
}

/**
 * Everyone, sorted so the usable answers come first.
 *
 * Returns the blocked people too, rather than filtering them out. When
 * nobody is free the coordinator needs to see *why* — one person on leave
 * and two double-booked is a different problem from nobody teaching that
 * subject at all, and a screen that shows an empty list cannot tell her
 * which she has.
 *
 * Within the available group, fewest existing bookings first: it spreads
 * the load instead of handing every slot to whoever appears first
 * alphabetically.
 */
export function rankFacultyForSlot(
  people: readonly FacultyProfile[],
  slot: SlotRequest,
): FacultyCheck[] {
  const bookingCount = new Map(people.map((p) => [p.id, p.bookings.length]));

  return people
    .map((person) => checkFacultyForSlot(person, slot))
    .sort((a, b) => {
      if (a.available !== b.available) return a.available ? -1 : 1;
      if (a.available) {
        const load = (bookingCount.get(a.facultyId) ?? 0) - (bookingCount.get(b.facultyId) ?? 0);
        if (load !== 0) return load;
      } else {
        // Among the blocked, fewer reasons first — "just busy" is closer
        // to usable than "wrong centre, wrong subject, on leave".
        const reasons = a.blockers.length - b.blockers.length;
        if (reasons !== 0) return reasons;
      }
      return a.name.localeCompare(b.name);
    });
}

/**
 * Turn a person's own timetable into `Booking`s, given the slots they are
 * assigned to. A thin adapter, kept here so callers do not each invent
 * their own shape for "busy".
 */
export function bookingsFromSlots(
  slots: ReadonlyArray<{ date: string; startTime: string; endTime: string; batchName?: string }>,
): Booking[] {
  return slots.map((slot) => ({
    date: slot.date,
    startTime: slot.startTime,
    endTime: slot.endTime,
    label: slot.batchName,
  }));
}

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** "Sat" / "Saturday" for a 0–6 index. Throws rather than returning "undefined". */
export function dayName(dayOfWeek: number, short = false): string {
  const name = DAY_NAMES[dayOfWeek];
  if (!name) throw new Error(`Not a day of the week: ${dayOfWeek}`);
  return short ? name.slice(0, 3) : name;
}

/** `10:00:00` → `10:00`. Postgres returns seconds; nobody wants to read them. */
export function formatTime(value: string): string {
  const match = /^(\d{1,2}):(\d{2})/.exec(value.trim());
  if (!match) return value;
  return `${match[1].padStart(2, "0")}:${match[2]}`;
}
