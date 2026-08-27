/**
 * Integration tests for applyAssignment()/dryRunRule() — needs a real
 * database with migrations + seed applied (same DATABASE_URL as
 * tests/rls.spec.ts and tests/identity-resolve.spec.ts):
 *
 *   npm run db:migrate && npm run db:seed && npm test
 *
 * Runs through the shared Drizzle `db` client directly (not RLS-bound —
 * same rationale as resolveOrCreateLead(), which is the actual entry point
 * these tests exercise for the "create" trigger path). RLS on
 * assignment_rules/assignment_history is covered separately in
 * tests/rls.spec.ts.
 */
import { randomUUID } from "node:crypto";
import { config as loadEnv } from "dotenv";
import { eq, inArray, like } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

loadEnv({ path: ".env" });
loadEnv({ path: ".env.local", override: true });

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set — see the file header for how to run this suite.");
}

const { db } = await import("../src/lib/db/client");
const { assignmentHistory, assignmentRules, authUsers, leads, profiles, roles } = await import(
  "../src/lib/db/schema"
);
const { dryRunRule } = await import("../src/lib/assignment/apply-assignment");
const { resolveOrCreateLead } = await import("../src/lib/identity/resolve-or-create-lead");

const MARKER = "AssignTest";
const FIXTURE_EMAIL_DOMAIN = "assign-test.afd-crm.test";

