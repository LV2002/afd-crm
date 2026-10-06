import "server-only";

import { sqlClient } from "@/lib/db/client";

import { buildHeader, type ArchiveRow } from "./format";
import { archiveTablesInOrder, EXCLUDED_TABLES } from "./tables";

/**
 * Writes the whole institute out, one line at a time.
 *
 * ## Streaming, not building
 *
 * `select * from audit_log` at year three is tens of thousands of rows,
 * and a serverless function that materialises all of them as JavaScript
 * objects before writing a byte will run out of memory on exactly the
 * run that matters — the one taken at year end, on the largest database
 * there has ever been. `.cursor()` holds a few hundred rows at a time
 * and the generator hands each line straight to the response, so peak
 * memory is a page of rows regardless of how big the table is.
 *
 * ## Why `select *`
 *
 * Everywhere else in this codebase an explicit column list is right.
 * Here it is wrong: the archive's job is to carry whatever the database
 * holds, including a column added after this code was written. Naming
 * columns would mean an archive that silently drops the newest field —
 * the one most likely to matter and least likely to be noticed missing.
 */
export async function* archiveLines(): AsyncGenerator<string> {
  const tables = await archiveTablesInOrder();

  // Read before the rows so the file identifies itself even if the run
  // is interrupted — a header without rows is obviously incomplete; rows
  // without a header are unreadable.
  const [org] = await sqlClient<Array<{ name: string | null }>>`
    select name from organization limit 1
  `.catch(() => [{ name: null }] as Array<{ name: string | null }>);

  yield `${JSON.stringify(
    buildHeader({
      organisation: org?.name ?? null,
      tables,
      excluded: [...EXCLUDED_TABLES].sort(),
    }),
  )}\n`;

  for (const table of tables) {
    const cursor = sqlClient`select * from ${sqlClient(table)}`.cursor(500);
    for await (const rows of cursor) {
      for (const row of rows) {
        const line: ArchiveRow = { t: table, r: row as Record<string, unknown> };
        yield `${JSON.stringify(line)}\n`;
      }
    }
  }
}

/**
 * The same lines, gzipped, as a stream a route handler can return.
 *
 * Gzip because this is mostly repeated column names — the compression
 * ratio on NDJSON of database rows is roughly ten to one, which is the
 * difference between a file somebody can email themselves and one they
 * cannot.
 */
export function archiveStream(): ReadableStream<Uint8Array> {
  const lines = archiveLines();
  const encoder = new TextEncoder();

  const source = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const next = await lines.next();
        if (next.done) controller.close();
        else controller.enqueue(encoder.encode(next.value));
      } catch (error) {
        // Surfaced rather than swallowed: a truncated archive that looks
        // complete is the single worst outcome this feature can produce.
        controller.error(error);
      }
    },
    async cancel() {
      await lines.return(undefined);
    },
  });

  // The DOM lib types `CompressionStream.writable` as accepting any
  // BufferSource, which is wider than the Uint8Array this source emits,
  // so the pair does not line up structurally. The runtime contract is
  // exactly right; only the declaration is loose.
  return source.pipeThrough(
    new CompressionStream("gzip") as unknown as ReadableWritablePair<Uint8Array, Uint8Array>,
  );
}

/** `afd-crm-archive-2026-10-05.ndjson.gz` — sorts chronologically in a folder. */
export function archiveFileName(now = new Date()): string {
  return `afd-crm-archive-${now.toISOString().slice(0, 10)}.ndjson.gz`;
}
