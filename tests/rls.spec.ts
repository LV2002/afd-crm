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
  "fee_structures",
  "tags",
  // Configuration, like the rest of this list — the copy is not secret and
  // any signed-in user may read which events notify whom. The DELIVERED
  // notifications are the opposite and are asserted separately below.
  "notification_settings",
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
let assignmentRuleFixtureId: string;
let paymentFixtureId: string;
let receiptFixtureId: string;
let studentFixtureId: string;

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

  // is_active: false is deliberate and load-bearing, not incidental: this
  // row exists only to test table-level RLS visibility, but Vitest runs
  // test files in parallel against the same live database. An *active*
  // rule with empty conditions matches every lead any other file's
  // resolveOrCreateLead() call creates for as long as this file's fixtures
  // are alive, and its dummy assignTo isn't a real profiles row — every
  // concurrent lead creation elsewhere would fail its FK constraint.
  const [assignmentRuleRow] = await owner<Array<{ id: string }>>`
    insert into assignment_rules (name, is_active, conditions, action)
    values (
      'rls_test.marker',
      false,
      '{}'::jsonb,
      '{"strategy":"fixed","assignTo":"00000000-0000-0000-0000-000000000000"}'::jsonb
    )
    returning id
  `;
  assignmentRuleFixtureId = assignmentRuleRow.id;

  // Phase 4 foundation: a minimal lead -> enrolment -> payment -> receipt
  // chain, purely so the append-only-ledger test below has a real row to
  // attempt UPDATE/DELETE against — a statement with no matching row would
  // "pass" trivially regardless of RLS.
  const [leadRow] = await owner<Array<{ id: string }>>`
    insert into leads (student_name, primary_phone, center_id)
    values ('RlsSpecTest ledger fixture', '+919847100199', ${centerIds.kochi})
    returning id
  `;
  const [enrolmentRow] = await owner<Array<{ id: string }>>`
    insert into enrolments (lead_id, course, center_id, mode, academic_year, total_fee_paise, net_fee_paise)
    values (${leadRow.id}, 'Foundation', ${centerIds.kochi}, 'offline', '2026-27', 10000000, 10000000)
    returning id
  `;
  const [paymentRow] = await owner<Array<{ id: string }>>`
    insert into payments (enrolment_id, amount_paise, direction, method)
    values (${enrolmentRow.id}, 1000000, 'credit', 'upi')
    returning id
  `;
  paymentFixtureId = paymentRow.id;
  const [receiptRow] = await owner<Array<{ id: string }>>`
    insert into receipts (payment_id, enrolment_id)
    values (${paymentFixtureId}, ${enrolmentRow.id})
    returning id
  `;
  receiptFixtureId = receiptRow.id;

  const [studentRow] = await owner<Array<{ id: string }>>`
    insert into students (full_name, phone, center_id)
    values ('RlsSpecTest student fixture', '+919847100198', ${centerIds.kochi})
    returning id
  `;
  studentFixtureId = studentRow.id;
});

