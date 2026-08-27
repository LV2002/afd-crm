/**
 * RLS test suite (docs/02-BUILD-PHASES.md, Session 3).
 *
 * Connects directly to Postgres (DATABASE_URL) and simulates exactly what
 * PostgREST does per request: `SET LOCAL ROLE authenticated` plus
 * `set_config('request.jwt.claims', ...)` so `auth.uid()` resolves to a
 * given user inside a transaction that is ALWAYS rolled back. This
 * exercises the real RLS policies and triggers with no live Supabase Auth
 * network calls required — the same technique used to hand-verify every
 * policy in Sessions 1 and 2, now automated.
 *
 * Requires DATABASE_URL (a Supabase project's Postgres connection string,
 * or a local Postgres) with all migrations and the seed applied:
 *
 *   npm run db:migrate && npm run db:seed && npm test
 *
 * Every fixture this file creates is cleaned up in afterAll, and swept up
 * defensively in beforeAll too, in case a previous run crashed mid-way. It
 * never touches the real seeded admin/co_admin/etc. rows outside of a
 * transaction that is guaranteed to roll back.
 */
import { randomUUID } from "node:crypto";
import { config as loadEnv } from "dotenv";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

loadEnv({ path: ".env" });
loadEnv({ path: ".env.local", override: true });

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  throw new Error(
    "DATABASE_URL is not set. Point it at your Supabase project's Postgres connection " +
      "string (or a local Postgres with migrations + seed applied) before running `npm test`.",
  );
}

/**
 * Unrestricted connection — whatever role DATABASE_URL authenticates as
 * (the Supabase project owner, or a local superuser). Used only for
 * fixture setup/teardown and for trigger-only assertions that must stay
 * isolated from any RLS policy decision.
 */
const owner = postgres(DATABASE_URL, { max: 5 });

const FIXTURE_MARK = "rls-spec.afd-crm.test";

function fixtureEmail(tag: string) {
  return `${tag}.${randomUUID().slice(0, 8)}@${FIXTURE_MARK}`;
}

type Reserved = Awaited<ReturnType<typeof owner.reserve>>;

/**
 * Runs `fn` as `authenticated`, with auth.uid() resolving to `userId` — the
 * same role-switch + JWT claim PostgREST performs per request. Always
 * rolls back: read assertions don't need to persist, and write-boundary
 * assertions must never persist regardless of whether the write was
 * (wrongly) allowed.
 */
async function asUser<T>(userId: string, fn: (tx: Reserved) => Promise<T>): Promise<T> {
  const reserved = await owner.reserve();
  try {
    await reserved`begin`;
    await reserved`set local role authenticated`;
    await reserved`select set_config('request.jwt.claims', ${JSON.stringify({
      sub: userId,
      role: "authenticated",
    })}, true)`;
    return await fn(reserved);
  } finally {
    await reserved`rollback`.catch(() => {});
    reserved.release();
  }
}

/** Same shape as asUser, but stays as the owner role — for trigger-only assertions. */
async function ownerTx<T>(fn: (tx: Reserved) => Promise<T>): Promise<T> {
  const reserved = await owner.reserve();
  try {
    await reserved`begin`;
    return await fn(reserved);
  } finally {
    await reserved`rollback`.catch(() => {});
    reserved.release();
  }
}

const ROLE_CODES = ["admin", "co_admin", "center_head", "counsellor", "accounts", "academics"] as const;

/** Config tables with a bare `select using (true)` policy — every role should see everything. */
const UNIVERSALLY_READABLE_TABLES = [
  "org_settings",
  "terminology",
  "centers",
  "permissions",
  "roles",
  "role_permissions",
  "dropdown_categories",
  "dropdown_options",
  "pipeline_stages",
  "field_definitions",
  "temperature_rules",
  "sla_policies",
  "business_hours",
  "holidays",
] as const;

let roleIds: Record<(typeof ROLE_CODES)[number], string>;
let centerIds: { kochi: string; kannur: string };

