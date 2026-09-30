export const FIELD_ENTITIES = ["lead", "student", "enrolment"] as const;

export const FIELD_TYPES = [
  "text",
  "long_text",
  "number",
  "currency",
  "date",
  "datetime",
  "boolean",
  "select",
  "multiselect",
  "phone",
  "email",
  "url",
  "file",
  "user_ref",
  "lead_ref",
] as const;

export type FieldTypeName = (typeof FIELD_TYPES)[number];

/**
 * What each type is, in the words of somebody adding a question.
 *
 * The picker used to show the raw enum — `long_text`, `url`, `file`,
 * `user_ref` — and that is how a question meaning "upload a photo of your
 * ID" got created as `url`: "url" is a plausible-looking guess if nothing
 * says that "file" is the one where the student attaches something. The
 * hint is searchable in the combobox, so typing "photo" or "upload" finds
 * the right row whatever it happens to be called.
 */
export const FIELD_TYPE_LABELS: Record<FieldTypeName, { label: string; hint: string }> = {
  text: { label: "Short text", hint: "A line of writing — a name, a school, a remark." },
  long_text: { label: "Paragraph", hint: "Several lines. A bigger box to type in." },
  number: { label: "Number", hint: "A count or a score. Adds up and sorts numerically." },
  currency: { label: "Money", hint: "An amount in rupees. Shows as ₹45,000 everywhere." },
  date: { label: "Date", hint: "A day, picked from a calendar." },
  datetime: { label: "Date and time", hint: "A day and a clock time." },
  boolean: { label: "Yes or no", hint: "A tickbox. Ticked or not." },
  select: { label: "Dropdown — pick one", hint: "You write the choices; they pick one." },
  multiselect: {
    label: "Dropdown — pick several",
    hint: "You write the choices; they can tick more than one.",
  },
  phone: { label: "Phone number", hint: "Saved as +91…, and masked in every list." },
  email: { label: "Email address", hint: "Checked for an @ before it saves." },
  url: {
    label: "Web address",
    hint: "A link they type or paste — an Instagram profile, a portfolio. NOT for uploading a file.",
  },
  file: {
    label: "File upload",
    hint: "They attach a photo or a PDF — an ID proof, a photograph, a marksheet. Stored with the lead's documents.",
  },
  user_ref: { label: "A member of staff", hint: "Pick somebody from your own user list." },
  lead_ref: { label: "Another lead", hint: "Points at a different person in the CRM." },
};

/** The picker's rows, in the order above. */
export const FIELD_TYPE_OPTIONS = FIELD_TYPES.map((type) => ({
  value: type,
  label: FIELD_TYPE_LABELS[type].label,
  hint: FIELD_TYPE_LABELS[type].hint,
}));
