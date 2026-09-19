/**
 * "Who can take Saturday 10–13?"
 *
 * Pure functions, no database. The scenarios are AFD's: a visiting
 * faculty member who only comes on weekends, somebody who teaches at both
 * centres, and the double-booking that a timetable generator will produce
 * on its first run if nobody checks.
 */
import { describe, expect, it } from "vitest";

import {
  bookingsFromSlots,
  checkFacultyForSlot,
  dateWithin,
  dayName,
  formatTime,
  rankFacultyForSlot,
  timesOverlap,
  windowCovers,
  type FacultyProfile,
  type SlotRequest,
} from "@/lib/faculty/availability";

const KOCHI = "11111111-1111-1111-1111-111111111111";
const KANNUR = "22222222-2222-2222-2222-222222222222";

/** 19 September 2026 is a Saturday. */
const SATURDAY_SLOT: SlotRequest = {
  date: "2026-09-19",
  startTime: "10:00:00",
  endTime: "13:00:00",
  centerId: KOCHI,
  subject: "drawing",
};

function person(over: Partial<FacultyProfile> = {}): FacultyProfile {
  return {
    id: "f1",
    name: "Athira",
    availabilityMode: "always",
    centerIds: [KOCHI],
    subjects: ["drawing"],
    windows: [],
    leave: [],
    bookings: [],
    ...over,
  };
}

describe("timesOverlap", () => {
  it("finds a real overlap", () => {
    expect(timesOverlap("10:00", "13:00", "12:00", "14:00")).toBe(true);
    expect(timesOverlap("10:00", "13:00", "09:00", "11:00")).toBe(true);
    // Fully contained, both ways round.
    expect(timesOverlap("10:00", "13:00", "11:00", "12:00")).toBe(true);
    expect(timesOverlap("11:00", "12:00", "10:00", "13:00")).toBe(true);
  });

  it("does not call back-to-back classes a clash", () => {
    // The 10–13 class and the 13–16 class are a normal teaching day, and
    // reporting them as a conflict would make the checker useless.
    expect(timesOverlap("10:00", "13:00", "13:00", "16:00")).toBe(false);
    expect(timesOverlap("13:00", "16:00", "10:00", "13:00")).toBe(false);
  });

  it("handles the seconds Postgres adds", () => {
    expect(timesOverlap("10:00:00", "13:00:00", "12:30:00", "14:00:00")).toBe(true);
  });
});

describe("windowCovers", () => {
  const saturdayMorning = { dayOfWeek: 6, startTime: "09:00", endTime: "13:00" };

  it("covers a slot fully inside it", () => {
    expect(windowCovers(saturdayMorning, "10:00", "13:00")).toBe(true);
    expect(windowCovers(saturdayMorning, "09:00", "09:30")).toBe(true);
  });

  it("does not count partial cover as cover", () => {
    // Free until 13:00 does not mean available for a class ending at 14:00.
    expect(windowCovers(saturdayMorning, "12:00", "14:00")).toBe(false);
    expect(windowCovers(saturdayMorning, "08:00", "10:00")).toBe(false);
  });
});

describe("dateWithin", () => {
  const away = { startDate: "2026-11-12", endDate: "2026-11-15" };

  it("includes both end dates", () => {
    expect(dateWithin("2026-11-12", away)).toBe(true);
    expect(dateWithin("2026-11-15", away)).toBe(true);
    expect(dateWithin("2026-11-13", away)).toBe(true);
  });

  it("excludes the days either side", () => {
    expect(dateWithin("2026-11-11", away)).toBe(false);
    expect(dateWithin("2026-11-16", away)).toBe(false);
  });
});