/** One fixture profile per seeded role, plus a second counsellor in a different centre. */
const fx = {
  admin_a: "",
  coadmin_a: "",
  centerhead_kochi: "",
  counsellor_kochi: "",
  counsellor_kannur: "",
  accounts_a: "",
  academics_a: "",
};
type FixtureKey = keyof typeof fx;

const FIXTURE_ROLE_OF: Record<FixtureKey, (typeof ROLE_CODES)[number]> = {
  admin_a: "admin",
  coadmin_a: "co_admin",
  centerhead_kochi: "center_head",
  counsellor_kochi: "counsellor",
  counsellor_kannur: "counsellor",
  accounts_a: "accounts",
  academics_a: "academics",
};

let auditFixtureId: string;

/**
 * Deletes auth.users rows matching `emailPattern`, EXCEPT one that would
 * otherwise become the last active `settings.manage='all'` holder in the
 * whole database — deleting that one would trip the very lockout
 * invariant this suite tests. On a database with no other real admin
 * (e.g. a fresh local Postgres where the seed's auth-user step was never
 * run), this deliberately leaves exactly one fixture admin behind; it's
 * swept up automatically by a later run once a real admin exists.
 */
async function safeDeleteFixtureUsers(emailPattern: string): Promise<void> {
  const candidates = await owner<Array<{ id: string; holds_settings_admin: boolean }>>`
    select
      u.id,
      exists (
        select 1 from profiles p
        join role_permissions rp on rp.role_id = p.role_id
        where p.id = u.id and p.is_active = true
          and rp.permission_code = 'settings.manage' and rp.scope = 'all'
      ) as holds_settings_admin
    from auth.users u
    where u.email like ${emailPattern}
  `;

  const [{ count: activeHolders }] = await owner<Array<{ count: number }>>`
    select count(*)::int as count from profiles p
    join role_permissions rp on rp.role_id = p.role_id
    where p.is_active = true and rp.permission_code = 'settings.manage' and rp.scope = 'all'
  `;

  let remaining = activeHolders;
  const toDelete: string[] = [];
  for (const c of candidates) {
    if (c.holds_settings_admin) {
      if (remaining > 1) {
        toDelete.push(c.id);
        remaining--;
      }
      // else: this is the last one -- skip it, leave it behind.
    } else {
      toDelete.push(c.id);
    }
  }

  if (toDelete.length > 0) {
    await owner`delete from auth.users where id = any(${toDelete}::uuid[])`;
  }
}

async function createFixtureProfile(roleCode: (typeof ROLE_CODES)[number], tag: string): Promise<string> {
  const id = randomUUID();
  const email = fixtureEmail(tag);
  await owner`insert into auth.users (id, email) values (${id}, ${email})`;
  await owner`
    insert into profiles (id, full_name, email, role_id, is_active)
    select ${id}, ${`RLS Test ${tag}`}, ${email}, id, true
    from roles where code = ${roleCode}
  `;
  return id;
}

