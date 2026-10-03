/**
 * The server's own account of what went wrong.
 *
 * Next.js calls `onRequestError` for every uncaught error on the server —
 * a Server Component that threw while rendering a page, a Server Action
 * that threw while saving, a route handler that fell over. It is the only
 * place the real message and the real stack exist.
 *
 * Without this file the browser's error boundary was the sole reporter,
 * and all it is ever given is a digest: an opaque number Next.js
 * substitutes for the message so a stack trace cannot leak to whoever is
 * looking at the page. "If you report this, quote 3348501131" is a
 * perfectly good thing to show a counsellor and a perfectly useless thing
 * to debug from — on 3 October 2026 an admission crashed the lead page and
 * that number was the only evidence the system had kept.
 *
 * Both reports are kept. The browser boundary still catches crashes that
 * happen in the browser, which never reach the server at all, and the
 * digest is recorded on each side so the two rows about one crash can be
 * matched up.
 *
 * Note this is not an API route and nothing imports it. Next.js loads
 * `src/instrumentation.ts` by that name; renaming or moving it silently
 * turns server-side error reporting back off.
 */

export async function register(): Promise<void> {
  // Nothing to start up. The export has to exist for Next.js to treat the
  // file as instrumentation, and a comment is cheaper than the hour spent
  // working out why `onRequestError` stopped firing after somebody tidied
  // away the empty function.
}

export async function onRequestError(
  error: unknown,
  request: { path?: string; method?: string },
  context: {
    routerKind?: string;
    routePath?: string;
    routeType?: string;
    renderSource?: string;
    revalidateReason?: string;
  },
): Promise<void> {
  // This file is compiled for the Edge runtime as well (middleware.ts puts
  // it there), and the Edge runtime has no TCP sockets for Postgres. The
  // check has to WRAP the import rather than guard it with an early
  // return: `NEXT_RUNTIME` is substituted at build time, so an `if` block
  // becomes dead code webpack removes, while anything after an early
  // return is still bundled — and fails the Edge build.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    try {
      const { reportRequestError } = await import("@/lib/errors/report-request-error");
      await reportRequestError(error, request, context);
    } catch (reportingFailure) {
      // This hook runs inside a request that has already failed. Throwing
      // here would turn a broken page into a broken server, so it ends at
      // the console — which on Vercel is still a place somebody can look.
      console.error("onRequestError itself failed", reportingFailure);
    }
  }
}
