/**
 * The archive file's shape — the "template" the download and the upload
 * both agree on.
 *
 * One gzipped file of newline-delimited JSON. The first line is a
 * header; every line after it is one row:
 *
 *     {"kind":"afd-crm-archive","version":1,...}
 *     {"t":"centers","r":{"id":"…","name":"Kochi",…}}
 *     {"t":"leads","r":{…}}
 *
 * ## Why newline-delimited rather than one JSON document
 *
 * A single `{"leads":[…],"payments":[…]}` object has to be complete
 * before it can be written and complete before it can be parsed, which
 * means both ends hold the whole institute in memory. Years three and
 * four of this archive will not fit comfortably in a serverless
 * function. A line at a time streams in constant memory at both ends,
 * and a truncated download is detectable — the last line will not parse
 * — rather than silently producing a half-restored database.
 *
 * ## Why a version number
 *
 * The point of this file is that it is opened a year after it was
 * written, by a version of the CRM that does not exist yet. `version`
 * is what lets that future code say "this is older than I understand,
 * here is what to do" instead of failing on a missing field. It changes
 * only when the *shape* changes — adding a table does not touch it,
 * because the header lists the tables the file actually contains.
 */

export const ARCHIVE_KIND = "afd-crm-archive";
export const ARCHIVE_VERSION = 1;

export interface ArchiveHeader {
  kind: typeof ARCHIVE_KIND;
  version: number;
  /** When the archive was taken, ISO 8601 UTC. */
  createdAt: string;
  /** The institute's name at the time, so a file on a disk identifies itself. */
  organisation: string | null;
  /** Which tables this file carries, in the order they must be restored. */
  tables: string[];
  /** Tables deliberately left out, so a reader knows they are missing rather than empty. */
  excluded: string[];
  /** What this archive does NOT contain. Stated in the file itself, not only in a document. */
  notIncluded: string[];
}

export interface ArchiveRow {
  /** Table name. */
  t: string;
  /** The row, column names exactly as Postgres returned them. */
  r: Record<string, unknown>;
}

/** What is missing from every archive, said in the file so it travels with it. */
export const NOT_INCLUDED = [
  "Sign-in accounts and passwords — these live in Supabase Auth, which no application code can export. Who existed and what they could do is archived (profiles, roles); their logins are not, so a restore means inviting people again.",
  "Uploaded files — student documents, photos and the organisation logo live in file storage, not the database. Download those separately if you need them.",
  "Operational logs — webhook deliveries, error history and scheduled-run history. These are about the running of the system, not the institute's records.",
];

export function buildHeader(input: {
  organisation: string | null;
  tables: string[];
  excluded: string[];
}): ArchiveHeader {
  return {
    kind: ARCHIVE_KIND,
    version: ARCHIVE_VERSION,
    createdAt: new Date().toISOString(),
    organisation: input.organisation,
    tables: input.tables,
    excluded: input.excluded,
    notIncluded: NOT_INCLUDED,
  };
}

/**
 * Reads a header back, refusing anything this code cannot honestly restore.
 *
 * Deliberately strict about `kind`: the likeliest wrong file is some
 * other gzipped JSON somebody had on the same disk, and restoring half
 * of it before noticing would be far worse than refusing it outright.
 */
export function parseHeader(line: string): { ok: true; header: ArchiveHeader } | { ok: false; error: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch {
    return { ok: false, error: "This file does not start with a readable archive header — it may not be an AFD CRM archive, or the download was incomplete." };
  }

  const header = parsed as Partial<ArchiveHeader>;
  if (header.kind !== ARCHIVE_KIND) {
    return { ok: false, error: "This is not an AFD CRM archive file." };
  }
  if (typeof header.version !== "number") {
    return { ok: false, error: "This archive has no version number, so it cannot be read safely." };
  }
  if (header.version > ARCHIVE_VERSION) {
    return {
      ok: false,
      error: `This archive was written by a newer version of the CRM (format ${header.version}; this one understands ${ARCHIVE_VERSION}). Restore it on a deployment at least as new as the one that made it.`,
    };
  }
  if (!Array.isArray(header.tables) || header.tables.length === 0) {
    return { ok: false, error: "This archive's header lists no tables." };
  }

  return { ok: true, header: { ...(header as ArchiveHeader) } };
}
