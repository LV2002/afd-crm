/**
 * Saying an audit row in English.
 *
 * Actions are written as `subject.verb` strings by roughly forty call
 * sites — `lead.reveal_phone`, `payment.reversal`, `user.reset_password`.
 * That is a good shape for a log and a poor one for a person reading down
 * a page at speed looking for the thing that went wrong.
 *
 * Deliberately mechanical rather than a lookup table of every action:
 * a new call site should not need an entry here to read properly, and a
 * table that has to be kept in sync with forty places would drift within
 * a month. Only the verbs whose plain-English form is irregular are
 * listed; everything else is unsnaked and given "-ed" by the caller's own
 * wording.
 */

const VERBS: Record<string, string> = {
  create: "created",
  update: "updated",
  delete: "deleted",
  set: "set",
  record: "recorded",
  assign: "assigned",
  merge: "merged",
  import: "imported",
  export: "exported",
  view: "viewed",
  query: "queried",
  upload: "uploaded",
  remove: "removed",
  reorder: "reordered",
  transfer: "transferred",
  reversal: "reversed",
  correction: "corrected",
  activate: "turned on",
  deactivate: "turned off",
  reveal_phone: "revealed the phone number of",
  reset_password: "reset the password of",
  stage_change: "moved a stage on",
  update_permissions: "changed the permissions of",
  tag_add: "tagged",
  tag_remove: "untagged",
  fee_plan: "set the fee plan on",
  person_history: "looked up the history of",
  message_send: "sent a message on",
  merge_rejected: "rejected a merge on",
  suppression_add: "added a suppression on",
  suppression_release: "released a suppression on",
  student_added: "added a student to",
  student_removed: "removed a student from",
  broadcast_create: "created a broadcast on",
  broadcast_cancel: "cancelled a broadcast on",
  template_create: "created a template on",
  template_delete: "deleted a template on",
  credentials_update: "updated the credentials for",
  profile_form_link_created: "created a profile form link for",
};

/**
 * Noun phrases, article included, for the subjects whose plain form reads
 * wrong with a bare "a" in front of it — the uncountable ones ("the
 * organisation settings"), the proper nouns ("WhatsApp") and the
 * initialisms that take "an" despite starting with a consonant letter
 * ("an SLA policy"). Everything else gets a/an by first letter.
 */
const SUBJECT_PHRASES: Record<string, string> = {
  ai: "the AI analyst",
  config: "the configuration",
  org_settings: "the organisation settings",
  terminology: "the terminology",
  business_hours: "the business hours",
  whatsapp: "WhatsApp",
  sla_policy: "an SLA policy",
  // "an user" — the first-letter rule is about sound, and "user" starts
  // with a consonant one.
  user: "a user",
};

export interface DescribedAction {
  /** "Revealed the phone number of a lead" — sentence case, no full stop. */
  sentence: string;
  /** The `subject` half, for grouping and filtering: "lead", "payment". */
  subject: string;
  verb: string;
}

export function describeAuditAction(action: string): DescribedAction {
  const dot = action.indexOf(".");
  const subject = dot === -1 ? action : action.slice(0, dot);
  const verb = dot === -1 ? "" : action.slice(dot + 1);

  const phrase = SUBJECT_PHRASES[subject] ?? withArticle(unsnake(subject));
  const verbWords = VERBS[verb] ?? unsnake(verb);

  if (!verb) return { sentence: capitalise(unsnake(subject)), subject, verb };

  // "Revealed the phone number of a lead" reads better than "Lead
  // reveal_phone", and puts the thing that happened first — which is what
  // somebody scanning the column is actually looking for.
  return { sentence: capitalise(`${verbWords} ${phrase}`), subject, verb };
}

function withArticle(words: string): string {
  return `${/^[aeiou]/i.test(words) ? "an" : "a"} ${words}`;
}

/** The label for the entity-type filter: "assignment_rules" → "Assignment rules". */
export function describeEntityType(entityType: string): string {
  return capitalise(unsnake(entityType));
}

function unsnake(value: string): string {
  return value.replace(/_/g, " ");
}

function capitalise(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/**
 * Where an audit row's entity actually lives, so a row about a lead is one
 * click from the lead. Only for tables with a page of their own — the rest
 * show the id and no link, which is honest about there being nowhere to go.
 */
const ENTITY_HREFS: Record<string, (id: string) => string> = {
  leads: (id) => `/leads/${id}`,
  students: (id) => `/students/${id}`,
  profiles: (id) => `/settings/users/${id}`,
  centers: () => "/settings/centers",
  roles: () => "/settings/roles",
  assignment_rules: (id) => `/settings/rules/${id}`,
  pipeline_stages: () => "/settings/pipeline-stages",
  dropdown_options: () => "/settings/dropdowns",
  field_definitions: () => "/settings/fields",
  fee_structures: () => "/settings/fee-structures",
  sla_policies: () => "/settings/sla",
  temperature_rules: () => "/settings/temperatures",
  org_settings: () => "/settings/organization",
  batches: (id) => `/batches/${id}`,
};

export function auditEntityHref(entityType: string, entityId: string | null): string | null {
  const build = ENTITY_HREFS[entityType];
  if (!build || !entityId) return null;
  return build(entityId);
}

/**
 * The `before`/`after` payloads, flattened to lines a person can read.
 *
 * Call sites store wildly different shapes — a couple of scalars, a whole
 * form, an array of ids — so this renders one line per top-level key and
 * stringifies anything nested rather than pretending to understand it.
 */
export function auditPayloadLines(payload: unknown): Array<{ key: string; value: string }> {
  if (payload === null || payload === undefined) return [];
  if (typeof payload !== "object" || Array.isArray(payload)) {
    return [{ key: "value", value: stringify(payload) }];
  }
  return Object.entries(payload as Record<string, unknown>).map(([key, value]) => ({
    key: unsnake(key),
    value: stringify(value),
  }));
}

function stringify(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string") return value === "" ? "(blank)" : value;
  if (typeof value === "boolean") return value ? "yes" : "no";
  if (Array.isArray(value)) return value.length === 0 ? "(none)" : value.map(stringify).join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}
