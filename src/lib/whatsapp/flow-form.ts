import { ASK_FIELDS, validateAnswer, type AskField } from "./flow-engine";

/**
 * Native WhatsApp forms (Meta "Flows"): the JSON is GENERATED from a list of
 * lead fields, never written by hand. A form can only ask for things this
 * system knows how to check and file — the same fixed list a "ask a question"
 * automation step uses.
 */

/** What Meta lets a text input be, per field. */
const INPUT_TYPE: Record<AskField, "text" | "email" | "number"> = {
  email: "email",
  city: "text",
  district: "text",
  state: "text",
  exam_year: "number",
  school_college: "text",
  board: "text",
  father_name: "text",
  mother_name: "text",
  education_status: "text",
};

/** A label on a Flow input is capped at 20 characters. */
const SHORT_LABEL: Record<AskField, string> = {
  email: "Email address",
  city: "City",
  district: "District",
  state: "State",
  exam_year: "Exam year",
  school_college: "School or college",
  board: "Board",
  father_name: "Father's name",
  mother_name: "Mother's name",
  education_status: "Class / course",
};

export const MAX_FORM_FIELDS = 8;
export const FORM_SCREEN_ID = "DETAILS";
export const FLOW_JSON_VERSION = "6.2";

export function isFormFieldList(value: unknown): value is AskField[] {
  return Array.isArray(value) && value.length > 0 && value.every((v) => typeof v === "string" && v in ASK_FIELDS);
}

export function buildFlowJson(input: { title: string; fields: AskField[]; submitLabel: string }): Record<string, unknown> {
  const fields = input.fields.slice(0, MAX_FORM_FIELDS);
  return {
    version: FLOW_JSON_VERSION,
    screens: [
      {
        id: FORM_SCREEN_ID,
        title: input.title.slice(0, 30),
        terminal: true,
        success: true,
        layout: {
          type: "SingleColumnLayout",
          children: [
            {
              type: "Form",
              name: "form",
              children: [
                ...fields.map((field) => ({
                  type: "TextInput",
                  name: field,
                  label: SHORT_LABEL[field],
                  "input-type": INPUT_TYPE[field],
                  required: true,
                })),
                {
                  type: "Footer",
                  label: input.submitLabel.slice(0, 35),
                  "on-click-action": {
                    name: "complete",
                    payload: Object.fromEntries(fields.map((field) => [field, `\${form.${field}}`])),
                  },
                },
              ],
            },
          ],
        },
      },
    ],
  };
}

/**
 * The answers worth filing from a submitted form: only fields this system
 * asks for, each checked like a typed answer. Anything else in the payload
 * (Meta's own `flow_token`, anything unexpected) is dropped, and answers
 * that fail their check are reported rather than written.
 */
export function cleanFormAnswers(raw: Record<string, unknown>): {
  values: Partial<Record<AskField, string>>;
  rejected: string[];
} {
  const values: Partial<Record<AskField, string>> = {};
  const rejected: string[] = [];
  for (const [key, value] of Object.entries(raw)) {
    if (!(key in ASK_FIELDS)) continue;
    const checked = validateAnswer(key as AskField, String(value ?? ""));
    if (checked.ok) values[key as AskField] = checked.value;
    else rejected.push(key);
  }
  return { values, rejected };
}