beforeAll(async () => {
  // Defensive sweep in case a previous run crashed before cleaning up.
  await safeDeleteFixtureUsers("%@" + FIXTURE_MARK);
  await owner`delete from roles where code like 'rls\\_test\\_%' escape '\\'`;

  const centerRows = await owner<Array<{ id: string; name: string }>>`
    select id, name from centers where name in ('Kochi', 'Kannur')
  `;
  const kochi = centerRows.find((c) => c.name === "Kochi");
  const kannur = centerRows.find((c) => c.name === "Kannur");
  if (!kochi || !kannur) {
    throw new Error(
      "Expected centres 'Kochi' and 'Kannur' to exist — run `npm run db:seed` before `npm test`.",
    );
  }
  centerIds = { kochi: kochi.id, kannur: kannur.id };

  const roleRows = await owner<Array<{ id: string; code: string }>>`
    select id, code from roles where code = any(${ROLE_CODES}::text[])
  `;
  const foundCodes = new Set(roleRows.map((r) => r.code));
  const missing = ROLE_CODES.filter((c) => !foundCodes.has(c));
  if (missing.length > 0) {
    throw new Error(`Missing seeded roles: ${missing.join(", ")} — run \`npm run db:seed\` first.`);
  }
  roleIds = Object.fromEntries(roleRows.map((r) => [r.code, r.id])) as typeof roleIds;

  fx.admin_a = await createFixtureProfile("admin", "admin-a");
  fx.coadmin_a = await createFixtureProfile("co_admin", "coadmin-a");
  fx.centerhead_kochi = await createFixtureProfile("center_head", "centerhead-kochi");
  fx.counsellor_kochi = await createFixtureProfile("counsellor", "counsellor-kochi");
  fx.counsellor_kannur = await createFixtureProfile("counsellor", "counsellor-kannur");
  fx.accounts_a = await createFixtureProfile("accounts", "accounts-a");
  fx.academics_a = await createFixtureProfile("academics", "academics-a");

  await owner`insert into user_centers (user_id, center_id) values (${fx.centerhead_kochi}, ${centerIds.kochi})`;
  await owner`insert into user_centers (user_id, center_id) values (${fx.counsellor_kochi}, ${centerIds.kochi})`;
  await owner`insert into user_centers (user_id, center_id) values (${fx.counsellor_kannur}, ${centerIds.kannur})`;

  const [auditRow] = await owner<Array<{ id: string }>>`
    insert into audit_log (actor_id, action, entity_type)
    values (${fx.admin_a}, 'rls_test.marker', 'rls_test')
    returning id
  `;
  auditFixtureId = auditRow.id;
});

afterAll(async () => {
  await owner`delete from audit_log where entity_type = 'rls_test'`;
  await safeDeleteFixtureUsers("%@" + FIXTURE_MARK);
  await owner`delete from roles where code like 'rls\\_test\\_%' escape '\\'`;
  await owner.end();
});

describe("config tables are readable by every role (select using (true))", () => {
  it.each(Object.keys(fx) as FixtureKey[])("%s sees the same rows as an unrestricted query", async (key) => {
    for (const table of UNIVERSALLY_READABLE_TABLES) {
      const [{ count: ownerCount }] = await owner.unsafe<Array<{ count: number }>>(
        `select count(*)::int as count from ${table}`,
      );
      const roleCount = await asUser(fx[key], async (tx) => {
        const [{ count }] = await tx.unsafe<Array<{ count: number }>>(
          `select count(*)::int as count from ${table}`,
        );
        return count;
      });
      expect(roleCount, `${key} (${FIXTURE_ROLE_OF[key]}) vs ${table}`).toBe(ownerCount);
    }
  });
});

describe("profiles and user_centers are scoped by users.manage", () => {
  const fixtureIds = () => Object.values(fx);

  it("admin and co_admin (users.manage=all) see every fixture profile", async () => {
    for (const key of ["admin_a", "coadmin_a"] as const) {
      const rows = await asUser(fx[key], (tx) =>
        tx<Array<{ id: string }>>`select id from profiles where id = any(${fixtureIds()}::uuid[])`,
      );
      expect(rows.map((r) => r.id).sort()).toEqual([...fixtureIds()].sort());
    }
  });

  it("center_head (users.manage=center) sees only itself and profiles sharing its centre", async () => {
    const rows = await asUser(fx.centerhead_kochi, (tx) =>
      tx<Array<{ id: string }>>`select id from profiles where id = any(${fixtureIds()}::uuid[])`,
    );
    const ids = rows.map((r) => r.id);
    expect(ids).toContain(fx.centerhead_kochi);
    expect(ids).toContain(fx.counsellor_kochi);
    expect(ids).not.toContain(fx.counsellor_kannur);
    expect(ids).not.toContain(fx.accounts_a);
    expect(ids).not.toContain(fx.academics_a);
  });

  it("roles with no users.manage grant see only themselves", async () => {
    for (const key of ["counsellor_kochi", "counsellor_kannur", "accounts_a", "academics_a"] as const) {
      const rows = await asUser(fx[key], (tx) =>
        tx<Array<{ id: string }>>`select id from profiles where id = any(${fixtureIds()}::uuid[])`,
      );
      expect(rows.map((r) => r.id)).toEqual([fx[key]]);
    }
  });

  it("user_centers follows the same boundary", async () => {
    const centerHeadRows = await asUser(fx.centerhead_kochi, (tx) =>
      tx<Array<{ user_id: string }>>`select user_id from user_centers where user_id = any(${fixtureIds()}::uuid[])`,
    );
    const ids = centerHeadRows.map((r) => r.user_id);
    expect(ids).toContain(fx.centerhead_kochi);
    expect(ids).toContain(fx.counsellor_kochi);
    expect(ids).not.toContain(fx.counsellor_kannur);

    const counsellorRows = await asUser(fx.counsellor_kochi, (tx) =>
      tx<Array<{ user_id: string }>>`select user_id from user_centers where user_id = any(${fixtureIds()}::uuid[])`,
    );
    expect(counsellorRows.map((r) => r.user_id)).toEqual([fx.counsellor_kochi]);
  });
});

