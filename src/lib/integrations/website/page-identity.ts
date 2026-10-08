/**
 * Which page a form was on, and which form it was.
 *
 * AFD's site has several hand-written HTML forms — one per landing page,
 * sometimes more than one on a page — all posting to the same Apps Script.
 * Without something to tell them apart every submission arrived as
 * "Website" and the question "which page is actually producing enquiries"
 * had no answer.
 *
 * ## Why the page becomes a path, not a URL
 *
 * A sub-source is a reporting dimension, and a dimension whose values are
 * full URLs has effectively infinite cardinality: `?utm_source=fb`,
 * `#apply`, a trailing slash and `www.` all produce a different row for the
 * same page. The sources report would show forty variants of one landing
 * page and no total for any of them. So the URL is reduced to a path and
 * the query string is kept separately, where it belongs — as UTM.
 */

/** Strips a URL down to the part that identifies the page. */
export function pagePathOf(value: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  // Accept a full URL, a protocol-relative one, a host-and-path, or a bare
  // relative path — the forms send all four, depending on who wrote them.
  const stripped = trimmed.replace(/^[a-z][a-z0-9+.-]*:\/\//i, "").replace(/^\/\//, "");
  const hadHostPrefix = stripped !== trimmed;

  let path = stripped;
  if (!path.startsWith("/")) {
    const slash = path.indexOf("/");
    const firstSegment = slash === -1 ? path : path.slice(0, slash);

    // `afdindia.com/courses/nift` starts with a host; `courses/nift` is a
    // relative path whose first segment is a real part of the page. A dot is
    // the only practical way to tell them apart, so a scheme that was
    // actually present is trusted first and a dot is the fallback.
    const looksLikeHost = hadHostPrefix || firstSegment.includes(".");
    if (looksLikeHost) {
      path = slash === -1 ? "/" : path.slice(slash);
    } else {
      path = `/${path}`;
    }
  }

  // The query string is UTM's job, and a fragment is a position on the page
  // rather than a different page.
  path = path.split("?")[0].split("#")[0];

  // `/Courses/NIFT/` and `/courses/nift` are one page. Lower-cased because
  // a server that treats them as different is rarer than a form author who
  // capitalises inconsistently.
  path = path.replace(/\/{2,}/g, "/").toLowerCase();
  if (path.length > 1) path = path.replace(/\/+$/, "");

  return path === "" ? "/" : path;
}

/**
 * Re-exported, not defined here any more.
 *
 * Reading campaign parameters out of a URL stopped being a website
 * concern when custom webhooks started carrying page URLs too, so the
 * implementation moved to `form-payload/utm.ts` and the generic mapper
 * now applies it to every source. Kept exported from here because this
 * is where callers and tests have always looked for it, and two copies
 * of a parser is how the two paths drifted apart in the first place.
 */
export { utmFromQuery } from "@/lib/integrations/form-payload/utm";

/**
 * The label that lands in `sub_source`, and therefore in every report and
 * filter that already exists.
 *
 * Page first, so the sources report sorts by page and the several forms on
 * one page group together underneath it — which is the shape of the
 * question being asked. Either half may be missing: a form with no name on
 * a known page is identified by the page, and a named form with no page
 * still identifies itself.
 */
export function composeSubSource(page: string | null, formName: string | null): string | null {
  if (page && formName) return `${page} · ${formName}`;
  return page ?? formName ?? null;
}
