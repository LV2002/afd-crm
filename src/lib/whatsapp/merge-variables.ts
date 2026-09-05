/**
 * The things a broadcast can say about the person receiving it.
 *
 * Until now a template's `{{1}}` took ONE value for the whole send, so a
 * "Hi {{1}}" template greeted four hundred people identically and the
 * feature was, in practice, unusable for anything personal. Leon's ask
 * was simply "Hi Anjali".
 *
 * This is a FIXED catalogue in code rather than an admin-editable list,
 * and deliberately so — it belongs with the AI's tools, the notification
 * events and the permission primitives on CLAUDE.md's short "fixed in
 * code" list. Each variable is a thing the system knows how to *compute*:
 * `amount_due` is an allocation across an instalment schedule, not a
 * column somebody could point at. You cannot invent a resolver at
 * runtime, so pretending the list is configuration would be a lie.
 *
 * What IS configuration is the audience, the template and the wording —
 * all three already are.
 *
 * Pure: no database, no `server-only`. `merge-values.ts` does the
 * fetching, this file only says what exists.
 */

/** Leads and students are different tables and different people; a variable says which it can speak about. */
export type MergeEntity = "lead" | "student";

export interface MergeVariable {
  key: string;
  label: string;
  /** Which audiences this can be used with. A student has no counsellor; a lead has no batch. */
  entities: readonly MergeEntity[];
  /** Shown in the composer so somebody can see the shape of the value before sending anything. */
  example: string;
  /** Why it might come out blank, when that is worth saying out loud. */
  note?: string;
}

/**
 * Ordered the way somebody composing a message reaches for them: who they
 * are, then what they are doing with us, then what they owe.
 */
export const MERGE_VARIABLES: readonly MergeVariable[] = [
  {
    key: "first_name",
    label: "First name",
    entities: ["lead", "student"],
    example: "Anjali",
    note: "The first word of the name on the record, without Mr/Ms/Dr.",
  },
  {
    key: "full_name",
    label: "Full name",
    entities: ["lead", "student"],
    example: "Anjali Menon",
  },
  {
    key: "course",
    label: "Course",
    entities: ["lead", "student"],
    example: "Foundation",
    note: "For leads this is the course they enquired about, which may be blank.",
  },
  {
    key: "center_name",
    label: "Centre",
    entities: ["lead", "student"],
    example: "Kochi",
  },
  {
    key: "counsellor_name",
    label: "Their counsellor",
    entities: ["lead"],
    example: "Athira",
    note: "Blank for an unassigned lead.",
  },
  {
    key: "batch_name",
    label: "Batch",
    entities: ["student"],
    example: "NIFT Morning 2026",
    note: "Blank until they are put into one.",
  },
  {
    key: "amount_due",
    label: "Amount still due",
    entities: ["lead", "student"],
    example: "₹45,000",
    note: "Everything unpaid on their admission. Blank if they have no admission or owe nothing.",
  },
  {
    key: "next_due_date",
    label: "Next instalment date",
    entities: ["lead", "student"],
    example: "12 Oct 2026",
    note: "The earliest instalment they still owe on.",
  },
] as const;

export function mergeVariablesFor(entity: MergeEntity): MergeVariable[] {
  return MERGE_VARIABLES.filter((variable) => variable.entities.includes(entity));
}

export function findMergeVariable(key: string): MergeVariable | undefined {
  return MERGE_VARIABLES.find((variable) => variable.key === key);
}

/**
 * Whether a key is one this system can actually fill for that audience.
 *
 * Checked on the way IN (the create action) rather than only on the way
 * out, because a variable that does not resolve is not a blank word in a
 * message — it is four hundred messages that all say the fallback, which
 * nobody notices until a customer replies asking who "there" is.
 */
export function isUsableVariable(key: string, entity: MergeEntity): boolean {
  return mergeVariablesFor(entity).some((variable) => variable.key === key);
}