describe("audit_log is scoped by audit.read, and rejects UPDATE/DELETE outright", () => {
  it("holders of audit.read (admin, co_admin, center_head, accounts) can see the fixture row", async () => {
    for (const key of ["admin_a", "coadmin_a", "centerhead_kochi", "accounts_a"] as const) {
      const rows = await asUser(fx[key], (tx) =>
        tx<Array<{ id: string }>>`select id from audit_log where id = ${auditFixtureId}`,
      );
      expect(rows, key).toHaveLength(1);
    }
  });

  it("roles without audit.read (counsellor, academics) cannot see it", async () => {
    for (const key of ["counsellor_kochi", "academics_a"] as const) {
      const rows = await asUser(fx[key], (tx) =>
        tx<Array<{ id: string }>>`select id from audit_log where id = ${auditFixtureId}`,
      );
      expect(rows, key).toHaveLength(0);
    }
  });

  it("every authenticated user can INSERT into audit_log, regardless of audit.read", async () => {
    // No `.returning()` here deliberately: Postgres checks a table's SELECT
    // policy against rows returned by INSERT ... RETURNING, so a counsellor
    // (no audit.read) inserting-and-returning would fail even though the
    // insert itself is allowed for everyone. See docs/DECISIONS.md and the
    // same caveat documented on src/lib/audit/log.ts's writeAuditLog().
    //
    // asUser() always rolls back, so there's nothing to verify by reading
    // the row back afterwards — the assertion here IS that the INSERT
    // statement itself doesn't throw an RLS violation.
    await expect(
      asUser(
        fx.counsellor_kochi,
        (tx) => tx`
          insert into audit_log (actor_id, action, entity_type)
          values (${fx.counsellor_kochi}, 'rls_test.insert_check', 'rls_test')
        `,
      ),
    ).resolves.not.toThrow();
  });

  it("no one can UPDATE audit_log, not even admin", async () => {
    const updated = await asUser(fx.admin_a, (tx) =>
      tx<Array<{ id: string }>>`
        update audit_log set action = 'tampered' where id = ${auditFixtureId} returning id
      `,
    );
    expect(updated).toHaveLength(0);
  });

  it("no one can DELETE from audit_log, not even admin", async () => {
    const deleted = await asUser(fx.admin_a, (tx) =>
      tx<Array<{ id: string }>>`delete from audit_log where id = ${auditFixtureId} returning id`,
    );
    expect(deleted).toHaveLength(0);
  });
});

