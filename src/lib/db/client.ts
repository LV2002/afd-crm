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
 */
const client =
  globalThis.__afdDbClient ?? postgres(getConnectionString(), { max: 1 });

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
