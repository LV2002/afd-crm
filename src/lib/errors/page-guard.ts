import "server-only";

import { captureError } from "./capture";

/**
 * Runs a page's server-side work and, if it throws, records the REAL error
 * (message and stack) before letting it through to the error screen.
 *
 * In production Next.js replaces a server error with "An error occurred in the
 * Server Components render… a digest property is included", and the only thing
 * the browser can report is that digest — so Settings → Health listed a crash
 * and never said why. Recording it here gives it its real words.
 *
 * Redirects and not-found are not errors and pass straight through.
 */
export async function guardPage<T>(source: string, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    const digest = (error as { digest?: unknown } | null)?.digest;
    if (typeof digest === "string" && digest.startsWith("NEXT_")) throw error;
    await captureError({ source, error }).catch(() => {});
    throw error;
  }
}
