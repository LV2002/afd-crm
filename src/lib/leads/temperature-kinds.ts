/**
 * What a temperature MEANS, as opposed to what it is called.
 *
 * ## Why this file exists
 *
 * Stage and temperature used to be two columns: where a lead was in the
 * funnel, and how warm they were. Leon collapsed them into one — "I don't
 * want stages anymore, instead lets keep it as only temperature" — which
 * reverses CLAUDE.md's old non-negotiable #1. The single status is
 * `leads.temperature`, drawn from the admin-editable `temperature`
 * dropdown, and it now has to carry the behaviour the stage's `stage_type`
 * carried: is this lead still being worked, has it been won, has it been
 * lost, is it parked for later.
 *
 * Behaviour matched on a **label** is behaviour that breaks the day an
 * admin renames "Joined competitor" to "Went elsewhere". So it matches on
 * a **kind**, stored on the option as `dropdown_options.metadata.kind`,
 * exactly as the stage rules matched on `stage_type` rather than on the
 * stage's name. Rename, recolour, reorder: nothing here notices. That is
 * the "could this be deployed for a different company by changing only
 * database contents" test from CLAUDE.md, applied.
 *
 * ## The five kinds
 *
 * - `new`     — nobody has spoken to them yet. Where every lead starts.
 * - `open`    — being worked. Contacted, Cold, Warm, Hot.
 * - `won`     — took admission. Reachable ONLY through confirming an
 *               admission, and enforced in the database (migration 0099),
 *               not here: this file describes, the trigger refuses.
 * - `parked`  — not now, maybe later. Still has a follow-up date, so it
 *               stays in the queue; it is just not forecast as likely.
 * - `lost`    — will not be an admission. Negative, wrong target, an
 *               existing AFD student, gone to a competitor. Lead work stops.
 *
 * Pure on purpose — no database, no `server-only` — so the dashboard,
 * the forecast, the queue and the tests can all share the one definition
 * of "no longer worked" instead of each re-deriving it from a stage list.
 */

export const TEMPERATURE_KINDS = ["new", "open", "won", "lost", "parked"] as const;
export type TemperatureKind = (typeof TEMPERATURE_KINDS)[number];

/** Where the kind lives on a `dropdown_options` row. Named once for the migration, UI and code. */
export const KIND_METADATA_KEY = "kind";

export const KIND_LABELS: Record<TemperatureKind, string> = {
  new: "Not yet contacted",
  open: "Being worked",
  won: "Took admission",
  parked: "Parked for later",
  lost: "Closed — not joining",
};

/**
 * One-line explanations for the settings screen, so an admin choosing a
 * kind is told what it will DO rather than left to guess from the name.
 */
export const KIND_HELP: Record<TemperatureKind, string> = {
  new: "The starting point for a fresh lead. Moves on by itself the first time someone is spoken to.",
  open: "Actively being chased. Counts in the queue, the SLA sweep and the forecast.",
  won: "Joined. Can only be reached by confirming an admission with course, batch and fee — never by hand.",
  parked: "Not now, maybe later. Stays in the queue for its follow-up date but is left out of the forecast.",
  lost: "Will not be joining. Lead work stops: out of the queue, out of the SLA sweep, out of the forecast.",
};

export function isTemperatureKind(value: unknown): value is TemperatureKind {
  return typeof value === "string" && (TEMPERATURE_KINDS as readonly string[]).includes(value);
}

/**
 * One temperature as the application sees it: the dropdown row with its
 * metadata unpacked into typed fields, so nothing downstream reads loose
 * JSON.
 */
export interface TemperatureOption {
  value: string;
  label: string;
  color: string | null;
  kind: TemperatureKind;
  /** Display order, lowest first. */
  rank: number;
  /** 0–100, or null when the admin has not set one. Weights the forecast. */
  probability: number | null;
  /** A closing outcome that must say why — see `lost_reason`. */
  requiresReason: boolean;
  /** Counts toward the dashboard's "Interested" figure. */
  interested: boolean;
  isActive: boolean;
}

interface OptionRow {
  value: string;
  label: string;
  color?: string | null;
  sort_order?: number | null;
  is_active?: boolean | null;
  metadata?: unknown;
}

function asRecord(metadata: unknown): Record<string, unknown> {
  return metadata && typeof metadata === "object" ? (metadata as Record<string, unknown>) : {};
}

/**
 * A kind the row does not carry — a temperature an admin added by hand in
 * the generic dropdown editor, before this concept existed — is `open`.
 * That is the behaviour a plain temperature always had: worked, queued,
 * swept, forecast. Defaulting to anything stronger (`lost`, `won`) would
 * make an innocent new option silently stop the chasing, or silently
 * trip the admission gate.
 */
