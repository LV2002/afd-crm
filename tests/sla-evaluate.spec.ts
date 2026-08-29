import { describe, expect, it } from "vitest";

import type { leads, slaPolicies } from "../src/lib/db/schema";
import { evaluateLeadSla } from "../src/lib/sla/evaluate-sla";

type Lead = typeof leads.$inferSelect;
type SlaPolicyRow = typeof slaPolicies.$inferSelect;

/** Same shape/purpose as assignment-evaluate.spec.ts's baseLead() — a minimal, fully-typed lead row for exercising the evaluator without a database. */
function baseLead(overrides: Partial<Lead> = {}): Lead {
  return {
    id: "00000000-0000-0000-0000-000000000001",
    leadNumber: 1,
    studentName: "Test Student",
    fatherName: null,
    motherName: null,
    primaryPhone: "+919847100000",
    alternatePhone: null,
    parentPhone: null,
    email: null,
    dob: null,
    gender: null,
    addressLine: null,
    city: null,
    district: null,
    state: null,
    stateOther: null,
    pincode: null,
    country: "India",
    educationStatus: null,
    schoolCollege: null,
    board: null,
    parentsOccupation: null,
    previousAttempts: null,
    interestedExams: null,
    examYear: null,
    coursesInterested: null,
    preferredMode: null,
    firstTouchSource: null,
    firstTouchSubSource: null,
    firstTouchCampaign: null,
    lastTouchSource: null,
    lastTouchSubSource: null,
    lastTouchCampaign: null,
    gclid: null,
    fbclid: null,
    utm: null,
    centerId: null,
    assignedTo: null,
    stageId: null,
    temperature: null,
    temperatureOverrideUntil: null,
    temperatureSetBy: null,
    score: null,
    isCompetitorStudent: false,
    competitorInstitute: null,
    referredByLeadId: null,
    brochureSent: false,
    firstResponseAt: null,
    lastActivityAt: null,
    nextFollowupAt: null,
    slaBreached: false,
    consentStatus: null,
    consentSource: null,
    consentAt: null,
    doNotContact: false,
    optedOutChannels: null,
    lostReason: null,
    lostReasonDetail: null,
    lostAt: null,
    mergedIntoLeadId: null,
    custom: null,
    createdAt: new Date("2026-08-20T00:00:00.000Z"),
    updatedAt: null,
    deletedAt: null,
    ...overrides,
  };
}

function basePolicy(overrides: Partial<SlaPolicyRow> = {}): SlaPolicyRow {
  return {
    id: "policy-1",
    name: "Default",
    priority: 0,
    isActive: true,
    appliesTo: null,
    measure: "first_response",
    targetHours: 24,
    businessHoursOnly: false,
    escalations: null,
    createdAt: new Date(),
    updatedAt: null,
    deletedAt: null,
    ...overrides,
  };
}

const NOW = new Date("2026-08-24T00:00:00.000Z"); // 4 days after the lead's createdAt above

