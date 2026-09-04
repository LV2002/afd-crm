/**
 * Pure helpers for deciding what a database failure actually was.
 *
 * Deliberately in their own module rather than in `client.ts`: importing
 * that file opens a connection pool and throws if `DATABASE_URL` is
 * unset, which is the wrong price for a function that only inspects an
 * Error. `tests/db-unreachable.spec.ts` calls itself "pure logic — no
 * database needed" and, until this split, could not run without one.
 *
 * Re-exported from `client.ts`, so every existing import still works.
 */

/**
 * Rejects if `work` hasn't settled within `ms`. A last-resort guard for
 * request paths that must always produce a response: `connect_timeout`
 * only bounds *establishing* a connection, so a socket that connects and
 * then stalls mid-query — a pooler holding the request, a lock, a dropped
 * connection with no RST — still hangs indefinitely without this, and a
 * server render that never settles sends the browser nothing at all.
 */
export async function withDeadline<T>(work: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      reject(
        Object.assign(new Error(`${label} exceeded ${ms}ms`), {
          code: "ETIMEDOUT",
          // Distinguishes "connected fine, then the query stalled" from
          // "never reached the database" — the two have different causes
          // and telling a user to fix DATABASE_URL when it is already
          // correct sends them down the wrong path.
          deadlineExceeded: true,
        }),
      );
    }, ms);
  });
  try {
    return await Promise.race([work, deadline]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * True when an error is the connection never being established at all —
 * a wrong or unreachable DATABASE_URL — rather than a failure of the
 * query itself. Callers that render UI use this to show a configuration
 * message instead of a generic crash; it deliberately does NOT match
 * query-level errors (a bad column, a constraint violation), because
 * those are real bugs and must keep surfacing as such.
 */
const UNREACHABLE_CODES = new Set([
  "CONNECT_TIMEOUT", // host accepted no connection within connect_timeout — unroutable address
  "ECONNREFUSED", // nothing listening on that port
  "ENOTFOUND", // hostname doesn't resolve
  "EHOSTUNREACH",
  "ENETUNREACH",
  "ETIMEDOUT",
  "ECONNRESET",
]);

/** True when `withDeadline` gave up: the database answered too slowly. */
export function isDeadlineExceeded(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 10 && current instanceof Error; depth += 1) {
    if ((current as { deadlineExceeded?: unknown }).deadlineExceeded === true) return true;
    current = current.cause;
  }
  return false;
}

export function isDatabaseUnreachable(error: unknown): boolean {
  // Drizzle wraps whatever the driver threw in a DrizzleQueryError and hangs
  // the original off `.cause`, so the socket error code is NOT on the error
  // handed to the caller — reading only the top level silently never matches.
  // Walk the chain, with a depth bound so a self-referential cause can't spin.
  let current: unknown = error;
  for (let depth = 0; depth < 10 && current instanceof Error; depth += 1) {
    const code = (current as { code?: unknown }).code;
    if (typeof code === "string" && UNREACHABLE_CODES.has(code)) return true;
    current = current.cause;
  }
  return false;
}
