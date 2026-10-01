/**
 * Every field marked as a real column must actually have one.
 *
 * `is_core` is a claim about the database: "this field's value lives in a
 * column of the same name". Everything else lives in the entity's `custom`
 * jsonb. Nothing checked the claim, and twenty-two student fields made it
 * falsely — City, Photo, Mother Name, Percentage 10th and eighteen more —
 * because the seed defaulted `isCore` to true and only eleven student rows
 * said otherwise.
 *
 * It was not a cosmetic mismatch. Saving a student sent
 * `update students set city = …, photo_url = …` and Postgres rejected the
 * whole statement, so the edit form could not save ANY field; reading one
 * looked for a column that was not in the select and showed every such
 * field blank; and the settings screen froze their type, because a core
 * field's type is the shape of a column.
 *
 * This is the check that would have caught all of it in a second.
 *
 *   npm run db:migrate && npm run db:seed && npm test
 */
import { config as loadEnv } from "dotenv";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

loadEnv({ path: ".env" });
loadEnv({ path: ".env.local", override: true });

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set — see the file header.");

const { db } = await import("../src/lib/db/client");
const { fieldColumn } = await import("../src/lib/fields/field-column");

/** Which table an entity's core values live in. */
const TABLE: Record<string, string> = {
  lead: "leads",
  student: "students",
  enrolment: "enrolments",
};

async function columnsOf(table: string): Promise<Set<string>> {
  const rows = await db.execute<{ column_name: string }>(sql`
    select column_name from information_schema.columns
    where table_schema = 'public' and table_name = ${table}
  `);
  return new Set(rows.map((row) => row.column_name));
}

async function coreFields(): Promise<Array<{ entity: string; key: string }>> {
  return db.execute<{ entity: string; key: string }>(sql`
    select entity, key from field_definitions
    where is_core and deleted_at is null
    order by entity, key
  `);
}

describe("core field definitions", () => {
  it("every one resolves to a column that exists", async () => {
    const fields = await coreFields();
    expect(fields.length).toBeGreaterThan(0);

    const columns = new Map<string, Set<string>>();
    for (const entity of Object.keys(TABLE)) {
      columns.set(entity, await columnsOf(TABLE[entity]));
    }

    // `fieldColumn` is in the path because two lead fields are deliberately
    // named differently from their column (`lead_source` →
    // `last_touch_source`). A field that only works through an override
    // still works; one with no column at all does not.
    const broken = fields.filter((field) => {
      const available = columns.get(field.entity);
      if (!available) return true;
      return !available.has(fieldColumn(field.key));
    });

    expect(
      broken.map((field) => `${field.entity}.${field.key}`),
      "these fields claim a column that does not exist — they belong in `custom` (is_core false)",
    ).toEqual([]);
  });

  it("knows a table for every entity that has core fields", async () => {
    // A new entity added without a row here would make the check above pass
    // vacuously, which is the worst kind of green.
    const fields = await coreFields();
    for (const field of fields) {
      expect(TABLE[field.entity], `no table mapped for entity "${field.entity}"`).toBeTruthy();
    }
  });
});

describe("the student Photo question", () => {
  it("is a file upload, not a web address", async () => {
    // The field that surfaced the bug. A "Photo" question asking a
    // sixteen-year-old on a phone to paste a URL was never going to be
    // answered — see migration 0075.
    const [row] = await db.execute<{ type: string; is_core: boolean; on_profile_form: boolean }>(sql`
      select type, is_core, on_profile_form from field_definitions
      where entity = 'student' and key = 'photo_url'
    `);

    expect(row).toBeDefined();
    expect(row.type).toBe("file");
    expect(row.is_core).toBe(false);
    // And it is worth asking the student for, which was the one good reason
    // it was kept off the form before.
    expect(row.on_profile_form).toBe(true);
  });
});
