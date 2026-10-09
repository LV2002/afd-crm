import {
  isTemperatureKind,
  KIND_LABELS,
  KIND_METADATA_KEY,
  type TemperatureKind,
} from "./temperature-kinds";

/**
 * What an admin may change about a temperature's MEANING, and what they
 * may not.
 *
 * The settings screen used to be a list of names and colours. A temperature
 * is now also the lead's funnel position, so each one carries a `kind`
 * (what the system does with a lead that has it), a `probability` (how
 * likely it is to become an admission, for the forecast), and whether
 * entering it requires a reason. Those live in `dropdown_options.metadata`
 * next to the `interested` flag, merged and never replaced — `metadata`
 * holds other keys too, and overwriting the column is how a setting
 * quietly disappears months later.
 *
 * Pure, so every rule below is tested rather than trusted: a mistake here
 * does not look like a bug, it looks like leads behaving oddly.
 */

export interface TemperatureMeaningInput {
  /** Raw form value; anything that is not a known kind is rejected. */
  kind: string | null;
  /** Raw form value, a percentage. Blank means "not set". */
  probability: string | null;
  requiresReason: boolean;
  interested: boolean;
}

export type MeaningResult =
  | { ok: true; metadata: Record<string, unknown> }
  | { ok: false; error: string };

export function applyTemperatureMeaning(
  current: Record<string, unknown> | null | undefined,
  input: TemperatureMeaningInput,
): MeaningResult {
  if (!isTemperatureKind(input.kind)) {
    return { ok: false, error: "Choose what this temperature means." };
  }

  let probability: number | null = null;
  const rawProbability = (input.probability ?? "").trim();
  if (rawProbability !== "") {
    const parsed = Number(rawProbability);
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
      return { ok: false, error: "Chance of admission is a percentage from 0 to 100." };
    }
    probability = parsed;
  }

  const metadata: Record<string, unknown> = {
    ...(current ?? {}),
    [KIND_METADATA_KEY]: input.kind,
    interested: input.interested,
    // Only a closing outcome can ask why. A tick left on something else
    // would be a requirement nothing ever enforces.
    requires_reason: input.kind === "lost" ? input.requiresReason : false,
  };

  if (probability === null) delete metadata.probability;
  else metadata.probability = probability;

  return { ok: true, metadata };
}

/**
 * Can this temperature's kind change, given how many leads carry it?
 *
 * Moving a temperature INTO or OUT OF "Took admission" is the one change
 * that would break the rule the whole model rests on — that the status
 * and the enrolment agree. Into it, every lead already on that
 * temperature would become an "admission" with no enrolment behind it.
 * Out of it, every confirmed admission would be reclassified as an
 * ordinary in-progress lead, re-enter the queue, and be chased as if
 * unsold. Both are refused once any lead carries the value; the message
 * says what to do instead.
 *
 * Every other change of kind is safe to make with leads on it: they simply
 * start being treated the new way.
 */
export function kindChangeError(
  oldKind: TemperatureKind,
  newKind: TemperatureKind,
  leadsCarryingIt: number,
): string | null {
  if (oldKind === newKind || leadsCarryingIt === 0) return null;
  if (oldKind !== "won" && newKind !== "won") return null;

  const one = leadsCarryingIt === 1;
  const leadsLabel = `${leadsCarryingIt} lead${one ? "" : "s"}`;
  return newKind === "won"
    ? `${leadsLabel} already ${one ? "has" : "have"} this temperature and no admission behind ${one ? "it" : "them"}, so it cannot become "${KIND_LABELS.won}". Add a new temperature of that kind instead.`
    : `${leadsLabel} ${one ? "has a confirmed admission" : "have confirmed admissions"} under this temperature, so it cannot stop being "${KIND_LABELS.won}". Add a new one and leave this as it is.`;
}