describe("evaluateLeadSla", () => {
  it("no policies at all -> never breached", () => {
    const result = evaluateLeadSla({
      lead: baseLead(),
      policies: [],
      currentStageEnteredAt: NOW,
      businessHours: [],
      holidayDates: new Set(),
      timeZone: "Asia/Kolkata",
      now: NOW,
    });
    expect(result).toEqual({ policyId: null, breached: false, elapsedHours: 0 });
  });

  it("first_response: breaches once target hours have elapsed since creation, with no response logged", () => {
    const policy = basePolicy({ measure: "first_response", targetHours: 24 }); // lead is 96h old
    const result = evaluateLeadSla({
      lead: baseLead(),
      policies: [policy],
      currentStageEnteredAt: NOW,
      businessHours: [],
      holidayDates: new Set(),
      timeZone: "Asia/Kolkata",
      now: NOW,
    });
    expect(result.breached).toBe(true);
    expect(result.policyId).toBe("policy-1");
    expect(result.elapsedHours).toBeCloseTo(96, 6);
  });

  it("first_response: never breaches once a response is recorded, no matter how old the lead is", () => {
    const policy = basePolicy({ measure: "first_response", targetHours: 24 });
    const lead = baseLead({ firstResponseAt: new Date("2026-08-20T01:00:00.000Z") });
    const result = evaluateLeadSla({
      lead,
      policies: [policy],
      currentStageEnteredAt: NOW,
      businessHours: [],
      holidayDates: new Set(),
      timeZone: "Asia/Kolkata",
      now: NOW,
    });
    expect(result).toEqual({ policyId: null, breached: false, elapsedHours: 0 });
  });

  it("next_followup: not breached (and doesn't apply) when nothing is scheduled", () => {
    const policy = basePolicy({ measure: "next_followup", targetHours: 2 });
    const result = evaluateLeadSla({
      lead: baseLead(),
      policies: [policy],
      currentStageEnteredAt: NOW,
      businessHours: [],
      holidayDates: new Set(),
      timeZone: "Asia/Kolkata",
      now: NOW,
    });
    expect(result.breached).toBe(false);
  });

  it("next_followup: not breached while the scheduled time is still in the future", () => {
    const policy = basePolicy({ measure: "next_followup", targetHours: 1 });
    const lead = baseLead({ nextFollowupAt: new Date("2026-08-25T00:00:00.000Z") }); // after `now`
    const result = evaluateLeadSla({
      lead,
      policies: [policy],
      currentStageEnteredAt: NOW,
      businessHours: [],
      holidayDates: new Set(),
      timeZone: "Asia/Kolkata",
      now: NOW,
    });
    expect(result.breached).toBe(false);
  });

  it("next_followup: breaches once the overdue time exceeds the target", () => {
    const policy = basePolicy({ measure: "next_followup", targetHours: 2 });
    const lead = baseLead({ nextFollowupAt: new Date("2026-08-23T21:00:00.000Z") }); // 3h before `now`
    const result = evaluateLeadSla({
      lead,
      policies: [policy],
      currentStageEnteredAt: NOW,
      businessHours: [],
      holidayDates: new Set(),
      timeZone: "Asia/Kolkata",
      now: NOW,
    });
    expect(result.breached).toBe(true);
    expect(result.elapsedHours).toBeCloseTo(3, 6);
  });

  it("in_stage: measures from the given stage-entry instant, not lead creation", () => {
    const policy = basePolicy({ measure: "in_stage", targetHours: 10 });
    const enteredAt = new Date("2026-08-23T12:00:00.000Z"); // 12h before `now`
    const result = evaluateLeadSla({
      lead: baseLead(),
      policies: [policy],
      currentStageEnteredAt: enteredAt,
      businessHours: [],
      holidayDates: new Set(),
      timeZone: "Asia/Kolkata",
      now: NOW,
    });
    expect(result.breached).toBe(true);
    expect(result.elapsedHours).toBeCloseTo(12, 6);
  });

  it("businessHoursOnly routes through the business-hours calculator instead of wall-clock time", () => {
    // Lead created Monday 2026-08-24 00:00 IST equivalent handled via createdAt below;
    // policy targets 8h first_response, business hours only, Mon-Fri 09:00-18:00 IST.
    const lead = baseLead({ createdAt: new Date("2026-08-21T03:30:00.000Z") }); // Friday 09:00 IST
    const policy = basePolicy({ measure: "first_response", targetHours: 8, businessHoursOnly: true });
    const hours = [1, 2, 3, 4, 5].map((dayOfWeek) => ({
      dayOfWeek,
      opensAt: "09:00:00",
      closesAt: "18:00:00",
      isClosed: false,
    }));
    // now = Monday 2026-08-24 03:30Z = 09:00 IST -> only Friday's 9h of business time has elapsed
    // (the weekend doesn't count), which already exceeds the 8h target.
    const now = new Date("2026-08-24T03:30:00.000Z");
    const result = evaluateLeadSla({
      lead,
      policies: [policy],
      currentStageEnteredAt: now,
      businessHours: hours,
      holidayDates: new Set(),
      timeZone: "Asia/Kolkata",
      now,
    });
    expect(result.breached).toBe(true);
    expect(result.elapsedHours).toBeCloseTo(9, 6);
  });

  it("picks the highest-priority (lowest number) matching policy, ignoring a lower-priority match", () => {
    const lead = baseLead({ district: "Kannur" });
    const specific = basePolicy({
      id: "specific",
      priority: 0,
      appliesTo: { all: [{ field: "district", op: "equals", value: "Kannur" }] },
      measure: "first_response",
      targetHours: 1000, // deliberately unreachable, to prove this policy (not the catch-all) is the one used
    });
    const catchAll = basePolicy({ id: "catch-all", priority: 10, appliesTo: null, targetHours: 1 });
    const result = evaluateLeadSla({
      lead,
      policies: [catchAll, specific], // deliberately out of order — sorting is the function's job
      currentStageEnteredAt: NOW,
      businessHours: [],
      holidayDates: new Set(),
      timeZone: "Asia/Kolkata",
      now: NOW,
    });
    expect(result.policyId).toBe("specific");
    expect(result.breached).toBe(false); // 96h elapsed, nowhere near the specific policy's 1000h target
  });

  it("falls through to the next policy when the highest-priority match's measure doesn't currently apply", () => {
    const notYetOverdue = basePolicy({
      id: "followup-policy",
      priority: 0,
      measure: "next_followup",
      targetHours: 1,
    }); // no next_followup_at set on the lead -> doesn't apply, per measureBaseline
    const fallback = basePolicy({ id: "fallback", priority: 5, measure: "first_response", targetHours: 1 });
    const result = evaluateLeadSla({
      lead: baseLead(),
      policies: [notYetOverdue, fallback],
      currentStageEnteredAt: NOW,
      businessHours: [],
      holidayDates: new Set(),
      timeZone: "Asia/Kolkata",
      now: NOW,
    });
    expect(result.policyId).toBe("fallback");
    expect(result.breached).toBe(true);
  });
});
