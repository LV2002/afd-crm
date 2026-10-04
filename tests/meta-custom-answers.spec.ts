/**
 * A Meta Lead Ads form asks more than Meta's four standard questions, and
 * for as long as the integration has run the CRM read only those four.
 * AFD's forms ask for the lead's current qualification and the exam they
 * are sitting; both arrived on every lead and neither reached a field.
 *
 * Tested here because every line of the mapper is a rule about where a
 * stranger's typed answer ends up, and some of those rules are the
 * difference between a record and a mess: which question maps to which
 * field, what happens to an answer the CRM has no option for, and which
 * fields an ad form is not allowed to touch at all.
 */
import { describe, expect, it } from "vitest";

import {
  describeCustomAnswerMapping,
  mapMetaCustomAnswers,
  type MappableField,
} from "../src/lib/integrations/meta/map-custom-answers";

const EDUCATION: MappableField = {
  key: "education_status",
  label: "Education Status",
  type: "select",
  isCore: true,
  options: [
    { value: "10th", label: "10th" },
    { value: "11th", label: "11th" },
    { value: "12th", label: "12th" },
    { value: "12th_pass", label: "12th Pass" },
    { value: "diploma", label: "Diploma" },
    { value: "graduate", label: "Graduate" },
  ],
};

const EXAMS: MappableField = {
  key: "interested_exams",
  label: "Interested Exams",
  type: "multiselect",
  isCore: true,
  options: [
    { value: "nid", label: "NID" },
    { value: "nift_ug", label: "NIFT UG" },
    { value: "uceed", label: "UCEED" },
    { value: "nata", label: "NATA" },
  ],
};

const COURSES: MappableField = {
  key: "courses_interested",
  label: "Courses Interested",
  type: "multiselect",
  isCore: true,
  options: [
    { value: "foundation", label: "Foundation" },
    { value: "crash", label: "Crash" },
  ],
};

const EXAM_YEAR: MappableField = {
  key: "exam_year",
  label: "Exam Year",
  type: "text",
  isCore: true,
  options: [],
};

const SCHOOL: MappableField = {
  key: "school_college",
  label: "School / College",
  type: "text",
  isCore: true,
  options: [],
};

const ATTEMPTS: MappableField = {
  key: "previous_attempts",
  label: "Previous Attempts",
  type: "number",
  isCore: true,
  options: [],
};

const COUNSELLOR: MappableField = {
  key: "assigned_to",
  label: "Assigned Counsellor",
  type: "user_ref",
  isCore: true,
  options: [],
};

const STAGE: MappableField = {
  key: "stage_id",
  label: "Stage",
  type: "select",
  isCore: true,
  options: [{ value: "abc", label: "Payment Pending" }],
};

const CATALOG = [EDUCATION, EXAMS, COURSES, EXAM_YEAR, SCHOOL, ATTEMPTS, COUNSELLOR, STAGE];

