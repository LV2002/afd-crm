import "server-only";

import { sql } from "drizzle-orm";

import { db } from "@/lib/db/client";

import type { FieldEntity } from "./get-field-schema";

/**
 * How many people have answered one custom field.
 *
 * Asked before a field's *type* is changed. A type is the promise that
 * every stored value has a particular shape, so changing it while answers
 * exist turns them into values nothing knows how to read — a `url` holding
 * "https://…" reinterpreted as a `file` is a document that does not exist,
 * and a `text` holding "about four years" reinterpreted as a `number` is a
 * field that throws on every read.
 *
 * ## Why the direct client and not the caller's
 *
 * This is deliberately NOT scoped to what the caller can see. A co-admin
 * with `settings.manage` but centre scope would get zero for a field forty
 * people in the other centre have answered, and take that as permission to
 * change the type — losing exactly the answers they could not see. A count
 * is not a disclosure: no row, no name and no value comes back, only a
 * number, and the caller has already been checked for `settings.manage`.
 *
 * An answer means a value that is actually there. A key present with an
 * empty string is what a blank form submission leaves behind and is not
 * something anybody would mind losing.
 */
export async function countFieldAnswers(entity: FieldEntity, key: string): Promise<number> {
  switch (entity) {
    case "lead": {
      const rows = await db.execute<{ n: number }>(sql`
        select count(*)::int as n from leads
        where deleted_at is null and coalesce(custom ->> ${key}, '') <> ''
      `);
      return rows[0]?.n ?? 0;
    }

    case "student": {
      // Two homes, because a student field is asked in two places: on the
      // student's own record, and on the profile form the student fills in
      // themselves before a `students` row exists at all.
      const rows = await db.execute<{ n: number }>(sql`
        select
          (select count(*) from students
             where deleted_at is null and coalesce(custom ->> ${key}, '') <> '')
          + (select count(*) from leads
             where deleted_at is null and coalesce(profile_form_data ->> ${key}, '') <> '')
          as n
      `);
      return Number(rows[0]?.n ?? 0);
    }

    case "enrolment":
      // `enrolments` has no `custom` column, so an enrolment field has
      // nowhere to store an answer and cannot have one. Stated rather than
      // assumed: if that column is ever added, this returns the wrong
      // number and the type change it allows loses data.
      return 0;
  }
}