describe("a runtime-created role gets exactly the RLS boundary it was granted", () => {
  let dynamicRoleId: string;
  let dynamicUserId: string;

  beforeAll(async () => {
    const [role] = await owner<Array<{ id: string }>>`
      insert into roles (code, name, description)
      values ('rls_test_dynamic', 'RLS Test Dynamic', 'Created at runtime by tests/rls.spec.ts')
      returning id
    `;
    dynamicRoleId = role.id;
    await owner`insert into role_permissions (role_id, permission_code, scope) values (${dynamicRoleId}, 'report.read', 'own')`;
    dynamicUserId = await createFixtureProfileForRoleId(dynamicRoleId, "dynamic");
  });

  afterAll(async () => {
    await owner`delete from auth.users where id = ${dynamicUserId}`; // cascades the profile
    await owner`delete from roles where id = ${dynamicRoleId}`; // cascades role_permissions
  });

  async function createFixtureProfileForRoleId(roleId: string, tag: string): Promise<string> {
    const id = randomUUID();
    const email = fixtureEmail(tag);
    await owner`insert into auth.users (id, email) values (${id}, ${email})`;
    await owner`insert into profiles (id, full_name, email, role_id, is_active) values (${id}, ${`RLS Test ${tag}`}, ${email}, ${roleId}, true)`;
    return id;
  }

  it("holds report.read at scope 'own', and nothing it wasn't granted", async () => {
    const [row] = await asUser(dynamicUserId, (tx) =>
      tx<Array<{ report: string | null; settings: string | null; roles: string | null }>>`
        select
          auth_scope('report.read') as report,
          auth_scope('settings.manage') as settings,
          auth_scope('roles.manage') as roles
      `,
    );
    expect(row.report).toBe("own");
    expect(row.settings).toBeNull();
    expect(row.roles).toBeNull();
  });

  it("can still read config tables like every other role", async () => {
    const [row] = await asUser(dynamicUserId, (tx) =>
      tx<Array<{ count: number }>>`select count(*)::int as count from centers`,
    );
    expect(row.count).toBeGreaterThan(0);
  });

  it("cannot update org_settings", async () => {
    const updated = await asUser(dynamicUserId, (tx) =>
      tx<Array<{ id: string }>>`update org_settings set name = 'hijacked' returning id`,
    );
    expect(updated).toHaveLength(0);
  });

  it("cannot insert a new centre", async () => {
    await expect(
      asUser(dynamicUserId, (tx) => tx`insert into centers (name, city) values ('Should fail', 'Nowhere')`),
    ).rejects.toThrow(/row-level security/);
  });

  it("cannot promote itself by editing its own role_id", async () => {
    const updated = await asUser(dynamicUserId, (tx) =>
      tx<Array<{ id: string }>>`
        update profiles set role_id = ${roleIds.admin} where id = ${dynamicUserId} returning id
      `,
    );
    expect(updated).toHaveLength(0);
  });
});

