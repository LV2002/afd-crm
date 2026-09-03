import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema";

declare global {
  var __afdDbClient: postgres.Sql | undefined;
}

function getConnectionString() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set");
  }
  return url;
}

/**
 * Direct Postgres connection for migrations, seeding and cron/webhook
 * route handlers. Never import this into client components — it bypasses
 * Supabase Auth entirely and has no RLS-friendly JWT attached, so callers
 * must run under the service-role connection string only.
 *
 * `prepare: false` because DATABASE_URL in a deployed (serverless)
 * environment must point at Supabase's connection pooler (Session or
 * Transaction mode) rather than the direct connection — the direct
 * hostname resolves IPv6-only in many Supabase regions, which Vercel's
 * functions can't reach at all ("getaddrinfo ENOTFOUND"). Supavisor's
 * transaction-mode pooling doesn't support prepared statements (a
 * transaction can land on a different physical connection each time), so
 * this is required for pooled connections and a no-op against a direct
 * one — safe either way. See docs/GETTING-STARTED.md for which
 * connection string to use where.
 *
 * `connect_timeout` is lowered from postgres.js's 30s default to 8s
 * deliberately, and the number matters. When DATABASE_URL points at a
 * host that *drops* packets rather than refusing them — which is exactly
 * what Supabase's IPv6-only direct hostname does from a network without
 * IPv6 routing — the connection neither succeeds nor errors; it stalls
 * for the whole timeout. A refused port throws in milliseconds, so this
 * only ever bites in the unreachable case, and it bit hard: at 30s a
 * Vercel function (killed at 10-15s) died mid-request and the browser
 * got a bare "network error" with zero bytes and no server log, while
 * locally the dev server printed "Compiled" and then simply never
 * finished the request. 8s fails *inside* the function's lifetime, so a
 * misconfigured DATABASE_URL surfaces as a readable error page (see
 * `isDatabaseUnreachable`) instead of an unexplained dead tab.
 */
const client =
  globalThis.__afdDbClient ??
  postgres(getConnectionString(), { max: 1, prepare: false, connect_timeout: 8 });

if (process.env.NODE_ENV !== "production") {
  globalThis.__afdDbClient = client;
}

export const db = drizzle(client, { schema });

/**
 * A db handle that can be either the top-level `db` or a `tx` inside
 * `db.transaction(async (tx) => ...)`. Functions that need to compose into
 * a caller's existing transaction (rather than opening their own — `db`'s
 * connection pool is `max: 1`, so a nested `db.transaction()` call would
 * deadlock waiting for a connection the outer transaction is holding)
 * should take this type and let the caller own the transaction boundary.
 */
export type DbExecutor = typeof db | Parameters<Parameters<(typeof db)["transaction"]>[0]>[0];

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
