import { describe, expect, it } from "vitest";

import type { leads, temperatureRules } from "../src/lib/db/schema";
import { evaluateLeadTemperature } from "../src/lib/temperature/evaluate-temperature";

type Lead = typeof leads.$inferSelect;
type TemperatureRuleRow = typeof temperatureRules.$inferSelect;

/** Same shape/purpose as the other evaluator specs' baseLead(). */
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
    slaEscalatedAtHours: null,
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
    profileFormToken: null,
    profileFormSentAt: null,
    profileFormSubmittedAt: null,
    profileFormData: null,
    ...overrides,
  };
}

function baseRule(overrides: Partial<TemperatureRuleRow> = {}): TemperatureRuleRow {
  return {
    id: "rule-1",
    temperatureValue: "warm",
    priority: 0,
    conditions: {},
    isActive: true,
    createdAt: new Date(),
    updatedAt: null,
    deletedAt: null,
    ...overrides,
  };
}

describe("evaluateLeadTemperature", () => {
  it("no rules -> no change", () => {
    const result = evaluateLeadTemperature(baseLead(), []);
    expect(result).toEqual({ ruleId: null, temperatureValue: null });
  });

  it("a rule with no conditions matches everything (deliberate catch-all)", () => {
    const rule = baseRule({ conditions: {}, temperatureValue: "cold" });
    const result = evaluateLeadTemperature(baseLead(), [rule]);
    expect(result).toEqual({ ruleId: "rule-1", temperatureValue: "cold" });
  });

  it("a rule whose conditions don't match leaves the lead unchanged", () => {
    const rule = baseRule({
      conditions: { all: [{ field: "district", op: "equals", value: "Kannur" }] },
    });
    const result = evaluateLeadTemperature(baseLead({ district: "Kochi" }), [rule]);
    expect(result).toEqual({ ruleId: null, temperatureValue: null });
  });

  it("highest priority number wins, same convention as sla_policies", () => {
    const lead = baseLead({ lastTouchSource: "Referral" });
    const specific = baseRule({
      id: "specific",
      priority: 10,
      conditions: { all: [{ field: "source", op: "equals", value: "Referral" }] },
      temperatureValue: "hot",
    });
    const catchAll = baseRule({ id: "catch-all", priority: 0, conditions: {}, temperatureValue: "warm" });
    const result = evaluateLeadTemperature(lead, [catchAll, specific]); // deliberately out of order
    expect(result).toEqual({ ruleId: "specific", temperatureValue: "hot" });
  });

  it("falls through to a lower-priority rule when the top one doesn't match", () => {
    const lead = baseLead({ district: "Kochi" });
    const topButNoMatch = baseRule({
      id: "top",
      priority: 10,
      conditions: { all: [{ field: "district", op: "equals", value: "Kannur" }] },
      temperatureValue: "hot",
    });
    const fallback = baseRule({ id: "fallback", priority: 0, conditions: {}, temperatureValue: "cold" });
    const result = evaluateLeadTemperature(lead, [topButNoMatch, fallback]);
    expect(result).toEqual({ ruleId: "fallback", temperatureValue: "cold" });
  });
});