export function kindOf(metadata: unknown): TemperatureKind {
  const raw = asRecord(metadata)[KIND_METADATA_KEY];
  return isTemperatureKind(raw) ? raw : "open";
}

function probabilityOf(metadata: unknown): number | null {
  const raw = asRecord(metadata).probability;
  const n = typeof raw === "number" ? raw : typeof raw === "string" && raw.trim() !== "" ? Number(raw) : NaN;
  if (!Number.isFinite(n)) return null;
  // A percentage. 120 typed by mistake means "very likely", not "one and
  // a fifth admissions per lead" — see stageProbability() in forecast.ts,
  // which made the same call for the same reason.
  return Math.min(100, Math.max(0, n));
}

export function toTemperatureOption(row: OptionRow): TemperatureOption {
  const meta = asRecord(row.metadata);
  // `sort_order` is the order the admin sees and moves in Settings; the
  // seed's `metadata.rank` is only the starting point it was copied from.
  // Reading the stale one would make "move up" change the settings list
  // and nothing else.
  const rank = row.sort_order ?? (typeof meta.rank === "number" ? meta.rank : 0);
  return {
    value: row.value,
    label: row.label,
    color: row.color ?? null,
    kind: kindOf(row.metadata),
    rank,
    probability: probabilityOf(row.metadata),
    requiresReason: meta.requires_reason === true,
    interested: meta.interested === true,
    isActive: row.is_active !== false,
  };
}

/** Lowest rank first; the dropdown order everything displays in. */
export function sortTemperatures<T extends { rank: number; label: string }>(options: readonly T[]): T[] {
  return [...options].sort((a, b) => a.rank - b.rank || a.label.localeCompare(b.label));
}

/**
 * Has anybody stopped working this lead? Won or lost — the two kinds that
 * mean the funnel is finished with them.
 *
 * This replaces `isNoLongerWorked()` (a terminal stage OR the Dead
 * temperature). Those were two mechanisms for one idea because stage and
 * temperature were two columns; with one status there is one test.
 */
export function isTerminalKind(kind: TemperatureKind | undefined): boolean {
  return kind === "won" || kind === "lost";
}

/**
 * Not counted toward the forecast: the admission is already an admission,
 * or it is not coming, or it is parked. Same three closed types the
 * forecast excluded when they were stages.
 */
export function isClosedKind(kind: TemperatureKind | undefined): boolean {
  return kind === "won" || kind === "lost" || kind === "parked";
}

/** value → option, for the callers that look many leads up. */
export function indexByValue(options: readonly TemperatureOption[]): Map<string, TemperatureOption> {
  return new Map(options.map((option) => [option.value, option]));
}

/**
 * The set of temperature VALUES whose kind is terminal. The shape every
 * "skip the finished leads" loop wants — a Set lookup per lead, built
 * once per run, not a query per lead.
 */
export function terminalValuesOf(options: readonly TemperatureOption[]): Set<string> {
  return new Set(options.filter((option) => isTerminalKind(option.kind)).map((option) => option.value));
}

export function valuesOfKinds(
  options: readonly TemperatureOption[],
  kinds: readonly TemperatureKind[],
): string[] {
  return options.filter((option) => kinds.includes(option.kind)).map((option) => option.value);
}

/**
 * Is this lead no longer being worked?
 *
 * A lead with NO temperature is still being worked: an unset status is an
 * unclassified lead, and it must show up in the queue so that somebody
 * classifies it — not vanish from it.
 */
export function isNoLongerWorked(
  temperature: string | null | undefined,
  terminalValues: ReadonlySet<string>,
): boolean {
  return temperature != null && terminalValues.has(temperature);
}

/**
 * The status a brand-new lead starts on: the lowest-ranked option of kind
 * `new`. Null when an admin has deleted every one — then the lead starts
 * with no status, which is coherent, and the queue still shows it.
 */
export function initialTemperature(options: readonly TemperatureOption[]): TemperatureOption | null {
  return sortTemperatures(options.filter((o) => o.kind === "new" && o.isActive))[0] ?? null;
}

/**
 * Where a lead goes the first time anybody speaks to it: the
 * lowest-ranked option of kind `open` — "Contacted" in the shipped set.
 */
export function firstContactTemperature(options: readonly TemperatureOption[]): TemperatureOption | null {
  return sortTemperatures(options.filter((o) => o.kind === "open" && o.isActive))[0] ?? null;
}
