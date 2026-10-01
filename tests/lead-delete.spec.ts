/**
 * Deleting a lead, and the two things that must stay true about it.
 *
 * First: there is no hard delete. A lead is the root of its enquiries,
 * interactions, tasks, files and audit trail, so dropping the row would drop
 * the record of a person the institute talked to — CLAUDE.md
 * non-negotiable #5. Migration 0074 removes the DELETE policy that used to
 * sit on `leads` unused.
 *
 * Second: a soft delete is an UPDATE, so RLS alone would accept plain
 * `lead.update` — which would hand every counsellor the power to make a lead
 * vanish. The trigger is what makes the separate `lead.delete` primitive
 * real, and these tests are the only thing standing between it and a quiet
 * regression.
 *
 *   npm run db:migrate && npm test
 */
import { config as loadEnv } from "dotenv";
import { eq, like, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

loadEnv({ path: ".env" });
loadEnv({ path: ".env.local", override: true });

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set — see the file header.");

const { db } = await import("../src/lib/db/client");
const { centers, leads } = await import("../src/lib/db/schema");

const MARKER = "DeleteSpec";

async function makeLead(): Promise<string> {
  const [centre] = await db
    .insert(centers)
    .values({ name: `${MARKER} centre ${Date.now()}-${Math.random()}`, city: "Kochi" })
    .returning({ id: centers.id });
  const [lead] = await db
    .insert(leads)
    .values({
      studentName: `${MARKER} Anjali`,
      primaryPhone: `+9198470${Math.floor(10000 + Math.random() * 89999)}`,
      centerId: centre.id,
    })
    .returning({ id: leads.id });
  return lead.id;
}

async function sweep() {
  const made = await db.select({ id: leads.id }).from(leads).where(like(leads.studentName, `${MARKER}%`));
  for (const lead of made) await db.delete(leads).where(eq(leads.id, lead.id));
  await db.delete(centers).where(like(centers.name, `${MARKER}%`));
}

beforeEach(sweep);
afterAll(sweep);

/** Every message in an error's cause chain, joined — the driver nests them. */
function messagesOf(error: unknown): string {
  const parts: string[] = [];
  let current = error;
  while (current instanceof Error) {
    parts.push(current.message);
    current = current.cause;
  }
  return parts.join(" | ");
}

describe("the leads table", () => {
  it("has no DELETE policy, so there is no hard-delete path through the API", async () => {
    // The policy existed from Phase 1 and nothing ever called it. An
    // unused door is still a door.
    const rows = await db.execute<{ n: number }>(sql`
      select count(*)::int as n from pg_policies
      where tablename = 'leads' and cmd = 'DELETE'
    `);
    expect(rows[0].n).toBe(0);
  });

  it("still has the update policy, so ordinary edits are untouched", async () => {
    const rows = await db.execute<{ n: number }>(sql`
      select count(*)::int as n from pg_policies
      where tablename = 'leads' and policyname = 'leads_update'
    `);
    expect(rows[0].n).toBe(1);
  });

  it("guards deleted_at with a trigger, not only with application code", async () => {
    const rows = await db.execute<{ n: number }>(sql`
      select count(*)::int as n from pg_trigger
      where tgrelid = 'leads'::regclass
        and tgname = 'enforce_lead_delete_permission'
        and not tgisinternal
    `);
    expect(rows[0].n).toBe(1);
  });
});

describe("enforce_lead_delete_permission", () => {
  it("lets server-side code soft-delete, since it has no session to check", async () => {
    // The merge path does exactly this: `mergeLeads()` soft-deletes the
    // loser on the direct connection. A trigger that blocked it would break
    // deduplication, which is a far worse outcome than the hole it closes.
    const id = await makeLead();
    await db.update(leads).set({ deletedAt: new Date() }).where(eq(leads.id, id));

    const [row] = await db.select({ deletedAt: leads.deletedAt }).from(leads).where(eq(leads.id, id));
    expect(row.deletedAt).not.toBeNull();
  });

  it("fires on the transition in both directions, and not on an ordinary edit", async () => {
    // What the trigger watches is whether `deleted_at` changed between null
    // and not-null — so an edit to any other column, and a no-op rewrite of
    // the same value, must pass a caller who holds nothing.
    const id = await makeLead();

    await db.update(leads).set({ studentName: `${MARKER} Renamed` }).where(eq(leads.id, id));
    const [renamed] = await db
      .select({ name: leads.studentName, deletedAt: leads.deletedAt })
      .from(leads)
      .where(eq(leads.id, id));
    expect(renamed.name).toBe(`${MARKER} Renamed`);
    expect(renamed.deletedAt).toBeNull();

    // And the restore direction works too — a soft delete that could not be
    // undone would make the recycle bin a lie.
    await db.update(leads).set({ deletedAt: new Date() }).where(eq(leads.id, id));
    await db.update(leads).set({ deletedAt: null }).where(eq(leads.id, id));
    const [restored] = await db.select({ deletedAt: leads.deletedAt }).from(leads).where(eq(leads.id, id));
    expect(restored.deletedAt).toBeNull();
  });

  it("refuses a signed-in caller who does not hold lead.delete", async () => {
    // Simulated by setting the request's claims the way Supabase does, so
    // `auth.uid()` returns somebody. A uuid with no `profiles` row holds no
    // permissions at all, which is the strictest version of the case.
    const id = await makeLead();
    const stranger = "11111111-1111-1111-1111-111111111111";

    const thrown = await db
      .transaction(async (tx) => {
        await tx.execute(
          sql`select set_config('request.jwt.claims', ${JSON.stringify({ sub: stranger })}, true)`,
        );
        await tx.execute(sql`update leads set deleted_at = now() where id = ${id}::uuid`);
      })
      .then(
        () => null,
        (error: unknown) => error,
      );

    expect(thrown).not.toBeNull();
    // Drizzle wraps the driver error, so the message Postgres raised is on
    // the cause. Asserting on it rather than on "something failed" is the
    // difference between testing the trigger and testing that the query was
    // malformed.
    expect(messagesOf(thrown)).toMatch(/lead\.delete is required/);

    const [row] = await db.select({ deletedAt: leads.deletedAt }).from(leads).where(eq(leads.id, id));
    expect(row.deletedAt).toBeNull();
  });

  it("lets that same caller make an ordinary edit", async () => {
    // Proof the trigger is narrow. If it refused every update from a caller
    // without `lead.delete`, counsellors could not edit their own leads.
    const id = await makeLead();
    const stranger = "11111111-1111-1111-1111-111111111111";

    await db.transaction(async (tx) => {
      await tx.execute(
        sql`select set_config('request.jwt.claims', ${JSON.stringify({ sub: stranger })}, true)`,
      );
      await tx.execute(sql`update leads set city = 'Kochi' where id = ${id}::uuid`);
    });

    const [row] = await db.select({ city: leads.city }).from(leads).where(eq(leads.id, id));
    expect(row.city).toBe("Kochi");
  });
});

describe("the recycle bin's columns", () => {
  it("records who deleted a lead and why", async () => {
    const id = await makeLead();
    await db
      .update(leads)
      .set({ deletedAt: new Date(), deletedReason: "Test row from the webhook trial" })
      .where(eq(leads.id, id));

    const [row] = await db
      .select({ reason: leads.deletedReason, deletedAt: leads.deletedAt })
      .from(leads)
      .where(eq(leads.id, id));
    expect(row.reason).toBe("Test row from the webhook trial");
    expect(row.deletedAt).not.toBeNull();
  });

  it("has an index for the deleted list, so the bin does not scan the table", async () => {
    const rows = await db.execute<{ n: number }>(sql`
      select count(*)::int as n from pg_indexes
      where tablename = 'leads' and indexname = 'leads_deleted_at_idx'
    `);
    expect(rows[0].n).toBe(1);
  });
});
