/**
 * The one function non-negotiable #6 exists for.
 *
 * Phone numbers are masked in every list. Revealing one is a deliberate,
 * permissioned, audited act — because, as CLAUDE.md puts it, "counsellors
 * leave and take databases with them". The whole mechanism was built and
 * never directly tested (security audit 2026-09-15, test-coverage gap #1):
 * `tests/ai-person-history.spec.ts` covers masking in the analyst's path,
 * not this Server Action.
 *
 * Runs with no database. `revealLeadPhone` has exactly two collaborators —
 * the session and the Supabase client — so both are replaced with fakes
 * that record what the function did. What is under test is the contract
 * between them: refuse without the permission, never log a reveal that did
 * not happen, and always log one that did.
 *
 * RLS itself is tested separately, against real Postgres, in
 * `tests/rls.spec.ts`. Here, "RLS hid the row" is simulated by the client
 * returning nothing — which is exactly what the real one does.
 */
import { randomUUID } from "node:crypto";

import { beforeEach, describe, expect, it, vi } from "vitest";

type SessionUser = import("../src/lib/auth/session").SessionUser;

const LEAD_ID = randomUUID();
const ACTOR_ID = randomUUID();

const FULL_LEAD = {
  id: LEAD_ID,
  primary_phone: "+919847012345",
  alternate_phone: "+919847099999",
  parent_phone: null,
};

/** What the fake Supabase client was asked to do, in order. */
interface Recorded {
  selects: string[];
  inserts: Array<{ table: string; row: Record<string, unknown> }>;
}

let recorded: Recorded;
let currentUser: SessionUser | null;
/** null simulates a row RLS refused to return. */
let visibleLead: typeof FULL_LEAD | null;

function userWith(permissions: Record<string, "own" | "center" | "all">): SessionUser {
  return {
    id: ACTOR_ID,
    email: "reveal-spec@test.invalid",
    fullName: "Reveal Spec",
    avatarUrl: null,
    roleId: randomUUID(),
    roleCode: "test",
    roleName: "Test",
    centerIds: [],
    permissions,
  } as SessionUser;
}

vi.mock("../src/lib/auth/session", async () => {
  const actual = await vi.importActual<typeof import("../src/lib/auth/session")>(
    "../src/lib/auth/session",
  );
  return { ...actual, getCurrentUser: async () => currentUser };
});

// Not under test, and its module chain reaches the real database client —
// which would turn a test that needs no database into one that does.
vi.mock("../src/lib/errors/capture", () => ({
  captureError: async () => {},
  reportingFailures: async <T>(_source: string, run: () => Promise<T>) => run(),
}));

vi.mock("../src/lib/supabase/server", () => ({
  createClient: async () => ({
    from(table: string) {
      return {
        select(columns: string) {
          recorded.selects.push(`${table}:${columns}`);
          return {
            eq: () => ({ maybeSingle: async () => ({ data: visibleLead, error: null }) }),
          };
        },
        insert: async (row: Record<string, unknown>) => {
          recorded.inserts.push({ table, row });
          return { error: null };
        },
      };
    },
  }),
}));

const { revealLeadPhone } = await import("../src/app/(app)/leads/actions");

beforeEach(() => {
  recorded = { selects: [], inserts: [] };
  currentUser = userWith({ "lead.read": "all", "lead.reveal_phone": "all" });
  visibleLead = FULL_LEAD;
});

describe("revealLeadPhone", () => {
  it("returns the full numbers to somebody who holds lead.reveal_phone", async () => {
    const result = await revealLeadPhone(LEAD_ID);

    expect(result.error).toBeUndefined();
    expect(result.primaryPhone).toBe("+919847012345");
    expect(result.alternatePhone).toBe("+919847099999");
    expect(result.parentPhone).toBeNull();
  });

  it("writes an audit row naming the lead and the person who looked", async () => {
    await revealLeadPhone(LEAD_ID);

    expect(recorded.inserts).toHaveLength(1);
    expect(recorded.inserts[0].table).toBe("audit_log");
    expect(recorded.inserts[0].row).toMatchObject({
      action: "lead.reveal_phone",
      entity_type: "leads",
      entity_id: LEAD_ID,
      actor_id: ACTOR_ID,
    });
  });

  it("refuses somebody without the permission, and reads nothing", async () => {
    // `lead.read` alone is the counsellor's everyday shape: they can open
    // the lead and see a masked number. Revealing is a separate grant.
    currentUser = userWith({ "lead.read": "all" });

    const result = await revealLeadPhone(LEAD_ID);

    expect(result).toMatchObject({ primaryPhone: null, alternatePhone: null, error: "Not permitted" });
    // The refusal happens before the query, so a refused attempt cannot
    // even be used as an existence check on a lead id.
    expect(recorded.selects).toEqual([]);
    expect(recorded.inserts).toEqual([]);
  });

  it("refuses a signed-out caller", async () => {
    currentUser = null;
    const result = await revealLeadPhone(LEAD_ID);
    expect(result.error).toBe("Not permitted");
    expect(recorded.selects).toEqual([]);
  });

  it("does not log a reveal when RLS hid the lead", async () => {
    // The lead belongs to another centre. The permission check passed —
    // this user may reveal numbers on *their* leads — and RLS is what
    // stops them here. Logging a reveal that returned nothing would put a
    // false accusation in the permanent record.
    visibleLead = null;

    const result = await revealLeadPhone(LEAD_ID);

    expect(result).toMatchObject({ primaryPhone: null, error: "Lead not found" });
    expect(recorded.inserts).toEqual([]);
  });

  it("asks for only the three phone columns, not the whole lead", async () => {
    await revealLeadPhone(LEAD_ID);
    expect(recorded.selects).toEqual(["leads:id, primary_phone, alternate_phone, parent_phone"]);
  });
});
