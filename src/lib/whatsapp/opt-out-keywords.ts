/**
 * Deciding whether a message is an opt-out, and the categories the
 * keywords live in.
 *
 * Separate from `opt-out.ts` for the same reason `db/errors.ts` is
 * separate from `db/client.ts`: this is pure string work, and importing
 * the module that talks to the database drags a connection pool — and a
 * hard requirement on DATABASE_URL — into anything that only wants to
 * compare two words. Re-exported from `opt-out.ts`, so callers need not
 * care which file a symbol lives in.
 */

export const OPT_OUT_KEYWORD_CATEGORY = "whatsapp_optout_keyword";
export const OPT_IN_KEYWORD_CATEGORY = "whatsapp_optin_keyword";

/**
 * Reduces a message to something a keyword can be compared against:
 * lowercase, no surrounding punctuation, single spaces.
 *
 * `\p{M}` — combining marks — is in the keep-set alongside letters and
 * digits, and it is not optional. Malayalam writes its vowels and the
 * virama as marks rather than letters, so stripping them turns
 * "നിർത്തുക" into "ന ർത ത ക": a keyword an institute in Kerala adds
 * would silently never match, and nobody would ever find out why.
 */
export function normaliseKeywordText(body: string | null | undefined): string {
  return (body ?? "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\p{M}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Does this message mean one of these keywords?
 *
 * The whole message must BE the keyword, not merely contain it. "stop by
 * the centre tomorrow" is somebody making an appointment, and unsubscribing
 * them for it would be worse than missing an opt-out — a real opt-out gets
 * repeated, a wrong one is silent. Multi-word keywords ("stop promotions")
 * work the same way.
 */
export function matchesKeyword(body: string | null | undefined, keywords: string[]): string | null {
  const text = normaliseKeywordText(body);
  if (!text) return null;
  for (const keyword of keywords) {
    const candidate = normaliseKeywordText(keyword);
    if (candidate && candidate === text) return keyword;
  }
  return null;
}
