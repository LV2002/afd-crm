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
/**
 * How many Postgres connections one running instance may hold.
 *
 * This was 1, and that single number was a bottleneck under everything:
 * with a pool of one, every direct-db query in a request waited for the
 * one before it to finish, so a page running six independent queries in
 * `Promise.all` executed them strictly one after another and took six
 * times as long as it needed to. It also made a nested transaction
 * deadlock outright, which is why several modules take a `DbExecutor`
 * instead of opening their own.
 *
 * Five is chosen against AFD's real shape, not a benchmark: a handful of
 * staff, a few hundred leads a month, and a Supabase pooler whose
 * connection budget is shared across every serverless instance Vercel
 * happens to have warm. Enough for the widest `Promise.all` on any page,
 * small enough that a dozen cold instances cannot exhaust the pooler.
 */
const MAX_CONNECTIONS = 5;

const client =
  globalThis.__afdDbClient ??
  postgres(getConnectionString(), {
    max: MAX_CONNECTIONS,
    prepare: false,
    connect_timeout: 8,
    /**
     * Hand a connection back to the pooler after 20 idle seconds. A
     * serverless instance that served one request at 9am and nothing
     * since should not still be holding a connection at noon.
     */
    idle_timeout: 20,
  });

if (process.env.NODE_ENV !== "production") {
  globalThis.__afdDbClient = client;
}

export const db = drizzle(client, { schema });

/**
 * A db handle that can be either the top-level `db` or a `tx` inside
 * `db.transaction(async (tx) => ...)`. Functions that need to compose into
 * a caller's existing transaction (rather than opening their own: while the
 * pool was `max: 1` a nested `db.transaction()` call deadlocked outright,
 * waiting for a connection the outer transaction was holding. The pool is
 * larger now, so the deadlock is gone — but composing into the caller's
 * transaction is still the right shape, because it keeps the work atomic)
 * should take this type and let the caller own the transaction boundary.
 */
export type DbExecutor = typeof db | Parameters<Parameters<(typeof db)["transaction"]>[0]>[0];

// Deciding what a failure *was* is pure logic and lives in its own module
// so that importing it doesn't open a connection pool. Re-exported here
// because every caller already imports these from the client.
export { isDatabaseUnreachable, isDeadlineExceeded, withDeadline } from "./errors";
