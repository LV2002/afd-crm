/**
 * Campaign attribution, from wherever a form happened to put it.
 *
 * Two places carry it and both are normal:
 *
 * - **Explicit fields.** A form with hidden inputs named `utm_source`,
 *   `gclid` and the rest, filled in by a snippet on the page. Somebody
 *   set those up on purpose.
 * - **The page URL.** A form that posts the address it was submitted
 *   from, query string and all, and leaves the reading to us.
 *
 * This lived in `website/page-identity.ts` and was read only by the
 * website mapper, so a custom webhook — a Google Form, a course
 * platform, a landing page somebody else built — could send a perfectly
 * good `?gclid=…&utm_campaign=123` and have every bit of it dropped. For
 * an institute running several Google Ads campaigns that is the
 * difference between knowing which campaign produced a lead and not, so
 * it belongs in the shared layer where every source reaches it.
 */

/** What a URL's query string is worth keeping: campaign tags and the two click ids. */
function isAttributionParam(name: string): boolean {
  return name.startsWith("utm_") || name === "gclid" || name === "fbclid";
}

/**
 * The attribution parameters on a page URL.
 *
 * Takes a whole URL, a bare query string, or one with a leading `?` —
 * forms send all three. A fragment is stripped first: `#apply` is a
 * position on the page, and anything after it is not a parameter.
 */
export function utmFromQuery(value: string | null): Record<string, string> | null {
  if (!value) return null;

  const query = value.includes("?") ? value.slice(value.indexOf("?") + 1) : value;
  const cleaned = query.split("#")[0];
  if (!cleaned) return null;

  const out: Record<string, string> = {};
  for (const [key, raw] of new URLSearchParams(cleaned)) {
    const name = key.toLowerCase();
    if (!isAttributionParam(name)) continue;
    const trimmed = raw.trim();
    // A parameter present but empty tells you nothing and would show up
    // as a blank row in a report.
    if (trimmed) out[name] = trimmed;
  }
  return Object.keys(out).length > 0 ? out : null;
}

/**
 * Both sources together, explicit fields winning key by key.
 *
 * Explicit wins for the reason it always did: a hidden input a form
 * author filled in was put there deliberately, while a query string is
 * whatever the page was loaded with — somebody who browsed the site
 * before submitting carries the parameters of whichever page they
 * landed on first.
 *
 * **Key by key, not all-or-nothing**, which is the part that was wrong
 * before. The website mapper took the explicit set *instead of* the URL
 * set whenever it had one, so a form posting a single `utm_source`
 * hidden input threw away the `gclid` sitting in the URL beside it —
 * and the gclid is the one parameter Google Ads adds by itself through
 * auto-tagging, the one nobody has to remember to configure. Merging
 * per key keeps every parameter either source knows about and still
 * lets a deliberate field override a stale URL.
 */
export function mergeUtm(
  fromUrl: Record<string, string> | null,
  explicit: Record<string, string> | null,
): Record<string, string> | null {
  if (!fromUrl) return explicit;
  if (!explicit) return fromUrl;
  return { ...fromUrl, ...explicit };
}
