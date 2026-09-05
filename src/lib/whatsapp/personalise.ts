/**
 * Turning a template's `{{1}}`, `{{2}}` … into the words one particular
 * person receives.
 *
 * Before this, a broadcast carried a single `body_param` used for every
 * recipient, so "Hi {{1}}" greeted four hundred people with the same
 * word. Each placeholder now has a SOURCE: either a fixed piece of text
 * (the old behaviour, still the right answer for "NIFT 2027 batch") or a
 * merge variable resolved from the recipient's own record.
 *
 * Pure, and tested, because two of the failure modes are expensive:
 *
 *  - **A blank value.** Meta rejects a template parameter that is empty,
 *    and rejects it per message — so one lead with no course on file does
 *    not spoil the send, it just fails that one person with an error
 *    nobody reads. Hence a mandatory fallback per variable, and
 *    `resolveParams` reporting what it could not fill rather than
 *    quietly sending a hole.
 *  - **A value Meta will not accept.** A newline, a tab or five spaces in
 *    a row inside a parameter is rejected outright (error 132000). A
 *    counsellor pasting a name out of a spreadsheet produces exactly
 *    that, so every value is squeezed flat on the way through.
 */

/** Meta's own cap on one body parameter. Longer than any name or course; short enough to notice. */
export const MAX_PARAM_LENGTH = 1024;

export type ParamSource =
  | { kind: "text"; value: string }
  | { kind: "variable"; key: string; fallback: string };

/**
 * Flattens a value into something Meta will accept inside a template
 * parameter: no newlines, no tabs, no runs of whitespace, trimmed, and
 * cut to length. Returns "" for a value that was only whitespace, which
 * the caller treats as missing.
 */
export function sanitiseParam(value: string): string {
  return value
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim()
    .slice(0, MAX_PARAM_LENGTH);
}

/** Honorifics carry no information in a greeting and read oddly after "Hi". */
const HONORIFICS = new Set(["mr", "mrs", "ms", "miss", "dr", "prof", "sri", "smt", "shri"]);

/**
 * "Anjali Menon" → "Anjali". The whole point of the feature.
 *
 * Two deliberate rules beyond taking the first word. An honorific is
 * skipped, so "Dr. Rajesh Nair" greets Rajesh rather than Dr. And a name
 * recorded in block capitals — which is most of what a walk-in register
 * produces — is title-cased, because "Hi ANJALI" reads as shouting. A
 * name with any lower-case letter in it is left exactly as typed: real
 * names are full of capitals that belong where they are, and second-
 * guessing them is how you end up greeting "Mcdonald".
 */
export function firstName(fullName: string): string {
  const cleaned = sanitiseParam(fullName);
  if (!cleaned) return "";

  const words = cleaned.split(" ").filter(Boolean);
  const first = words.find((word) => !HONORIFICS.has(word.replace(/\./g, "").toLowerCase()));
  if (!first) return "";

  const withoutTrailingDot = first.replace(/\.$/, "");
  if (withoutTrailingDot !== withoutTrailingDot.toUpperCase()) return withoutTrailingDot;
  return withoutTrailingDot.charAt(0) + withoutTrailingDot.slice(1).toLowerCase();
}

export interface ResolvedParams {
  /** One string per placeholder, in order. Safe to send only when `missing` is empty. */
  params: string[];
  /** 1-based placeholder numbers that came out blank with no usable fallback. */
  missing: number[];
}

/**
 * Fills a template's placeholders for one recipient.
 *
 * `values` is that person's merge variables, already resolved (see
 * `merge-values.ts`). A variable that is absent, null or blank falls back
 * to the fallback the composer typed; a fallback that is itself blank
 * leaves the placeholder in `missing`, and the caller fails that one
 * recipient with a reason rather than sending "Hi ,".
 */
export function resolveParams(
  sources: ParamSource[],
  values: Record<string, string | null | undefined>,
): ResolvedParams {
  const params: string[] = [];
  const missing: number[] = [];

  sources.forEach((source, index) => {
    const raw = source.kind === "text" ? source.value : (values[source.key] ?? "");
    let filled = sanitiseParam(String(raw ?? ""));
    if (!filled && source.kind === "variable") filled = sanitiseParam(source.fallback);
    if (!filled) missing.push(index + 1);
    params.push(filled);
  });

  return { params, missing };
}

/**
 * Reads the sources back off a jsonb column.
 *
 * Tolerant on purpose: this runs in the send path, and a row written by
 * an older version of the composer — or by hand — must degrade to "no
 * personalisation" rather than throw and take the whole batch down.
 * Anything unrecognisable is dropped, not guessed at.
 */
export function parseParamSources(raw: unknown): ParamSource[] {
  if (!Array.isArray(raw)) return [];

  const sources: ParamSource[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const record = entry as Record<string, unknown>;

    if (record.kind === "text") {
      sources.push({
        kind: "text",
        value: typeof record.value === "string" ? record.value : "",
      });
    } else if (record.kind === "variable" && typeof record.key === "string" && record.key) {
      sources.push({
        kind: "variable",
        key: record.key,
        fallback: typeof record.fallback === "string" ? record.fallback : "",
      });
    }
  }
  return sources;
}

/**
 * The template body with its placeholders filled in — what the composer
 * shows as a preview, and the only chance anybody gets to read the
 * message before four hundred copies of it leave.
 *
 * A placeholder with no source keeps its `{{n}}` visible rather than
 * disappearing, so a template asking for three values and given two looks
 * obviously unfinished instead of subtly wrong.
 */
export function fillTemplateBody(body: string, params: string[]): string {
  return body.replace(/\{\{(\d+)\}\}/g, (match, digits: string) => {
    const value = params[Number(digits) - 1];
    return value ? value : match;
  });
}

/** How a source reads in the composer's summary line, e.g. `First name (or "there")`. */
export function describeSource(source: ParamSource, label?: string): string {
  if (source.kind === "text") return source.value.trim() || "(blank)";
  const name = label ?? source.key;
  return source.fallback.trim() ? `${name} (or "${source.fallback.trim()}")` : name;
}