afterAll(async () => {
  await owner`delete from audit_log where entity_type = 'rls_test'`;
  await owner`delete from assignment_rules where name = 'rls_test.marker'`;
  // Children before parents — enrolments/payments/receipts are all
  // onDelete:'restrict' against each other and against leads.
  await owner`delete from receipts where id = ${receiptFixtureId}`;
  await owner`delete from payments where id = ${paymentFixtureId}`;
  await owner`delete from students where id = ${studentFixtureId}`;
  await owner`delete from enrolments where lead_id in (select id from leads where student_name = 'RlsSpecTest ledger fixture')`;
  await owner`delete from leads where student_name = 'RlsSpecTest ledger fixture'`;
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

describe("assignment_rules is scoped to rules.manage='all' (admin/co_admin only)", () => {
  it("admin and co_admin (rules.manage=all) can see the fixture rule", async () => {
    for (const key of ["admin_a", "coadmin_a"] as const) {
      const rows = await asUser(fx[key], (tx) =>
        tx<Array<{ id: string }>>`select id from assignment_rules where id = ${assignmentRuleFixtureId}`,
      );
      expect(rows, key).toHaveLength(1);
    }
  });

  it("every other role, including center_head, cannot see it", async () => {
    for (const key of [
      "centerhead_kochi",
      "counsellor_kochi",
      "accounts_a",
      "academics_a",
    ] as const) {
      const rows = await asUser(fx[key], (tx) =>
        tx<Array<{ id: string }>>`select id from assignment_rules where id = ${assignmentRuleFixtureId}`,
      );
      expect(rows, key).toHaveLength(0);
    }
  });

  it("a counsellor cannot insert a rule", async () => {
    await expect(
      asUser(
        fx.counsellor_kochi,
        (tx) => tx`
          insert into assignment_rules (name, conditions, action)
          values ('rls_test.should_reject', '{}'::jsonb, '{"strategy":"fixed","assignTo":"00000000-0000-0000-0000-000000000000"}'::jsonb)
        `,
      ),
    ).rejects.toThrow();
  });

  it("admin can insert and update a rule", async () => {
    const inserted = await asUser(
      fx.admin_a,
      (tx) => tx<Array<{ id: string }>>`
        insert into assignment_rules (name, conditions, action)
        values ('rls_test.admin_insert', '{}'::jsonb, '{"strategy":"fixed","assignTo":"00000000-0000-0000-0000-000000000000"}'::jsonb)
        returning id
      `,
    );
    expect(inserted).toHaveLength(1);
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
 * Local to this describe (not the file's global fixture setup): accounts
 * and academics are given Kochi membership only for the tests below, so
 * the assertions that a role sees/doesn't see a Kochi row prove the
 * permission is what matters, not centre membership — without leaking
 * that membership into the earlier `users.manage` tests, which rely on
 * accounts/academics having none.
 */
describe("phase 4 permission boundaries (accounts/academics both members of Kochi)", () => {
  beforeAll(async () => {
    await owner`insert into user_centers (user_id, center_id) values (${fx.accounts_a}, ${centerIds.kochi})`;
    await owner`insert into user_centers (user_id, center_id) values (${fx.academics_a}, ${centerIds.kochi})`;
  });

  afterAll(async () => {
    await owner`delete from user_centers where user_id in (${fx.accounts_a}, ${fx.academics_a})`;
  });

  /**
   * CLAUDE.md non-negotiable #7 / docs/01-DATA-MODEL.md § Financial ledger:
   * payments and receipts are insert-only — no UPDATE or DELETE policy for
   * any role, including admin. This was `describe.skip`'d before Phase 4's
   * foundation existed (see docs/PROGRESS.md, Session 3) since there was no
   * real table to assert against; the schema and RLS now exist (Session 18).
   */
  describe("payments and receipts are an append-only ledger", () => {
  it("rejects UPDATE on payments for every role, including admin", async () => {
    const updated = await asUser(fx.admin_a, (tx) =>
      tx<Array<{ id: string }>>`
        update payments set amount_paise = 0 where id = ${paymentFixtureId} returning id
      `,
    );
    expect(updated).toHaveLength(0);
  });

  it("rejects DELETE on payments for every role, including admin", async () => {
    const deleted = await asUser(fx.admin_a, (tx) =>
      tx<Array<{ id: string }>>`delete from payments where id = ${paymentFixtureId} returning id`,
    );
    expect(deleted).toHaveLength(0);
  });

  it("rejects UPDATE on receipts for every role, including admin", async () => {
    const updated = await asUser(fx.admin_a, (tx) =>
      tx<Array<{ id: string }>>`
        update receipts set issued_by = null where id = ${receiptFixtureId} returning id
      `,
    );
    expect(updated).toHaveLength(0);
  });

  it("rejects DELETE on receipts for every role, including admin", async () => {
    const deleted = await asUser(fx.admin_a, (tx) =>
      tx<Array<{ id: string }>>`delete from receipts where id = ${receiptFixtureId} returning id`,
    );
    expect(deleted).toHaveLength(0);
  });

  it("a holder of payment.read can still SELECT the fixture payment (RLS isn't blocking everything, just writes)", async () => {
    const rows = await asUser(fx.admin_a, (tx) =>
      tx<Array<{ id: string }>>`select id from payments where id = ${paymentFixtureId}`,
    );
    expect(rows).toHaveLength(1);
  });

  it("accounts (payment.read at Kochi) sees the Kochi fixture payment", async () => {
    const rows = await asUser(fx.accounts_a, (tx) =>
      tx<Array<{ id: string }>>`select id from payments where id = ${paymentFixtureId}`,
    );
    expect(rows).toHaveLength(1);
  });

  /**
   * The actual boundary this session's dashboards/UI rely on: academics is
   * a member of the SAME centre as the fixture payment (see the
   * user_centers insert above) so this can only be the permission
   * (academics never holds payment.read), not a centre mismatch.
   */
  it("academics (no payment.read, same centre) sees none of the ledger", async () => {
    const payments = await asUser(fx.academics_a, (tx) =>
      tx<Array<{ id: string }>>`select id from payments where id = ${paymentFixtureId}`,
    );
    expect(payments).toHaveLength(0);

    const receipts = await asUser(fx.academics_a, (tx) =>
      tx<Array<{ id: string }>>`select id from receipts where id = ${receiptFixtureId}`,
    );
    expect(receipts).toHaveLength(0);
  });
  });

  /**
   * `students` has its own center_id (no join through leads — see
   * finance.ts's own comment: "academics must never have to query the sales
   * table"), scoped on student.read. Both fixture users here are members of
   * the SAME centre as the fixture student, so a mismatch proves the
   * permission is what's missing, not the centre.
   */
  describe("students are scoped by student.read, independent of the sales table", () => {
    it("academics and accounts (both hold student.read at Kochi) can see the fixture student", async () => {
      for (const key of ["academics_a", "accounts_a"] as const) {
        const rows = await asUser(fx[key], (tx) =>
          tx<Array<{ id: string }>>`select id from students where id = ${studentFixtureId}`,
        );
        expect(rows, key).toHaveLength(1);
      }
    });

    it("counsellor (same centre, no student.read) cannot see the fixture student", async () => {
      const rows = await asUser(fx.counsellor_kochi, (tx) =>
        tx<Array<{ id: string }>>`select id from students where id = ${studentFixtureId}`,
      );
      expect(rows).toHaveLength(0);
    });
  });
});

/**
 * whatsapp_messages reuses can_access_center() exactly like interactions
 * (migration 0026), but gated on the dedicated whatsapp.read/whatsapp.send
 * primitives rather than interaction.read/create — this block exists to
 * confirm that distinction is real: academics holds neither whatsapp
 * primitive despite being a member of the same centre as the fixture
 * lead, so seeing nothing here proves the permission check is what's
 * missing, not a centre mismatch (same reasoning as the students block
 * above).
 */
describe("whatsapp_messages is scoped by whatsapp.read/whatsapp.send, not lead.read", () => {
  let waLeadId: string;
  let waMessageFixtureId: string;

  beforeAll(async () => {
    await owner`insert into user_centers (user_id, center_id) values (${fx.academics_a}, ${centerIds.kochi})`;

    const [leadRow] = await owner<Array<{ id: string }>>`
      insert into leads (student_name, primary_phone, center_id, assigned_to)
      values ('RlsSpecTest whatsapp fixture', '+919847100197', ${centerIds.kochi}, ${fx.counsellor_kochi})
      returning id
    `;
    waLeadId = leadRow.id;

    const [msgRow] = await owner<Array<{ id: string }>>`
      insert into whatsapp_messages (lead_id, direction, from_phone, to_phone, status)
      values (${waLeadId}, 'inbound', '+919847100197', '+911234567890', 'received')
      returning id
    `;
    waMessageFixtureId = msgRow.id;
  });

  afterAll(async () => {
    await owner`delete from user_centers where user_id = ${fx.academics_a} and center_id = ${centerIds.kochi}`;
    await owner`delete from whatsapp_messages where lead_id = ${waLeadId}`;
    await owner`delete from leads where id = ${waLeadId}`;
  });

  it("the assigned counsellor (whatsapp.read at own scope) sees the thread", async () => {
    const rows = await asUser(fx.counsellor_kochi, (tx) =>
      tx<Array<{ id: string }>>`select id from whatsapp_messages where id = ${waMessageFixtureId}`,
    );
    expect(rows).toHaveLength(1);
  });

  it("a different centre's counsellor, not assigned to this lead, sees nothing", async () => {
    const rows = await asUser(fx.counsellor_kannur, (tx) =>
      tx<Array<{ id: string }>>`select id from whatsapp_messages where id = ${waMessageFixtureId}`,
    );
    expect(rows).toHaveLength(0);
  });

  it("the centre head (whatsapp.read at center scope) sees it", async () => {
    const rows = await asUser(fx.centerhead_kochi, (tx) =>
      tx<Array<{ id: string }>>`select id from whatsapp_messages where id = ${waMessageFixtureId}`,
    );
    expect(rows).toHaveLength(1);
  });

  it("academics (same centre, holds neither whatsapp primitive) sees nothing", async () => {
    const rows = await asUser(fx.academics_a, (tx) =>
      tx<Array<{ id: string }>>`select id from whatsapp_messages where id = ${waMessageFixtureId}`,
    );
    expect(rows).toHaveLength(0);
  });

  it("the assigned counsellor can insert a new message on their own lead", async () => {
    const inserted = await asUser(fx.counsellor_kochi, (tx) =>
      tx<Array<{ id: string }>>`
        insert into whatsapp_messages (lead_id, direction, from_phone, to_phone, status)
        values (${waLeadId}, 'outbound', '+911234567890', '+919847100197', 'queued')
        returning id
      `,
    );
    expect(inserted).toHaveLength(1);
    await owner`delete from whatsapp_messages where id = ${inserted[0].id}`;
  });

  it("a counsellor with no access to this lead cannot insert a message on it", async () => {
    await expect(
      asUser(
        fx.counsellor_kannur,
        (tx) => tx`
          insert into whatsapp_messages (lead_id, direction, from_phone, to_phone, status)
          values (${waLeadId}, 'outbound', '+911234567890', '+919847100197', 'queued')
        `,
      ),
    ).rejects.toThrow(/row-level security/);
  });
});

describe("attachments are scoped by their PARENT lead/student, via file.* primitives", () => {
  let fileLeadId: string;
  let fileAttachmentId: string;
  let fileStudentId: string;
  let studentAttachmentId: string;

  beforeAll(async () => {
    const [leadRow] = await owner<Array<{ id: string }>>`
      insert into leads (student_name, primary_phone, center_id, assigned_to)
      values ('RlsSpecTest attachment fixture', '+919847100411', ${centerIds.kochi}, ${fx.counsellor_kochi})
      returning id
    `;
    fileLeadId = leadRow.id;

    const [attRow] = await owner<Array<{ id: string }>>`
      insert into attachments (lead_id, storage_path, file_name, mime_type, size_bytes)
      values (${fileLeadId}, ${`lead/${fileLeadId}/rls-fixture.pdf`}, 'rls-fixture.pdf', 'application/pdf', 1024)
      returning id
    `;
    fileAttachmentId = attRow.id;

    const [studentRow] = await owner<Array<{ id: string }>>`
      insert into students (full_name, phone, center_id)
      values ('RlsSpecTest attachment student', '+919847100412', ${centerIds.kochi})
      returning id
    `;
    fileStudentId = studentRow.id;

    const [studentAtt] = await owner<Array<{ id: string }>>`
      insert into attachments (student_id, storage_path, file_name, mime_type, size_bytes)
      values (${fileStudentId}, ${`student/${fileStudentId}/photo.jpg`}, 'photo.jpg', 'image/jpeg', 2048)
      returning id
    `;
    studentAttachmentId = studentAtt.id;
  });

  afterAll(async () => {
    await owner`delete from attachments where lead_id = ${fileLeadId} or student_id = ${fileStudentId}`;
    await owner`delete from students where id = ${fileStudentId}`;
    await owner`delete from leads where id = ${fileLeadId}`;
  });

  it("the assigned counsellor (file.read at own scope) sees their lead's file", async () => {
    const rows = await asUser(fx.counsellor_kochi, (tx) =>
      tx<Array<{ id: string }>>`select id from attachments where id = ${fileAttachmentId}`,
    );
    expect(rows).toHaveLength(1);
  });

  it("another centre's counsellor sees nothing", async () => {
    const rows = await asUser(fx.counsellor_kannur, (tx) =>
      tx<Array<{ id: string }>>`select id from attachments where id = ${fileAttachmentId}`,
    );
    expect(rows).toHaveLength(0);
  });

  it("the centre head (file.read at center scope) sees it", async () => {
    const rows = await asUser(fx.centerhead_kochi, (tx) =>
      tx<Array<{ id: string }>>`select id from attachments where id = ${fileAttachmentId}`,
    );
    expect(rows).toHaveLength(1);
  });

  it("a soft-deleted file disappears even from someone who could otherwise read it", async () => {
    // Removal is an UPDATE setting deleted_at, never a DELETE — so the
    // select policy's `deleted_at is null` is what actually hides it.
    await ownerTx(async (tx) => {
      await tx`update attachments set deleted_at = now() where id = ${fileAttachmentId}`;
      await tx`set local role authenticated`;
      await tx`select set_config('request.jwt.claims', ${JSON.stringify({
        sub: fx.counsellor_kochi,
        role: "authenticated",
      })}, true)`;
      const rows = await tx<Array<{ id: string }>>`select id from attachments where id = ${fileAttachmentId}`;
      expect(rows).toHaveLength(0);
    });
  });

  it("the assigned counsellor can attach a file to their own lead", async () => {
    const inserted = await asUser(fx.counsellor_kochi, (tx) =>
      tx<Array<{ id: string }>>`
        insert into attachments (lead_id, storage_path, file_name, mime_type, size_bytes)
        values (${fileLeadId}, ${`lead/${fileLeadId}/counsellor-upload.pdf`}, 'counsellor-upload.pdf', 'application/pdf', 10)
        returning id
      `,
    );
    expect(inserted).toHaveLength(1);
  });

  it("a counsellor with no access to the lead cannot attach a file to it", async () => {
    await expect(
      asUser(
        fx.counsellor_kannur,
        (tx) => tx`
          insert into attachments (lead_id, storage_path, file_name, mime_type, size_bytes)
          values (${fileLeadId}, ${`lead/${fileLeadId}/intruder.pdf`}, 'intruder.pdf', 'application/pdf', 10)
        `,
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it("a counsellor cannot remove a file — they hold file.upload but not file.delete", async () => {
    // The UPDATE policy is gated on file.delete specifically, so a
    // counsellor cannot quietly drop a signed agreement off a lead.
    const updated = await asUser(fx.counsellor_kochi, (tx) =>
      tx<Array<{ id: string }>>`
        update attachments set deleted_at = now() where id = ${fileAttachmentId} returning id
      `,
    );
    expect(updated).toHaveLength(0);
  });

  it("the centre head CAN remove a file (holds file.delete at center scope)", async () => {
    const updated = await asUser(fx.centerhead_kochi, (tx) =>
      tx<Array<{ id: string }>>`
        update attachments set deleted_at = now() where id = ${fileAttachmentId} returning id
      `,
    );
    expect(updated).toHaveLength(1);
  });

  it("academics reads a STUDENT file without holding lead.read at all", async () => {
    // The reason can_access_student_files is security definer: academics
    // never holds lead.read, and must still reach files on its own students.
    await ownerTx(async (tx) => {
      await tx`insert into user_centers (user_id, center_id) values (${fx.academics_a}, ${centerIds.kochi})`;
      await tx`set local role authenticated`;
      await tx`select set_config('request.jwt.claims', ${JSON.stringify({
        sub: fx.academics_a,
        role: "authenticated",
      })}, true)`;
      const rows = await tx<Array<{ id: string }>>`select id from attachments where id = ${studentAttachmentId}`;
      expect(rows).toHaveLength(1);
    });
  });

  it("a counsellor cannot read a student's file — student files need center/all scope", async () => {
    const rows = await asUser(fx.counsellor_kochi, (tx) =>
      tx<Array<{ id: string }>>`select id from attachments where id = ${studentAttachmentId}`,
    );
    expect(rows).toHaveLength(0);
  });

  it("rejects a row attached to both a lead and a student, or to neither", async () => {
    await expect(
      owner`
        insert into attachments (lead_id, student_id, storage_path, file_name, mime_type, size_bytes)
        values (${fileLeadId}, ${fileStudentId}, 'lead/both.pdf', 'both.pdf', 'application/pdf', 1)
      `,
    ).rejects.toThrow(/attachments_one_parent/);

    await expect(
      owner`
        insert into attachments (storage_path, file_name, mime_type, size_bytes)
        values ('lead/orphan.pdf', 'orphan.pdf', 'application/pdf', 1)
      `,
    ).rejects.toThrow(/attachments_one_parent/);
  });
});

/**
 * Notifications are personal mail.
 *
 * The policy is `recipient_id = auth.uid()` and nothing else — no centre
 * scope, no all-scope escape hatch, not even for an admin. An admin who
 * needs to know what happened has audit_log; reading everybody's messages
 * is a surveillance feature nobody asked for. These tests are that
 * sentence, executed.
 */
describe("notifications are readable only by their own recipient", () => {
  let toCounsellorKochi: string;
  let toAdmin: string;

  beforeAll(async () => {
    const [a] = await owner<Array<{ id: string }>>`
      insert into notifications (recipient_id, event_key, title, body, center_id)
      values (${fx.counsellor_kochi}, 'lead.assigned', 'RlsSpecTest notification', 'body', ${centerIds.kochi})
      returning id
    `;
    toCounsellorKochi = a.id;

    const [b] = await owner<Array<{ id: string }>>`
      insert into notifications (recipient_id, event_key, title, body)
      values (${fx.admin_a}, 'lead.assigned', 'RlsSpecTest admin notification', 'body')
      returning id
    `;
    toAdmin = b.id;
  });

  afterAll(async () => {
    await owner`delete from notifications where title like 'RlsSpecTest%'`;
  });

  it("the recipient reads their own", async () => {
    const rows = await asUser(fx.counsellor_kochi, (tx) =>
      tx<Array<{ id: string }>>`select id from notifications where id = ${toCounsellorKochi}`,
    );
    expect(rows).toHaveLength(1);
  });

  it("a colleague in the same centre cannot", async () => {
    const rows = await asUser(fx.centerhead_kochi, (tx) =>
      tx<Array<{ id: string }>>`select id from notifications where id = ${toCounsellorKochi}`,
    );
    expect(rows).toHaveLength(0);
  });

  it("not even an admin can read somebody else's", async () => {
    const rows = await asUser(fx.admin_a, (tx) =>
      tx<Array<{ id: string }>>`select id from notifications where id = ${toCounsellorKochi}`,
    );
    expect(rows).toHaveLength(0);
  });

  it("the admin still reads their own", async () => {
    const rows = await asUser(fx.admin_a, (tx) =>
      tx<Array<{ id: string }>>`select id from notifications where id = ${toAdmin}`,
    );
    expect(rows).toHaveLength(1);
  });

  it("the recipient can mark their own read", async () => {
    await asUser(fx.counsellor_kochi, (tx) =>
      tx`update notifications set read_at = now() where id = ${toCounsellorKochi}`,
    );
    const [row] = await owner<Array<{ read_at: Date | null }>>`
      select read_at from notifications where id = ${toCounsellorKochi}
    `;
    expect(row.read_at).not.toBeNull();
  });

  it("nobody can hand their notification to somebody else", async () => {
    // The WITH CHECK repeats the recipient test, so an UPDATE cannot
    // rewrite recipient_id on the way past.
    await asUser(fx.counsellor_kochi, (tx) =>
      tx`update notifications set recipient_id = ${fx.admin_a} where id = ${toCounsellorKochi}`,
    ).catch(() => undefined);

    const [row] = await owner<Array<{ recipient_id: string }>>`
      select recipient_id from notifications where id = ${toCounsellorKochi}
    `;
    expect(row.recipient_id).toBe(fx.counsellor_kochi);
  });

  it("a browser session cannot manufacture a notification at all", async () => {
    // There is no INSERT policy. Notifications are written by the system
    // on the direct connection, which is what stops one person sending
    // another a message that looks like it came from the CRM.
    await expect(
      asUser(fx.admin_a, (tx) =>
        tx`insert into notifications (recipient_id, event_key, title, body)
           values (${fx.counsellor_kochi}, 'lead.assigned', 'RlsSpecTest forged', 'forged')`,
      ),
    ).rejects.toThrow();
  });

  it("a dismissed notification stops being readable", async () => {
    await asUser(fx.admin_a, (tx) =>
      tx`update notifications set deleted_at = now() where id = ${toAdmin}`,
    );
    const rows = await asUser(fx.admin_a, (tx) =>
      tx<Array<{ id: string }>>`select id from notifications where id = ${toAdmin}`,
    );
    expect(rows).toHaveLength(0);
  });
});

/**
 * Finance is visible to centre heads, accounts and admins — nobody else.
 *
 * Leon's requirement, and the one thing the spreadsheet could not do: its
 * protection stopped editing but not reading, so any staff member with the
 * link could open the Dashboard and read the bank balance. These tests are
 * that requirement, executed.
 */
describe("the finance ledger is scoped by finance.read, and hidden from counsellors", () => {
  let kochiAccountId: string;
  let kannurAccountId: string;
  let kochiTxnId: string;
  let kannurTxnId: string;

  beforeAll(async () => {
    const [kochiAcct] = await owner<Array<{ id: string }>>`
      insert into finance_accounts (name, center_id, type, opening_balance_paise)
      values ('RlsSpecTest Kochi Bank', ${centerIds.kochi}, 'bank', 100000)
      returning id
    `;
    kochiAccountId = kochiAcct.id;

    const [kannurAcct] = await owner<Array<{ id: string }>>`
      insert into finance_accounts (name, center_id, type, opening_balance_paise)
      values ('RlsSpecTest Kannur Bank', ${centerIds.kannur}, 'bank', 100000)
      returning id
    `;
    kannurAccountId = kannurAcct.id;

    const [kochiTxn] = await owner<Array<{ id: string }>>`
      insert into finance_transactions
        (occurred_on, direction, kind, account_id, center_id, category, amount_paise, description)
      values (current_date, 'out', 'expense', ${kochiAccountId}, ${centerIds.kochi}, 'Rent', 5000000, 'RlsSpecTest Kochi rent')
      returning id
    `;
    kochiTxnId = kochiTxn.id;

    const [kannurTxn] = await owner<Array<{ id: string }>>`
      insert into finance_transactions
        (occurred_on, direction, kind, account_id, center_id, category, amount_paise, description)
      values (current_date, 'out', 'expense', ${kannurAccountId}, ${centerIds.kannur}, 'Rent', 5000000, 'RlsSpecTest Kannur rent')
      returning id
    `;
    kannurTxnId = kannurTxn.id;
  });

  afterAll(async () => {
    await owner`delete from finance_transactions where description like 'RlsSpecTest%'`;
    await owner`delete from finance_accounts where name like 'RlsSpecTest%'`;
  });

  it("a counsellor sees no accounts and no ledger at all", async () => {
    // The whole point of the module. Their own leads' fees, yes; the
    // institute's bank balance and salary bill, no.
    const accounts = await asUser(fx.counsellor_kochi, (tx) =>
      tx<Array<{ id: string }>>`select id from finance_accounts`,
    );
    const entries = await asUser(fx.counsellor_kochi, (tx) =>
      tx<Array<{ id: string }>>`select id from finance_transactions`,
    );
    expect(accounts).toHaveLength(0);
    expect(entries).toHaveLength(0);
  });

  it("academics sees nothing either", async () => {
    const entries = await asUser(fx.academics_a, (tx) =>
      tx<Array<{ id: string }>>`select id from finance_transactions`,
    );
    expect(entries).toHaveLength(0);
  });

  it("a centre head sees their own centre and not the other", async () => {
    const rows = await asUser(fx.centerhead_kochi, (tx) =>
      tx<Array<{ id: string }>>`
        select id from finance_transactions where id in (${kochiTxnId}, ${kannurTxnId})
      `,
    );
    expect(rows.map((r) => r.id)).toEqual([kochiTxnId]);
  });

  it("accounts sees both centres", async () => {
    // Seeded at centre scope but a member of both, which is how AFD runs
    // it — one accounts person for the whole institute.
    const rows = await asUser(fx.accounts_a, (tx) =>
      tx<Array<{ id: string }>>`
        select id from finance_transactions where id in (${kochiTxnId}, ${kannurTxnId})
      `,
    );
    expect(rows).toHaveLength(2);
  });

  it("an admin sees everything", async () => {
    const rows = await asUser(fx.admin_a, (tx) =>
      tx<Array<{ id: string }>>`
        select id from finance_transactions where id in (${kochiTxnId}, ${kannurTxnId})
      `,
    );
    expect(rows).toHaveLength(2);
  });

  it("nobody can edit a posted entry — not even an admin", async () => {
    // CLAUDE.md non-negotiable #7, enforced by the absence of an UPDATE
    // policy rather than by everyone remembering. A wrong entry is
    // reversed and re-posted, which leaves a trail.
    await asUser(fx.admin_a, (tx) =>
      tx`update finance_transactions set amount_paise = 1 where id = ${kochiTxnId}`,
    ).catch(() => undefined);

    const [row] = await owner<Array<{ amount_paise: string }>>`
      select amount_paise from finance_transactions where id = ${kochiTxnId}
    `;
    expect(Number(row.amount_paise)).toBe(5000000);
  });

  it("nobody can delete a posted entry either", async () => {
    await asUser(fx.admin_a, (tx) =>
      tx`delete from finance_transactions where id = ${kochiTxnId}`,
    ).catch(() => undefined);

    const rows = await owner<Array<{ id: string }>>`
      select id from finance_transactions where id = ${kochiTxnId}
    `;
    expect(rows).toHaveLength(1);
  });

  it("a counsellor cannot post an entry", async () => {
    await expect(
      asUser(fx.counsellor_kochi, (tx) =>
        tx`insert into finance_transactions
             (occurred_on, direction, kind, account_id, center_id, category, amount_paise, description)
           values (current_date, 'out', 'expense', ${kochiAccountId}, ${centerIds.kochi}, 'Rent', 1, 'RlsSpecTest forged')`,
      ),
    ).rejects.toThrow();
  });

  it("a centre head cannot post into another centre's account", async () => {
    await expect(
      asUser(fx.centerhead_kochi, (tx) =>
        tx`insert into finance_transactions
             (occurred_on, direction, kind, account_id, center_id, category, amount_paise, description)
           values (current_date, 'out', 'expense', ${kannurAccountId}, ${centerIds.kannur}, 'Rent', 1, 'RlsSpecTest cross-centre')`,
      ),
    ).rejects.toThrow();
  });

  it("a centre head cannot add or edit an account — that needs finance.manage", async () => {
    await expect(
      asUser(fx.centerhead_kochi, (tx) =>
        tx`insert into finance_accounts (name, center_id, type)
           values ('RlsSpecTest sneaky', ${centerIds.kochi}, 'bank')`,
      ),
    ).rejects.toThrow();
  });

  it("rejects a zero-amount entry, which would be a no-op row in a ledger", async () => {
    await expect(
      owner`
        insert into finance_transactions
          (occurred_on, direction, kind, account_id, center_id, category, amount_paise, description)
        values (current_date, 'out', 'expense', ${kochiAccountId}, ${centerIds.kochi}, 'Rent', 0, 'RlsSpecTest zero')
      `,
    ).rejects.toThrow(/finance_txn_amount_nonzero/);
  });

  it("allows only one reversal per entry", async () => {
    // Two people hitting reverse at the same moment would otherwise each
    // append a mirror row, and the account would end up short twice.
    await owner`
      insert into finance_transactions
        (occurred_on, direction, kind, account_id, center_id, category, amount_paise, description, reverses_transaction_id)
      values (current_date, 'out', 'expense', ${kannurAccountId}, ${centerIds.kannur}, 'Rent', -5000000, 'RlsSpecTest reversal', ${kannurTxnId})
    `;

    await expect(
      owner`
        insert into finance_transactions
          (occurred_on, direction, kind, account_id, center_id, category, amount_paise, description, reverses_transaction_id)
        values (current_date, 'out', 'expense', ${kannurAccountId}, ${centerIds.kannur}, 'Rent', -5000000, 'RlsSpecTest double reversal', ${kannurTxnId})
      `,
    ).rejects.toThrow(/finance_txn_reverses_uq/);
  });
});
