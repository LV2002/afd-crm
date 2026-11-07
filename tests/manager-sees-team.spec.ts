/**
 * A manager who may open a counsellor's numbers (report.center) must be able
 * to see that counsellor's profile, with or without user administration.
 * Simulates PostgREST per request, in transactions that are rolled back.
 */
import { config as loadEnv } from "dotenv";
import postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";

loadEnv({ path: ".env" });
loadEnv({ path: ".env.local", override: true });
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set.");

import { createTestUsers } from "./helpers/fixture-users";

const owner = postgres(process.env.DATABASE_URL, { max: 2 });
let cleanup: (() => Promise<void>) | undefined;
afterAll(async () => {
  await cleanup?.();
  await owner.end();
});

describe("seeing the team", () => {
  it("lets a centre-scoped report holder without users.manage see counsellors at their centre only", async () => {
    const made = await createTestUsers(["counsellor", "counsellor", "counsellor"]);
    cleanup = made.cleanup;
    const [manager, mine, theirs] = made.ids;

    const tx = await owner.reserve();
    try {
      await tx`begin`;
      const [role] = await tx<Array<{ id: string }>>`insert into roles (code, name) values ('tmp_manager', 'Tmp manager') returning id`;
      await tx`insert into role_permissions (role_id, permission_code, scope) values (${role.id}, 'report.center', 'center')`;
      await tx`update profiles set role_id = ${role.id} where id = ${manager}`;
      const [c1] = await tx<Array<{ id: string }>>`insert into centers (name, city) values ('TmpMgr A', 'x') returning id`;
      const [c2] = await tx<Array<{ id: string }>>`insert into centers (name, city) values ('TmpMgr B', 'x') returning id`;
      await tx`insert into user_centers (user_id, center_id) values (${manager}, ${c1.id}), (${mine}, ${c1.id}), (${theirs}, ${c2.id})`;

      await tx`set local role authenticated`;
      await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: manager, role: "authenticated" })}, true)`;
      const rows = await tx<Array<{ id: string }>>`select id from profiles where id in (${mine}, ${theirs})`;
      expect(rows.map((r) => r.id)).toEqual([mine]);
    } finally {
      await tx`rollback`.catch(() => {});
      tx.release();
    }
  });
});
