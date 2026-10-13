/**
 * Which configured lead source a free-text source really is.
 *
 * Every ingestion route names its own source in its own words — the Lead Ads
 * webhook writes `meta`, the WhatsApp one wrote `WhatsApp`, a custom webhook
 * writes whatever name its admin typed — while the Lead Source dropdown holds
 * `meta`, `whatsapp`, and so on. A value that is not one of the options is
 * invisible to the field on the lead (it shows "Choose lead source"), to the
 * filter, and to any report that groups by option, so one channel ends up as
 * two or three rows and some leads look as though they have no source at all.
 *
 * Matches case-, spacing- and punctuation-insensitively on the option's value
 * OR its label, and returns the option's value. Anything that matches nothing
 * is returned unchanged: an unfamiliar source must be kept, not guessed at.
 */
export interface SourceOption {
  value: string;
  label: string;
}

function squash(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function canonicalSource(raw: string, options: readonly SourceOption[]): string {
  const wanted = squash(raw);
  if (!wanted) return raw;
  const hit =
    options.find((option) => squash(option.value) === wanted) ??
    options.find((option) => squash(option.label) === wanted);
  return hit ? hit.value : raw;
}
