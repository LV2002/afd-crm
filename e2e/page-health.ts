import type { ConsoleMessage, Page, Request, Response } from "@playwright/test";

/**
 * What "this page is broken" means, in one place.
 *
 * A page can fail without failing: Next.js catches a thrown Server
 * Component and renders an error boundary with a 200, so a crawler that
 * only checks status codes walks past the worst bugs. These are the four
 * signals worth collecting, and a page is healthy only if it produces none.
 */
export interface PageProblem {
  kind: "status" | "boundary" | "console" | "request";
  detail: string;
}

/**
 * Console noise that is not a bug in this application.
 *
 * Kept deliberately short. Every entry here is a class of real failure the
 * suite can no longer see, so the bar is "this is provably not ours".
 */
const IGNORED_CONSOLE = [
  // React's own dev-mode hydration advice, which Next prints on pages that
  // are fine; the hydration MISMATCH message is a different string and is
  // not ignored.
  /Download the React DevTools/i,
  // Next's dev overlay fetching its own source maps.
  /\/__nextjs_original-stack-frame/i,
];

/** Requests whose failure says nothing about the page under test. */
const IGNORED_REQUESTS = [
  /\/__nextjs/i,
  /favicon\.ico/i,
  // Supabase Storage signed URLs expire in five minutes; a trace replayed
  // later re-requests them and gets a 400 that is not a bug.
  /\/storage\/v1\/object\/sign\//i,
];

/**
 * The App Router prefetches every link it can see.
 *
 * When a `<Link>` enters the viewport Next fetches that route's payload in
 * the background — `GET /leads?_rsc=<hash>`. Navigate before it lands, which
 * a crawler does on every single page, and the browser cancels it:
 * `net::ERR_ABORTED`.
 *
 * That is the framework working. A speculative fetch the browser gave up on
 * says nothing about the page, and counting it made all six crawl runs fail
 * with dozens of "problems" that were really one design decision in Next.
 *
 * Narrow on purpose: only an `_rsc` prefetch, and only when the reason is
 * an abort. A prefetch that comes back 500 is still a broken route, and an
 * ordinary request that aborts is still worth seeing.
 */
function isCancelledPrefetch(url: string, reason: string): boolean {
  return /[?&]_rsc=/.test(url) && /ERR_ABORTED/i.test(reason);
}

/**
 * Watches a page for the whole time it is open.
 *
 * Returns a collector whose `problems` fills as things go wrong. Attached
 * before navigating, because a console error thrown during the first render
 * is exactly the one worth catching.
 */
export function watchPage(page: Page): { problems: PageProblem[] } {
  const problems: PageProblem[] = [];

  const onConsole = (message: ConsoleMessage) => {
    if (message.type() !== "error") return;
    const text = message.text();
    if (IGNORED_CONSOLE.some((pattern) => pattern.test(text))) return;
    problems.push({ kind: "console", detail: text.slice(0, 300) });
  };

  const onFailed = (request: Request) => {
    const url = request.url();
    if (IGNORED_REQUESTS.some((pattern) => pattern.test(url))) return;
    const reason = request.failure()?.errorText ?? "failed";
    if (isCancelledPrefetch(url, reason)) return;
    problems.push({ kind: "request", detail: `${request.method()} ${url} — ${reason}` });
  };

  const onResponse = (response: Response) => {
    const url = response.url();
    if (response.status() < 400) return;
    if (IGNORED_REQUESTS.some((pattern) => pattern.test(url))) return;
    problems.push({ kind: "request", detail: `${response.status()} ${url}` });
  };

  page.on("console", onConsole);
  page.on("requestfailed", onFailed);
  page.on("response", onResponse);

  return { problems };
}

/**
 * Whether the page is showing an error instead of a screen.
 *
 * Next renders a thrown Server Component as an error boundary with a 200,
 * so the only way to tell is to look at what is on it. "Access denied" is
 * deliberately NOT a problem — it is the permission system working, and a
 * crawler that treats it as a failure cannot test a counsellor at all.
 */
export async function errorBoundaryText(page: Page): Promise<string | null> {
  const body = (await page.locator("body").innerText().catch(() => "")) ?? "";

  const signatures = [
    "Application error: a client-side exception",
    "Unhandled Runtime Error",
    "This page could not be loaded",
    "500",
    "Internal Server Error",
  ];

  // "500" on its own appears in plenty of innocent places — a fee of
  // ₹500, a page size — so it only counts next to the words around a real
  // failure.
  const hit = signatures.find((signature) =>
    signature === "500"
      ? /\b500\b[\s\S]{0,40}(error|wrong|exception)/i.test(body)
      : body.includes(signature),
  );
  return hit ? `${hit} — ${body.slice(0, 200).replace(/\s+/g, " ")}` : null;
}

export function describeProblems(url: string, problems: PageProblem[]): string {
  return [
    `${url} produced ${problems.length} problem${problems.length === 1 ? "" : "s"}:`,
    ...problems.map((problem) => `  [${problem.kind}] ${problem.detail}`),
  ].join("\n");
}
