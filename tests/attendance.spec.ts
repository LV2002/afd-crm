import { describe, expect, it } from "vitest";

import { parseDeviceAttLog, parsePunchCsv, parsePunchTime } from "../src/lib/attendance/parse";
import { buildAttendance } from "../src/lib/attendance/report";

describe("punch times", () => {
  it("reads device times as India time", () => {
    expect(parsePunchTime("2026-11-03 09:41:05")?.toISOString()).toBe("2026-11-03T04:11:05.000Z");
  });
  it("reads day-first dates, 12-hour clocks and two-digit years", () => {
    expect(parsePunchTime("03/11/2026 9:41")?.toISOString()).toBe("2026-11-03T04:11:00.000Z");
    expect(parsePunchTime("03-11-26 05:30 PM")?.toISOString()).toBe("2026-11-03T12:00:00.000Z");
    expect(parsePunchTime("03/11/2026 12:05 AM")?.toISOString()).toBe("2026-11-02T18:35:00.000Z");
  });
  it("keeps a time that carries its own offset", () => {
    expect(parsePunchTime("2026-11-03T04:11:05Z")?.toISOString()).toBe("2026-11-03T04:11:05.000Z");
  });
  it("refuses nonsense, including dates that don't exist", () => {
    expect(parsePunchTime("31/02/2026 09:00")).toBeNull();
    expect(parsePunchTime("hello")).toBeNull();
    expect(parsePunchTime("2026-11-03 25:00")).toBeNull();
  });
});

describe("reading an export", () => {
  it("reads a combined date-and-time column", () => {
    const r = parsePunchCsv("Employee Code,Employee Name,PunchDateTime\n10085,Anand,03/11/2026 09:41:00\n10088,Athira,03/11/2026 09:50:00\n");
    expect(r.error).toBeNull();
    expect(r.punches.map((p) => p.code)).toEqual(["10085", "10088"]);
  });
  it("reads separate date and time columns, under title lines", () => {
    const r = parsePunchCsv("Daily Raw Punch Report\n\nEmp Code,Log Date,Log Time\n7,2026-11-03,09:00:00\n7,2026-11-03,17:31:00\n");
    expect(r.punches).toHaveLength(2);
  });
  it("counts rows it could not read and refuses a file with no usable columns", () => {
    const r = parsePunchCsv("Emp Code,Log Date,Log Time\n7,2026-11-03,09:00:00\n,,\n8,garbage,09:00\n");
    expect(r.punches).toHaveLength(1);
    expect(r.skipped).toBe(2);
    expect(parsePunchCsv("a,b,c\n1,2,3").error).toMatch(/columns/);
  });
  it("reads what a device pushes", () => {
    const r = parseDeviceAttLog("12\t2026-11-03 09:41:00\t0\t1\t0\n13\t2026-11-03 09:55:00\t0\t1\t0\n\nbad line\n");
    expect(r.punches.map((p) => p.code)).toEqual(["12", "13"]);
    expect(r.skipped).toBe(1);
  });
});

describe("the preliminary report", () => {
  const at = (date: string, time: string) => parsePunchTime(`${date} ${time}`) as Date;
  const base = {
    month: "2026-11",
    shiftStart: "09:30",
    shiftEnd: "17:30",
    weeklyOff: [0],
    holidays: new Set(["2026-11-12"]),
    dateOfJoining: "2020-01-01",
    leave: new Map<string, string>(),
    today: "2026-11-30",
  };

  it("measures late and early against the shift, and flags a single punch and an absence", () => {
    const r = buildAttendance({
      ...base,
      leave: new Map([["2026-11-05", "casual"]]),
      punches: [
        at("2026-11-02", "09:45"), at("2026-11-02", "17:30"), // 15 late
        at("2026-11-03", "09:30"), at("2026-11-03", "17:00"), // 30 early
        at("2026-11-04", "09:30"), // one punch
        // 5 Nov on leave; 6 Nov nothing: absent
      ],
    });
    const day = (d: string) => r.days.find((x) => x.date === d)!;
    expect(day("2026-11-02")).toMatchObject({ status: "present", lateMinutes: 15, earlyMinutes: 0 });
    expect(day("2026-11-03")).toMatchObject({ earlyMinutes: 30, lateMinutes: 0 });
    expect(day("2026-11-04").status).toBe("single");
    expect(day("2026-11-05").status).toBe("leave");
    expect(day("2026-11-06").status).toBe("absent");
    expect(day("2026-11-08").status).toBe("off");
    expect(day("2026-11-12").status).toBe("holiday");
    expect(r.suggestions).toContainEqual({ date: "2026-11-02", type: "late", minutes: 15, notes: "In 09:45" });
    expect(r.suggestions).toContainEqual({ date: "2026-11-06", type: "lop", notes: "No biometric punch" });
    expect(r.suggestions.find((s) => s.date === "2026-11-05")).toBeUndefined();
  });

  it("does not judge days before joining or days still to come", () => {
    const r = buildAttendance({ ...base, dateOfJoining: "2026-11-10", today: "2026-11-12", punches: [] });
    expect(r.days.find((d) => d.date === "2026-11-03")!.status).toBe("before_joining");
    expect(r.days.find((d) => d.date === "2026-11-13")!.status).toBe("upcoming");
    expect(r.days.find((d) => d.date === "2026-11-11")!.status).toBe("absent");
  });

  it("uses India time for the day, so a late-evening punch stays on its day", () => {
    const r = buildAttendance({ ...base, punches: [at("2026-11-02", "09:30"), at("2026-11-02", "23:50")] });
    expect(r.days.find((d) => d.date === "2026-11-02")).toMatchObject({ status: "present", last: "23:50", earlyMinutes: 0 });
  });
});
