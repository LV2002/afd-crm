import "server-only";

import { captureError } from "./capture";
import { isFrameworkControlFlow } from "./request-error";

/**
 * Turning a thrown Server Action into a message on the form.
 *
 * An unhandled throw in a Server Action takes out the nearest error
 * boundary, which in this application is the whole screen: the user loses
 * the page they were working on and gets a blank panel with an
 * eight-digit number. For a save that is the wrong failure mode every
 * time — whatever went wrong, the person is still sitting in front of the
 * record and needs it.
 *
 * Reported with `await`, deliberately. On Vercel a serverless function can
 * be frozen the moment its response is sent, so reporting that outlives
 * the response may never be written — which is exactly why
 * `instrumentation.ts` logged the 3 October admission failure to the
 * console and never got its row into `error_events`. Inside the action,
 * before it returns, it lands.
 */
export async function reportActionFailure(
  source: string,
  error: unknown,
  options: {
    /** Anything useful for finding it again. Never a form's values. */
    context?: Record<string, unknown>;
    /** What to tell the user when the error itself is not fit to show. */
    fallback: string;
    /**
     * Show the error's own message instead of the fallback.
     *
     * For admin-only settings screens, where the failure is nearly always
     * a setup problem the reader is the right person to fix — a missing
     * environment variable, a key of the wrong length. Hiding that behind
     * "something went wrong" sends an admin to ask somebody who knows
     * less than the message did. Never set for screens a counsellor uses:
     * an internal message is noise at best there.
     */
    revealMessage?: boolean;
  },
): Promise<string> {
  // redirect() and notFound() are implemented as throws and must keep
  // travelling. A caller that swallowed one would break navigation in a
  // way that looks like nothing at all.
  if (isFrameworkControlFlow(error)) throw error;

  await captureError({ source, error, context: options.context });

  if (options.revealMessage && error instanceof Error && error.message) {
    return error.message;
  }
  return options.fallback;
}