describe("mapMetaCustomAnswers", () => {
  it("maps the two questions AFD's own forms actually ask", () => {
    const { values, unmapped } = mapMetaCustomAnswers(
      [
        { name: "full_name", values: ["Divya Menon"] },
        { name: "phone_number", values: ["+919037515799"] },
        { name: "what_is_your_current_qualification?", values: ["12th Pass"] },
        { name: "which_exam_are_you_interested_in?", values: ["NIFT UG"] },
      ],
      CATALOG,
    );

    expect(values).toEqual({
      education_status: "12th_pass",
      interested_exams: ["nift_ug"],
    });
    expect(unmapped).toEqual([]);
  });

  it("never re-reads Meta's own standard questions — identity is already resolved from those", () => {
    const { values } = mapMetaCustomAnswers(
      [
        { name: "full_name", values: ["Divya Menon"] },
        { name: "first_name", values: ["Divya"] },
        { name: "last_name", values: ["Menon"] },
        { name: "phone_number", values: ["+919037515799"] },
        { name: "email", values: ["divya@example.com"] },
      ],
      CATALOG,
    );
    expect(values).toEqual({});
  });

  it("matches an answer by the label the lead actually saw, not only the stored value", () => {
    // The option's stored value is `nift_ug`; nobody's ad form says that.
    const { values } = mapMetaCustomAnswers([{ name: "exam", values: ["NIFT UG"] }], CATALOG);
    expect(values).toEqual({ interested_exams: ["nift_ug"] });
  });

  it("splits a comma-separated answer to a multi-choice question", () => {
    const { values } = mapMetaCustomAnswers(
      [{ name: "which_exams", values: ["NID, UCEED"] }],
      CATALOG,
    );
    expect(values).toEqual({ interested_exams: ["nid", "uceed"] });
  });

  it("keeps an answer the CRM has no option for, and says so", () => {
    const mapping = mapMetaCustomAnswers(
      [{ name: "current_qualification", values: ["B.Arch 2nd year"] }],
      CATALOG,
    );

    // Kept as typed. Dropping it would be the only unrecoverable outcome:
    // the lead has gone and the answer is all there is.
    expect(mapping.values).toEqual({ education_status: "B.Arch 2nd year" });
    expect(mapping.mapped[0].unrecognisedChoices).toEqual(["B.Arch 2nd year"]);
    expect(describeCustomAnswerMapping(mapping)).toContain("Settings → Dropdowns");
  });

  it("reports a question no field matches, with the text to match it by", () => {
    const mapping = mapMetaCustomAnswers(
      [{ name: "what_is_your_budget?", values: ["Under 50,000"] }],
      CATALOG,
    );

    expect(mapping.values).toEqual({});
    expect(mapping.unmapped).toEqual([
      { question: "what_is_your_budget?", answer: "Under 50,000" },
    ]);
    const note = describeCustomAnswerMapping(mapping);
    expect(note).toContain("what_is_your_budget?");
    expect(note).toContain("Settings → Fields");
  });

  it("says nothing at all when every question mapped cleanly", () => {
    const mapping = mapMetaCustomAnswers([{ name: "exam", values: ["NID"] }], CATALOG);
    expect(describeCustomAnswerMapping(mapping)).toBeNull();
  });

  it("tells a year question from an exam question", () => {
    // "exam" is a substring of "which_exam_year", so the more specific
    // keyword has to win or every year lands in Interested Exams.
    const { values } = mapMetaCustomAnswers(
      [
        { name: "which_exam_year_are_you_writing?", values: ["2027"] },
        { name: "exam_interested_in", values: ["NATA"] },
      ],
      CATALOG,
    );
    expect(values).toEqual({ exam_year: "2027", interested_exams: ["nata"] });
  });

  it("reads the digits out of a numeric answer rather than refusing it", () => {
    const { values } = mapMetaCustomAnswers(
      [{ name: "how_many_attempts_so_far?", values: ["2 attempts"] }],
      CATALOG,
    );
    expect(values).toEqual({ previous_attempts: 2 });
  });

  it("will not let a form question set ownership or funnel position", () => {
    // A form asking "which counsellor?" or "stage" must not be a shortcut
    // past the assignment rules engine (CLAUDE.md non-negotiable #8) or
    // put a lead at a funnel position that never happened.
    const mapping = mapMetaCustomAnswers(
      [
        { name: "assigned_to", values: ["Athira"] },
        { name: "stage_id", values: ["abc"] },
        { name: "stage", values: ["Payment Pending"] },
      ],
      CATALOG,
    );
    expect(mapping.values).toEqual({});
    expect(mapping.unmapped).toHaveLength(3);
  });

  it("keeps the first of two questions that mean the same field, and reports the second", () => {
    const mapping = mapMetaCustomAnswers(
      [
        { name: "which_course", values: ["Foundation"] },
        { name: "any_other_course", values: ["Crash"] },
      ],
      CATALOG,
    );
    expect(mapping.values).toEqual({ courses_interested: ["foundation"] });
    expect(mapping.unmapped).toEqual([{ question: "any_other_course", answer: "Crash" }]);
  });

  it("ignores a question left blank", () => {
    const mapping = mapMetaCustomAnswers(
      [
        { name: "current_qualification", values: [""] },
        { name: "exam", values: [] },
      ],
      CATALOG,
    );
    expect(mapping.values).toEqual({});
    expect(mapping.unmapped).toEqual([]);
  });

  it("matches a school question by keyword", () => {
    const { values } = mapMetaCustomAnswers(
      [{ name: "which_school_are_you_studying_in?", values: ["Rajagiri"] }],
      CATALOG,
    );
    // "school" and "studying" both appear. The first word of a question
    // is what it is about, so this is a school question, not an
    // education-level one.
    expect(values).toEqual({ school_college: "Rajagiri" });
  });
});
