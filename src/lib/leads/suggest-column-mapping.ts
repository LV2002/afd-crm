/**
 * Normalises a header/label for fuzzy matching: lowercase, strip
 * everything but letters and digits.
 *
 * Exported because the same comparison has to be made of a Meta Lead Ads
 * question name (`what_is_your_current_qualification?`) against the same
 * field keys and labels — see lib/integrations/meta/map-custom-answers.ts.
 * One normaliser, so a header and a form question are judged identically.
 */
export function normaliseFieldName(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

const normalise = normaliseFieldName;

/**
 * Best-guess field key for one CSV header, so the column mapper starts
 * pre-filled instead of making every import start from "Skip" on every
 * column. Exact match (against either the field's key or its label) wins
 * over a substring match; no match returns "" (Skip) rather than
 * guessing — a wrong auto-map that goes unnoticed is worse than an empty
 * one that visibly needs a human's attention.
 */
export function suggestColumnMapping(header: string, fields: Array<{ key: string; label: string }>): string {
  const target = normalise(header);
  if (!target) return "";

  const exact = fields.find((f) => normalise(f.key) === target || normalise(f.label) === target);
  if (exact) return exact.key;

  const partial = fields.find((f) => {
    const key = normalise(f.key);
    const label = normalise(f.label);
    return target.includes(key) || key.includes(target) || target.includes(label) || label.includes(target);
  });
  return partial?.key ?? "";
}