function testName(tag: string) {
  return `${MARKER} ${tag} ${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

const userIds: Record<"active1" | "active2" | "inactive" | "fallback", string> = {
  active1: "",
  active2: "",
  inactive: "",
  fallback: "",
};

async function createFixtureUser(tag: string, isActive: boolean, roleId: string) {
  const id = randomUUID();
  await db.insert(authUsers).values({ id });
  await db.insert(profiles).values({
    id,
    fullName: `${MARKER} ${tag}`,
    email: `${tag}.${id.slice(0, 8)}@${FIXTURE_EMAIL_DOMAIN}`,
    roleId,
    isActive,
  });
  return id;
}

async function sweepFixtures() {
  // FK cascades clean up lead_identifiers/enquiries/assignment_history when
  // the lead row goes; assignment_rules and the fixture profiles are swept
  // independently since nothing cascades into them.
  await db.delete(leads).where(like(leads.studentName, `${MARKER}%`));
  await db.delete(assignmentRules).where(like(assignmentRules.name, `${MARKER}%`));

  const fixtureProfiles = await db
    .select({ id: profiles.id })
    .from(profiles)
    .where(like(profiles.email, `%@${FIXTURE_EMAIL_DOMAIN}`));
  if (fixtureProfiles.length > 0) {
    const ids = fixtureProfiles.map((p) => p.id);
    await db.delete(profiles).where(inArray(profiles.id, ids));
    await db.delete(authUsers).where(inArray(authUsers.id, ids));
  }
}

beforeAll(async () => {
  await sweepFixtures(); // in case a previous run crashed before cleaning up

  const [role] = await db.select({ id: roles.id }).from(roles).where(eq(roles.code, "counsellor")).limit(1);
  if (!role) {
    throw new Error("Expected a seeded 'counsellor' role — run `npm run db:seed` before `npm test`.");
  }

  userIds.active1 = await createFixtureUser("active1", true, role.id);
  userIds.active2 = await createFixtureUser("active2", true, role.id);
  userIds.inactive = await createFixtureUser("inactive", false, role.id);
  userIds.fallback = await createFixtureUser("fallback", true, role.id);
});

afterAll(async () => {
  await sweepFixtures();
});

type NewRule = typeof assignmentRules.$inferInsert;

/** Inserts a fixture rule, runs `fn`, then always removes the rule again. */
async function withRule<T>(values: NewRule, fn: (ruleId: string) => Promise<T>): Promise<T> {
  const [rule] = await db.insert(assignmentRules).values(values).returning({ id: assignmentRules.id });
  try {
    return await fn(rule.id);
  } finally {
    await db.delete(assignmentRules).where(eq(assignmentRules.id, rule.id));
  }
}

describe("applyAssignment, wired through resolveOrCreateLead()", () => {
  it("a fixed-strategy rule assigns the named user and writes assignment_history", async () => {
    await withRule(
      {
        name: testName("fixed"),
        priority: 1,
        conditions: { all: [{ field: "district", op: "equals", value: "AssignTestFixedDistrict" }] },
        action: { strategy: "fixed", assignTo: userIds.active1 },
      },
      async (ruleId) => {
        const result = await resolveOrCreateLead({
          studentName: testName("fixed-lead"),
          primaryPhone: "9847200001",
          source: "Website",
          district: "AssignTestFixedDistrict",
        });

        const [lead] = await db.select().from(leads).where(eq(leads.id, result.leadId));
        expect(lead.assignedTo).toBe(userIds.active1);

        const history = await db
          .select()
          .from(assignmentHistory)
          .where(eq(assignmentHistory.leadId, result.leadId));
        expect(history).toHaveLength(1);
        expect(history[0].ruleId).toBe(ruleId);
        expect(history[0].toUser).toBe(userIds.active1);
        expect(history[0].fromUser).toBeNull();
        expect(history[0].reason).toBe("rule");
      },
    );
  });

  it("evaluates rules in ascending priority order — a specific rule wins over a lower-priority catch-all", async () => {
    await withRule(
      {
        name: testName("catchall"),
        priority: 100,
        conditions: {},
        action: { strategy: "fixed", assignTo: userIds.fallback },
      },
      () =>
        withRule(
          {
            name: testName("specific"),
            priority: 1,
            conditions: {
              all: [{ field: "district", op: "equals", value: "AssignTestPriorityDistrict" }],
            },
            action: { strategy: "fixed", assignTo: userIds.active1 },
          },
          async () => {
            const specific = await resolveOrCreateLead({
              studentName: testName("priority-specific"),
              primaryPhone: "9847200002",
              source: "Website",
              district: "AssignTestPriorityDistrict",
            });
            const other = await resolveOrCreateLead({
              studentName: testName("priority-other"),
              primaryPhone: "9847200003",
              source: "Website",
              district: "AssignTestSomewhereElse",
            });

            const [specificLead] = await db.select().from(leads).where(eq(leads.id, specific.leadId));
            const [otherLead] = await db.select().from(leads).where(eq(leads.id, other.leadId));
            expect(specificLead.assignedTo).toBe(userIds.active1);
            expect(otherLead.assignedTo).toBe(userIds.fallback);
          },
        ),
    );
  });

  it("round_robin skips an inactive user and persists the rotation cursor across calls", async () => {
    await withRule(
      {
        name: testName("rr"),
        priority: 1,
        conditions: { all: [{ field: "district", op: "equals", value: "AssignTestRRDistrict" }] },
        action: {
          strategy: "round_robin",
          userIds: [userIds.active1, userIds.inactive, userIds.active2],
          cursor: 0,
        },
      },
      async (ruleId) => {
        const first = await resolveOrCreateLead({
          studentName: testName("rr-1"),
          primaryPhone: "9847200004",
          source: "Website",
          district: "AssignTestRRDistrict",
        });
        const second = await resolveOrCreateLead({
          studentName: testName("rr-2"),
          primaryPhone: "9847200005",
          source: "Website",
          district: "AssignTestRRDistrict",
        });

        const [leadA] = await db.select().from(leads).where(eq(leads.id, first.leadId));
        const [leadB] = await db.select().from(leads).where(eq(leads.id, second.leadId));

        expect(leadA.assignedTo).toBe(userIds.active1);
        // the inactive middle slot is never handed a lead
        expect(leadB.assignedTo).toBe(userIds.active2);

        const [rule] = await db.select().from(assignmentRules).where(eq(assignmentRules.id, ruleId));
        expect((rule.action as { cursor?: number }).cursor).toBe(0); // wrapped back to the start
      },
    );
  });

  it("a round_robin rule whose entire list is inactive is skipped, falling through to the next rule", async () => {
    await withRule(
      {
        name: testName("rr-all-inactive"),
        priority: 1,
        conditions: {
          all: [{ field: "district", op: "equals", value: "AssignTestAllInactiveDistrict" }],
        },
        action: { strategy: "round_robin", userIds: [userIds.inactive], cursor: 0 },
      },
      () =>
        withRule(
          {
            name: testName("rr-fallback"),
            priority: 2,
            conditions: {
              all: [{ field: "district", op: "equals", value: "AssignTestAllInactiveDistrict" }],
            },
            action: { strategy: "fixed", assignTo: userIds.fallback },
          },
          async (fallbackRuleId) => {
            const result = await resolveOrCreateLead({
              studentName: testName("rr-all-inactive-lead"),
              primaryPhone: "9847200006",
              source: "Website",
              district: "AssignTestAllInactiveDistrict",
            });
            const [lead] = await db.select().from(leads).where(eq(leads.id, result.leadId));
            expect(lead.assignedTo).toBe(userIds.fallback);

            const [history] = await db
              .select()
              .from(assignmentHistory)
              .where(eq(assignmentHistory.leadId, result.leadId));
            expect(history.ruleId).toBe(fallbackRuleId);
            expect(history.reason).toBe("rule");
          },
        ),
    );
  });

  it("a lead matching no active rule is left unassigned, with no assignment_history row", async () => {
    const result = await resolveOrCreateLead({
      studentName: testName("no-match"),
      primaryPhone: "9847200007",
      source: "Website",
      district: "AssignTestNoMatchDistrict",
    });
    const [lead] = await db.select().from(leads).where(eq(leads.id, result.leadId));
    expect(lead.assignedTo).toBeNull();

    const history = await db
      .select()
      .from(assignmentHistory)
      .where(eq(assignmentHistory.leadId, result.leadId));
    expect(history).toHaveLength(0);
  });

  it("an explicit assignedTo at creation is respected, never overridden by a matching rule", async () => {
    await withRule(
      {
        name: testName("respect-manual"),
        priority: 1,
        conditions: { all: [{ field: "district", op: "equals", value: "AssignTestManualDistrict" }] },
        action: { strategy: "fixed", assignTo: userIds.active1 },
      },
      async () => {
        const result = await resolveOrCreateLead({
          studentName: testName("manual-lead"),
          primaryPhone: "9847200008",
          source: "Website",
          district: "AssignTestManualDistrict",
          assignedTo: userIds.fallback,
        });
        const [lead] = await db.select().from(leads).where(eq(leads.id, result.leadId));
        expect(lead.assignedTo).toBe(userIds.fallback);

        const history = await db
          .select()
          .from(assignmentHistory)
          .where(eq(assignmentHistory.leadId, result.leadId));
        expect(history).toHaveLength(0);
      },
    );
  });

  it("an inactive rule and a rule not applicable to 'create' are both ignored", async () => {
    await withRule(
      {
        name: testName("inactive-rule"),
        priority: 1,
        isActive: false,
        conditions: {},
        action: { strategy: "fixed", assignTo: userIds.active1 },
      },
      () =>
        withRule(
          {
            name: testName("update-only-rule"),
            priority: 2,
            appliesOn: ["update"],
            conditions: {},
            action: { strategy: "fixed", assignTo: userIds.active2 },
          },
          async () => {
            const result = await resolveOrCreateLead({
              studentName: testName("ignored-rules-lead"),
              primaryPhone: "9847200009",
              source: "Website",
            });
            const [lead] = await db.select().from(leads).where(eq(leads.id, result.leadId));
            expect(lead.assignedTo).toBeNull();
          },
        ),
    );
  });
});

describe("dryRunRule", () => {
  it("counts matches against existing leads without mutating anything", async () => {
    const district = "AssignTestDryRunDistrict";
    const a = await resolveOrCreateLead({
      studentName: testName("dryrun-a"),
      primaryPhone: "9847200010",
      source: "Website",
      district,
    });
    const b = await resolveOrCreateLead({
      studentName: testName("dryrun-b"),
      primaryPhone: "9847200011",
      source: "Website",
      district,
    });
    await resolveOrCreateLead({
      studentName: testName("dryrun-c"),
      primaryPhone: "9847200012",
      source: "Website",
      district: "AssignTestSomewhereElseEntirely",
    });

    const result = await dryRunRule({ all: [{ field: "district", op: "equals", value: district }] });
    expect(result.matched).toBeGreaterThanOrEqual(2);

    // read-only: neither lead got touched by the dry run
    const [leadA] = await db.select().from(leads).where(eq(leads.id, a.leadId));
    const [leadB] = await db.select().from(leads).where(eq(leads.id, b.leadId));
    expect(leadA.assignedTo).toBeNull();
    expect(leadB.assignedTo).toBeNull();
  });
});
