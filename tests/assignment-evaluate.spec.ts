import { describe, expect, it } from "vitest";

import { evaluateConditions } from "../src/lib/assignment/evaluate-conditions";
import type { leads } from "../src/lib/db/schema";

type Lead = typeof leads.$inferSelect;

/** A minimal, fully-typed lead row for exercising the evaluator without a database. */
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
    createdAt: new Date(),
    updatedAt: null,
    deletedAt: null,
    ...overrides,
  };
}

describe("evaluateConditions", () => {
  it("an empty/missing conditions.all matches everything (deliberate catch-all)", () => {
    expect(evaluateConditions({}, baseLead())).toBe(true);
    expect(evaluateConditions({ all: [] }, baseLead())).toBe(true);
  });

  it("equals / not_equals", () => {
    const lead = baseLead({ district: "Kannur" });
    expect(evaluateConditions({ all: [{ field: "district", op: "equals", value: "Kannur" }] }, lead)).toBe(
      true,
    );
    expect(
      evaluateConditions({ all: [{ field: "district", op: "equals", value: "Kochi" }] }, lead),
    ).toBe(false);
    expect(
      evaluateConditions({ all: [{ field: "district", op: "not_equals", value: "Kochi" }] }, lead),
    ).toBe(true);
  });

  it("in / not_in", () => {
    const lead = baseLead({ district: "Kannur" });
    expect(
      evaluateConditions(
        { all: [{ field: "district", op: "in", value: ["Kannur", "Kasaragod"] }] },
        lead,
      ),
    ).toBe(true);
    expect(
      evaluateConditions({ all: [{ field: "district", op: "in", value: ["Kochi"] }] }, lead),
    ).toBe(false);
    expect(
      evaluateConditions({ all: [{ field: "district", op: "not_in", value: ["Kochi"] }] }, lead),
    ).toBe(true);
  });

  it("contains: array field membership and substring on a string field", () => {
    const lead = baseLead({ interestedExams: ["NID", "UCEED"], city: "Thalassery Town" });
    expect(
      evaluateConditions({ all: [{ field: "interested_exams", op: "contains", value: "NID" }] }, lead),
    ).toBe(true);
    expect(
      evaluateConditions({ all: [{ field: "interested_exams", op: "contains", value: "NATA" }] }, lead),
    ).toBe(false);
    expect(evaluateConditions({ all: [{ field: "city", op: "contains", value: "lassery" }] }, lead)).toBe(
      true,
    );
  });

  it("is_empty / is_not_empty, including empty arrays", () => {
    const empty = baseLead({ district: null, interestedExams: [] });
    const filled = baseLead({ district: "Kannur", interestedExams: ["NID"] });
    expect(evaluateConditions({ all: [{ field: "district", op: "is_empty" }] }, empty)).toBe(true);
    expect(
      evaluateConditions({ all: [{ field: "interested_exams", op: "is_empty" }] }, empty),
    ).toBe(true);
    expect(evaluateConditions({ all: [{ field: "district", op: "is_not_empty" }] }, filled)).toBe(true);
    expect(evaluateConditions({ all: [{ field: "district", op: "is_empty" }] }, filled)).toBe(false);
  });

  it("gt / lt / between on a numeric-ish text field", () => {
    const lead = baseLead({ examYear: "2027" });
    expect(evaluateConditions({ all: [{ field: "exam_year", op: "gt", value: 2026 }] }, lead)).toBe(true);
    expect(evaluateConditions({ all: [{ field: "exam_year", op: "lt", value: 2026 }] }, lead)).toBe(false);
    expect(
      evaluateConditions({ all: [{ field: "exam_year", op: "between", value: [2026, 2028] }] }, lead),
    ).toBe(true);
    expect(
      evaluateConditions({ all: [{ field: "exam_year", op: "between", value: [2028, 2030] }] }, lead),
    ).toBe(false);
  });

  it("all predicates must match (AND semantics) — the doc example", () => {
    const matching = baseLead({ district: "Kannur", lastTouchSource: "Meta", examYear: "2027" });
    const missingOne = baseLead({ district: "Kannur", lastTouchSource: "Meta", examYear: "2026" });
    const conditions = {
      all: [
        { field: "district" as const, op: "in" as const, value: ["Kannur", "Kasaragod"] },
        { field: "source" as const, op: "equals" as const, value: "Meta" },
        { field: "exam_year" as const, op: "equals" as const, value: "2027" },
      ],
    };
    expect(evaluateConditions(conditions, matching)).toBe(true);
    expect(evaluateConditions(conditions, missingOne)).toBe(false);
  });

  it("throws on an unwhitelisted field rather than falling back to raw SQL-style access", () => {
    expect(() =>
      // @ts-expect-error -- deliberately an unwhitelisted field to prove the guard
      evaluateConditions({ all: [{ field: "primary_phone", op: "equals", value: "x" }] }, baseLead()),
    ).toThrow(/unknown field/);
  });
});
