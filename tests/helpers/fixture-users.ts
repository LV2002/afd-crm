import { randomUUID } from "node:crypto";

import postgres from "postgres";

/**
 * Throwaway logins for a test, so it never depends on who happens to be in
 * the database. A fresh CI database has only the seed; a developer's has
 * whatever earlier runs left behind. Each user gets a profile with the named
 * role, and `cleanup()` removes them again.
 *
 * Only use roles that do not hold `settings.manage`: deleting the last such
 * person is refused by the lockout trigger, by design.
 */
export async function createTestUsers(roleCodes: string[]): Promise<{ ids: string[]; cleanup: () => Promise<void> }> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set.");
  const sql = postgres(url, { max: 1 });
  const ids: string[] = [];
  try {
    for (const code of roleCodes) {
      const id = randomUUID();
      const email = `${code}.${id.slice(0, 8)}@fixture.afd-crm.test`;
      await sql`insert into auth.users (id, email) values (${id}, ${email})`;
      const inserted = await sql`
        insert into profiles (id, full_name, email, role_id, is_active)
        select ${id}, ${`Fixture ${code}`}, ${email}, r.id, true from roles r where r.code = ${code}
        returning id`;
      if (inserted.length === 0) throw new Error(`There is no role "${code}" in the test database.`);
      ids.push(id);
    }
  } finally {
    await sql.end();
  }
  return {
    ids,
    cleanup: async () => {
      const again = postgres(url, { max: 1 });
      try {
        await again`delete from auth.users where id = any(${ids}::uuid[])`;
      } finally {
        await again.end();
      }
    },
  };
}
