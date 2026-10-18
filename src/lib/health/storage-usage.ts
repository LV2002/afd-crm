import { sql } from "drizzle-orm";

import { db } from "@/lib/db/client";

import { assessUsage, limitFromEnv, type Usage } from "./storage-level";

export interface StorageReport {
  database: Usage | null;
  files: Usage | null;
  fileCount: number | null;
}

/** Supabase free plan: 500 MB database, 1 GB file storage. Override on a paid plan. */
const DATABASE_LIMIT_MB = 500;
const FILES_LIMIT_MB = 1024;

type Row = Record<string, unknown>;
const rowsOf = (result: unknown): Row[] =>
  Array.isArray(result) ? (result as Row[]) : ((result as { rows?: Row[] }).rows ?? []);

/**
 * What the project is using, measured by the database itself.
 *
 * The two numbers Supabase bills against: the database's size on disk and
 * the bytes held in Storage (`storage.objects` records every file's size).
 * Each is read separately and returns null when it cannot be — a plain
 * Postgres without the `storage` schema must not break the Health page.
 */
export async function getStorageReport(): Promise<StorageReport> {
  const databaseLimit = limitFromEnv(process.env.DATABASE_LIMIT_MB, DATABASE_LIMIT_MB);
  const filesLimit = limitFromEnv(process.env.STORAGE_LIMIT_MB, FILES_LIMIT_MB);

  let databaseBytes: number | null = null;
  try {
    const rows = rowsOf(await db.execute(sql`select pg_database_size(current_database())::bigint as bytes`));
    databaseBytes = rows[0] ? Number(rows[0].bytes) : null;
  } catch {
    databaseBytes = null;
  }

  let fileBytes: number | null = null;
  let fileCount: number | null = null;
  try {
    const rows = rowsOf(
      await db.execute(sql`
        select coalesce(sum((metadata->>'size')::bigint), 0)::bigint as bytes, count(*)::int as files
        from storage.objects
      `),
    );
    if (rows[0]) {
      fileBytes = Number(rows[0].bytes);
      fileCount = Number(rows[0].files);
    }
  } catch {
    fileBytes = null;
  }

  return {
    database: assessUsage(databaseBytes, databaseLimit),
    files: assessUsage(fileBytes, filesLimit),
    fileCount,
  };
}