describe("checkFacultyForSlot", () => {
  it("clears somebody with nothing in the way", () => {
    const result = checkFacultyForSlot(person(), SATURDAY_SLOT);
    expect(result.available).toBe(true);
    expect(result.blockers).toEqual([]);
    expect(result.name).toBe("Athira");
  });

  it("blocks somebody who does not teach at that centre", () => {
    const result = checkFacultyForSlot(person({ centerIds: [KANNUR] }), SATURDAY_SLOT);
    expect(result.available).toBe(false);
    expect(result.blockers.map((b) => b.code)).toEqual(["wrong_centre"]);
  });

  it("blocks somebody who does not teach that subject", () => {
    const result = checkFacultyForSlot(person({ subjects: ["mathematics"] }), SATURDAY_SLOT);
    expect(result.blockers.map((b) => b.code)).toEqual(["wrong_subject"]);
    expect(result.blockers[0].message).toContain("drawing");
  });

  it("ignores subject when the block has none", () => {
    // A mock test invigilation or a revision block names no subject.
    const result = checkFacultyForSlot(person({ subjects: [] }), {
      ...SATURDAY_SLOT,
      subject: null,
    });
    expect(result.available).toBe(true);
  });

  it("assumes an 'always' person is free, even with no windows entered", () => {
    // The default, and the reason it is the default: nobody fills in a
    // full availability grid, and a system that demands one schedules
    // nobody.
    const result = checkFacultyForSlot(person({ availabilityMode: "always", windows: [] }), SATURDAY_SLOT);
    expect(result.available).toBe(true);
  });

  it("holds a 'by_window' person to the hours they gave", () => {
    const weekendsOnly = person({
      availabilityMode: "by_window",
      windows: [{ dayOfWeek: 6, startTime: "09:00", endTime: "13:00" }],
    });

    expect(checkFacultyForSlot(weekendsOnly, SATURDAY_SLOT).available).toBe(true);

    // Same person, Sunday: no window, so no.
    const sunday = checkFacultyForSlot(weekendsOnly, { ...SATURDAY_SLOT, date: "2026-09-20" });
    expect(sunday.blockers.map((b) => b.code)).toEqual(["outside_hours"]);
  });

  it("blocks a leave day and says why", () => {
    const result = checkFacultyForSlot(
      person({ leave: [{ startDate: "2026-09-18", endDate: "2026-09-21", reason: "Wedding" }] }),
      SATURDAY_SLOT,
    );
    expect(result.blockers.map((b) => b.code)).toEqual(["on_leave"]);
    expect(result.blockers[0].message).toBe("On leave — Wedding");
  });

  it("catches the double-booking a generator would otherwise make", () => {
    const result = checkFacultyForSlot(
      person({
        bookings: [
          { date: "2026-09-19", startTime: "11:00", endTime: "14:00", label: "Crash Kannur" },
        ],
      }),
      SATURDAY_SLOT,
    );
    expect(result.blockers.map((b) => b.code)).toEqual(["clash"]);
    expect(result.blockers[0].message).toBe("Already taking Crash Kannur");
  });

  it("is not troubled by a booking on another day", () => {
    const result = checkFacultyForSlot(
      person({ bookings: [{ date: "2026-09-20", startTime: "10:00", endTime: "13:00" }] }),
      SATURDAY_SLOT,
    );
    expect(result.available).toBe(true);
  });

  it("reports every reason, not only the first", () => {
    // "Busy" sends you hunting for another slot. "Busy and does not teach
    // this" tells you to stop considering this person at all.
    const result = checkFacultyForSlot(
      person({
        centerIds: [KANNUR],
        subjects: ["english"],
        leave: [{ startDate: "2026-09-19", endDate: "2026-09-19" }],
      }),
      SATURDAY_SLOT,
    );
    expect(result.blockers.map((b) => b.code)).toEqual([
      "wrong_centre",
      "wrong_subject",
      "on_leave",
    ]);
  });

  it("blocks somebody who has left", () => {
    const result = checkFacultyForSlot(person({ isActive: false }), SATURDAY_SLOT);
    expect(result.blockers.map((b) => b.code)).toContain("inactive");
  });
});

describe("rankFacultyForSlot", () => {
  it("puts the available first and keeps the rest with their reasons", () => {
    const ranked = rankFacultyForSlot(
      [
        person({ id: "busy", name: "Rahul", bookings: [{ date: "2026-09-19", startTime: "10:00", endTime: "12:00" }] }),
        person({ id: "free", name: "Athira" }),
        person({ id: "elsewhere", name: "Nisha", centerIds: [KANNUR], subjects: ["english"] }),
      ],
      SATURDAY_SLOT,
    );

    expect(ranked.map((r) => r.facultyId)).toEqual(["free", "busy", "elsewhere"]);
    // Nobody is dropped: an empty list cannot explain itself.
    expect(ranked).toHaveLength(3);
    expect(ranked[1].blockers.map((b) => b.code)).toEqual(["clash"]);
  });

  it("spreads the load rather than always picking the same person", () => {
    const ranked = rankFacultyForSlot(
      [
        person({
          id: "loaded",
          name: "Anil",
          bookings: [
            { date: "2026-09-26", startTime: "10:00", endTime: "13:00" },
            { date: "2026-09-27", startTime: "10:00", endTime: "13:00" },
          ],
        }),
        person({ id: "light", name: "Zoya" }),
      ],
      SATURDAY_SLOT,
    );

    // Both free for this slot; the one with less on already goes first,
    // in spite of coming second alphabetically.
    expect(ranked.map((r) => r.facultyId)).toEqual(["light", "loaded"]);
  });

  it("is stable and alphabetical when everything else ties", () => {
    const ranked = rankFacultyForSlot(
      [person({ id: "b", name: "Bina" }), person({ id: "a", name: "Anu" })],
      SATURDAY_SLOT,
    );
    expect(ranked.map((r) => r.name)).toEqual(["Anu", "Bina"]);
  });

  it("returns an empty list for an empty roster rather than throwing", () => {
    expect(rankFacultyForSlot([], SATURDAY_SLOT)).toEqual([]);
  });
});

describe("display helpers", () => {
  it("names the days", () => {
    expect(dayName(0)).toBe("Sunday");
    expect(dayName(6, true)).toBe("Sat");
    expect(() => dayName(7)).toThrow(/Not a day/);
  });

  it("drops the seconds Postgres adds", () => {
    expect(formatTime("10:00:00")).toBe("10:00");
    expect(formatTime("9:30")).toBe("09:30");
  });

  it("carries the batch name through as the clash label", () => {
    const bookings = bookingsFromSlots([
      { date: "2026-09-19", startTime: "10:00", endTime: "13:00", batchName: "Foundation AM" },
    ]);
    expect(bookings[0].label).toBe("Foundation AM");
  });
});
