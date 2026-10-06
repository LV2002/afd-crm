/**
 * Does a row survive the archive?
 *
 * The export reads `select *`, writes each row as JSON, and the restore
 * parses it back and inserts it with a runtime column list. Every type
 * Postgres has goes through `JSON.stringify` on the way out and arrives
 * as a plain JavaScript value on the way back — jsonb becomes an object,
 * a text[] becomes an array, a timestamptz becomes a string, a bigint
 * becomes a string, and nulls have to stay null rather than becoming the
 * word "null".
 *
 * None of that is checked by the type system, and all of it fails
 * silently: a restore that writes the string "[object Object]" into a
 * jsonb column succeeds. So this takes real rows out of the real schema,
 * puts them through the real round trip, and compares.
 *
 *   npm run db:migrate && npm test
 */
import { config as loadEnv } from "dotenv";
import { afterAll, describe, expect, it } from "vitest";

loadEnv({ path: ".env" });
loadEnv({ path: ".env.local", override: true });

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set — see the file header for how to run this suite.");
}

const { sqlClient } = await import("../src/lib/db/client");
const { archiveLines } = await import("../src/lib/backup/export");
const { parseHeader, ARCHIVE_KIND } = await import("../src/lib/backup/format");
const { restoreArchive, jsonColumns, prepareRow } = await import("../src/lib/backup/import");

const SCRATCH = "archive_roundtrip_scratch";

afterAll(async () => {
  await sqlClient`drop table if exists ${sqlClient(SCRATCH)}`;
});

/** The archive's exact journey for one row: select * → JSON → parse. */
function throughTheFile(row: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(JSON.stringify({ t: "x", r: row })).r as Record<string, unknown>;
}

describe("a row survives select * → JSON → insert", () => {
  it("keeps jsonb, arrays, timestamps, numerics and nulls", async () => {
    // A table shaped like the awkward parts of the real schema, rather
    // than a table of strings that would prove nothing.
    await sqlClient`drop table if exists ${sqlClient(SCRATCH)}`;
    await sqlClient`
      create table ${sqlClient(SCRATCH)} (
        id uuid primary key,
        name text,
        nothing text,
        tags text[],
        config jsonb,
        amount_paise bigint,
        probability numeric(5,2),
        is_on boolean,
        happened_at timestamptz,
        on_day date,
        counter bigserial
      )
    `;

    const original = {
      id: "11111111-1111-4111-8111-111111111111",
      name: "Aleena D'Souza — “quoted”, ₹1,200",
      nothing: null,
      tags: ["nid", "nift_ug"],
      config: { all: [{ field: "source", op: "equals", value: "meta_ads" }], nested: { n: 1 } },
      amount_paise: "120000",
      probability: "42.50",
      is_on: true,
      happened_at: "2026-10-05T09:30:00.000Z",
      on_day: "2026-10-05",
    };

    // The fixture goes in through the same helper, because a plain
    // object bound to a jsonb column is rejected by the driver — which
    // is the bug this whole test exists to pin down.
    await sqlClient`insert into ${sqlClient(SCRATCH)} ${sqlClient(
      prepareRow(original, await jsonColumns(SCRATCH)) as never,
      ...(Object.keys(original) as never[]),
    )}`;

    const [read] = await sqlClient<Array<Record<string, unknown>>>`
      select * from ${sqlClient(SCRATCH)}
    `;
    const carried = throughTheFile(read);

    // Re-inserted through the restore's own helpers, not a lookalike —
    // the bug this test exists for lives in exactly that conversion.
    const columns = Object.keys(carried);
    const jsonCols = await jsonColumns(SCRATCH);
    const second = prepareRow(
      { ...carried, id: "22222222-2222-4222-8222-222222222222" },
      jsonCols,
    );
    await sqlClient`insert into ${sqlClient(SCRATCH)} ${sqlClient(
      second as never,
      ...(columns as never[]),
    )}`;

    const [before, after] = await sqlClient<Array<Record<string, unknown>>>`
      select * from ${sqlClient(SCRATCH)} order by id
    `;

    // Everything but the id must be identical. If jsonb arrived as a
    // string, or the array as "{nid,nift_ug}", or the null as "null",
    // this is where it shows.
    for (const column of columns) {
      if (column === "id") continue;
      expect(after[column], `column ${column} did not survive the round trip`).toEqual(
        before[column],
      );
    }
    expect(after.config).toEqual(original.config);
    expect(after.tags).toEqual(original.tags);
    expect(after.nothing).toBeNull();
  });
});

describe("the archive a download produces", () => {
  it("starts with a header that parses, and lists its tables", async () => {
    const lines: string[] = [];
    for await (const line of archiveLines()) {
      lines.push(line);
      if (lines.length > 50) break;
    }
    expect(lines.length).toBeGreaterThan(0);

    const header = parseHeader(lines[0]);
    expect(header.ok).toBe(true);
    if (!header.ok) return;
    expect(header.header.kind).toBe(ARCHIVE_KIND);
    expect(header.header.tables).toContain("leads");
    // The file says what it does not contain, so a disk copy carries its
    // own caveats rather than relying on a document somebody still has.
    expect(header.header.notIncluded.join(" ")).toMatch(/Supabase Auth|passwords/i);
  });

  it("writes every row as its own parseable line", async () => {
    let checked = 0;
    for await (const line of archiveLines()) {
      expect(() => JSON.parse(line)).not.toThrow();
      if (++checked > 40) break;
    }
    expect(checked).toBeGreaterThan(1);
  });
});

describe("restoring", () => {
  it("refuses a file that is not an archive", async () => {
    const result = await restoreArchive('{"hello":"world"}\n');
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/not an AFD CRM archive/i);
  });

  it("refuses an archive from a newer format", async () => {
    const result = await restoreArchive(
      `${JSON.stringify({ kind: ARCHIVE_KIND, version: 99, tables: ["leads"] })}\n`,
    );
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/newer version/i);
  });

  it("names the line when one is corrupt, rather than failing vaguely", async () => {
    const header = JSON.stringify({ kind: ARCHIVE_KIND, version: 1, tables: ["leads"] });
    const result = await restoreArchive(`${header}\n{"t":"leads","r":{}}\nnot json at all\n`);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/Line 3/);
  });

  it("refuses to write into a database that already has data", async () => {
    // The safety rule, against the real (seeded, populated) test database.
    // A merge would silently overwrite whatever has happened since the
    // archive was taken, and nobody can reason about that mid-recovery.
    const header = JSON.stringify({ kind: ARCHIVE_KIND, version: 1, tables: ["leads"] });
    const result = await restoreArchive(`${header}\n`);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/already has data/i);
    expect(result.error).toMatch(/empty database/i);
  });
});