describe("lockout protection triggers", () => {
  it("the protected admin role cannot be deleted", async () => {
    await expect(ownerTx((tx) => tx`delete from roles where code = 'admin'`)).rejects.toThrow(
      /protected role cannot be deleted/,
    );
  });

  it("the protected admin role cannot be un-protected", async () => {
    await expect(
      ownerTx((tx) => tx`update roles set is_protected = false where code = 'admin'`),
    ).rejects.toThrow(/cannot be un-protected/);
  });

  it("permissions cannot be stripped from the protected admin role", async () => {
    await expect(
      ownerTx(
        (tx) => tx`
          delete from role_permissions
          where role_id = (select id from roles where code = 'admin') and permission_code = 'settings.manage'
        `,
      ),
    ).rejects.toThrow(/cannot be removed/);
  });

  it("permissions cannot be narrowed on the protected admin role, but a no-op re-assert of the same scope is allowed", async () => {
    await expect(
      ownerTx(
        (tx) => tx`
          update role_permissions set scope = 'center'
          where role_id = (select id from roles where code = 'admin') and permission_code = 'settings.manage'
        `,
      ),
    ).rejects.toThrow(/cannot be narrowed/);

    // A no-op re-upsert (same scope) must NOT be rejected -- this is what
    // makes db:seed idempotent. See migrations/0006_fix_protect_admin_role_permissions_idempotency.sql.
    await ownerTx(
      (tx) => tx`
        update role_permissions set scope = 'all'
        where role_id = (select id from roles where code = 'admin') and permission_code = 'settings.manage'
      `,
    );
  });

  it("deactivating the last active settings.manage=all holder is rejected", async () => {
    await expect(
      ownerTx(async (tx) => {
        const holders = await tx<Array<{ id: string }>>`
          select distinct p.id from profiles p
          join role_permissions rp on rp.role_id = p.role_id
          where p.is_active = true and rp.permission_code = 'settings.manage' and rp.scope = 'all'
        `;
        expect(holders.length).toBeGreaterThan(0); // sanity: the seeded admin should already hold this

        const fixtureId = randomUUID();
        const email = fixtureEmail("lockout-holder");
        await tx`insert into auth.users (id, email) values (${fixtureId}, ${email})`;
        await tx`
          insert into profiles (id, full_name, email, role_id, is_active)
          select ${fixtureId}, 'RLS Test Lockout Holder', ${email}, id, true from roles where code = 'admin'
        `;

        // Deactivating every OTHER holder is fine while our fixture is still active.
        const otherIds = holders.map((h) => h.id);
        await tx`update profiles set is_active = false where id = any(${otherIds}::uuid[])`;

        // Deactivating the very last one must be rejected.
        await tx`update profiles set is_active = false where id = ${fixtureId}`;
        await tx`set constraints settings_admin_invariant_profiles immediate`;
      }),
    ).rejects.toThrow(/at least one active user must hold settings\.manage/);
    // ownerTx always rolls back, so the real admin/co_admin rows are untouched.
  });

  it("stripping settings.manage from the last role that grants it is also rejected", async () => {
    await expect(
      ownerTx(async (tx) => {
        const fixtureId = randomUUID();
        const email = fixtureEmail("lockout-coadmin");
        await tx`insert into auth.users (id, email) values (${fixtureId}, ${email})`;
        await tx`
          insert into profiles (id, full_name, email, role_id, is_active)
          select ${fixtureId}, 'RLS Test Co-admin Holder', ${email}, id, true from roles where code = 'co_admin'
        `;

        const others = await tx<Array<{ id: string }>>`
          select distinct p.id from profiles p
          join role_permissions rp on rp.role_id = p.role_id
          where p.is_active = true and rp.permission_code = 'settings.manage' and rp.scope = 'all'
            and p.id <> ${fixtureId}
        `;
        if (others.length > 0) {
          await tx`update profiles set is_active = false where id = any(${others.map((o) => o.id)}::uuid[])`;
        }

        // Our fixture's co_admin role is now the sole active path to
        // settings.manage=all — stripping the grant itself must be rejected.
        await tx`
          delete from role_permissions
          where role_id = (select id from roles where code = 'co_admin') and permission_code = 'settings.manage'
        `;
        await tx`set constraints settings_admin_invariant_role_permissions immediate`;
      }),
    ).rejects.toThrow(/at least one active user must hold settings\.manage/);
  });
});

/**
 * Phase 4 ("Fees, enrolment, payments, handoff") hasn't shipped — the
 * `payments`/`receipts` append-only-ledger tables described in
 * docs/01-DATA-MODEL.md § Financial ledger don't exist in this schema yet,
 * so "reject UPDATE and DELETE for every role including admin" can't be
 * asserted against a real table. See docs/DECISIONS.md.
 *
 * The shape below is written against the exact columns the data model doc
 * specifies, so unskipping it once migration + RLS for those tables land
 * should need no rewrite — just delete `.skip`.
 */
describe.skip("payments and receipts are an append-only ledger (Phase 4 — not built yet)", () => {
  it("rejects UPDATE for every role, including admin", async () => {
    // const updated = await asUser(fx.admin_a, (tx) =>
    //   tx`update payments set amount_paise = 0 returning id`,
    // );
    // expect(updated).toHaveLength(0);
  });

  it("rejects DELETE for every role, including admin", async () => {
    // const deleted = await asUser(fx.admin_a, (tx) => tx`delete from payments returning id`);
    // expect(deleted).toHaveLength(0);
    // same shape again for `receipts`.
  });
});
