/**
 * Turning a Next.js request failure into something `captureError` can store.
 *
 * Pure on purpose — no database, no Next imports — so the decisions below
 * can be tested, and so `instrumentation.ts` stays the three lines of glue
 * it ought to be.
 *
 * ## Why this exists
 *
 * Until now the only thing that reported a crashed screen was the React
 * error boundary, which runs in the BROWSER. A browser is never told what
 * actually went wrong: Next.js replaces the message with a digest — an
 * opaque number like `3348501131` — precisely so a stack trace cannot leak
 * to whoever is looking at the page.
 *
 * The cost of that was paid on 3 October 2026, when confirming an
 * admission crashed the lead page and the only evidence anywhere in the
 * system was that number. The message, the stack and the line were all
 * known to the server and all thrown away. This is the server's side of
 * the same report.
 */

/** What Next.js hands `onRequestError` as its third argument. */
export interface NextErrorContext {
  routerKind?: string;
  routePath?: string;
  routeType?: string;
  renderSource?: string;
  revalidateReason?: string;
}

/**
 * `notFound()` and `redirect()` work by throwing.
 *
 * They are how a page says "404" and "go there instead", not faults, and
 * recording them would bury real failures under every mistyped URL. Next
 * filters most of these before calling us; this is belt and braces,
 * because the alternative is a health screen nobody trusts.
 */
export function isFrameworkControlFlow(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const digest = (error as { digest?: unknown }).digest;
  return typeof digest === "string" && digest.startsWith("NEXT_");
}

/**
 * Which half of the system broke.
 *
 * Kept distinct — `server:render` and `server:action` are genuinely
 * different bugs with different fixes, and a single `page` bucket is what
 * made the October lead-page crash take an afternoon to place. `render`
 * means a Server Component threw while drawing the screen; `action` means
 * a Server Action threw while saving something.
 */
export function requestErrorSource(routeType: string | undefined): string {
  const kind = routeType && /^[a-z-]+$/.test(routeType) ? routeType : "unknown";
  return `server:${kind}`;
}

/**
 * The path without its query string.
 *
 * The id in `/leads/<id>` is the single most useful thing for reproducing
 * a crash, so it stays. Everything after `?` is a counsellor's search
 * terms and filters — their students' names, in other words — and an error
 * table is not a place to accumulate those.
 */
export function pathWithoutQuery(url: string | undefined): string | null {
  if (typeof url !== "string" || url === "") return null;
  const cut = url.search(/[?#]/);
  return (cut === -1 ? url : url.slice(0, cut)).slice(0, 200);
}

/**
 * Everything worth keeping about where it happened.
 *
 * `digest` is the bridge: it is the one thing the person looking at the
 * broken screen can read out, and recording it here is what lets "quote
 * 3348501131" land on the row that has the stack in it.
 */
export function requestErrorContext(
  error: unknown,
  request: { path?: string; method?: string } | undefined,
  context: NextErrorContext | undefined,
): Record<string, unknown> {
  const raw =
    typeof error === "object" && error !== null ? (error as { digest?: unknown }).digest : undefined;
  const digest = typeof raw === "string" ? raw.slice(0, 80) : null;

  return {
    path: pathWithoutQuery(request?.path),
    method: request?.method ?? null,
    // The route TEMPLATE — `/leads/[id]` rather than one student's id.
    // Carries no personal data, so it is the safe thing to group on.
    routePath: context?.routePath ?? null,
    routeType: context?.routeType ?? null,
    renderSource: context?.renderSource ?? null,
    revalidateReason: context?.revalidateReason ?? null,
    digest,
  };
}
