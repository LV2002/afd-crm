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
