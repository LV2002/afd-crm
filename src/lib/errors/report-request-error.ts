import "server-only";

import { captureError } from "./capture";
import {
  isFrameworkControlFlow,
  requestErrorContext,
  requestErrorSource,
  type NextErrorContext,
} from "./request-error";

/**
 * The Node-only half of `instrumentation.ts`.
 *
 * Separate from the hook itself because `instrumentation.ts` is compiled
 * TWICE — once for Node and once for the Edge runtime, which this app has
 * because `middleware.ts` runs there. The Edge build has no TCP sockets,
 * so anything reaching the Postgres client fails the build outright
 * (`Module not found: Can't resolve 'net'`). Keeping that code behind one
 * dynamic import inside a `NEXT_RUNTIME === 'nodejs'` block is what lets
 * webpack drop it from the Edge bundle entirely.
 */
export async function reportRequestError(
  error: unknown,
  request: { path?: string; method?: string },
  context: NextErrorContext,
): Promise<void> {
  // notFound() and redirect() are implemented as throws. Not faults.
  if (isFrameworkControlFlow(error)) return;

  await captureError({
    source: requestErrorSource(context?.routeType),
    error,
    context: requestErrorContext(error, request, context),
  });
}
