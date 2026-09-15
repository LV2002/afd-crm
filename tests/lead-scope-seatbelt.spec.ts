/**
 * The seatbelt on lead creation.
 *
 * `resolveOrCreateLead()` writes through the RLS-bypassing client, so for
 * the two browser-reachable callers — manual entry and CSV import — the
 * app's own scope checks were the only thing enforcing centre boundaries.
 * CLAUDE.md § 3: "App code must never be the only thing standing between a
 * counsellor and another counsellor's leads." Security audit finding #2.
 *
 * `leadIsVisibleToCaller` closes that by reading the row back through the
 * caller's own client after the write. This tests the three things it
 * promises: pass silently when RLS can see the lead, and when it cannot,
 * both raise an alert and record it — without deleting anybody's data.
 *
 * No database: the Supabase client is a fake whose visibility is the thing
 * being varied. Whether RLS *actually* hides another centre's leads is
 * tested for real in tests/rls.spec.ts.
 */
import { randomUUID } from "node:crypto";

import { beforeEach, describe, expect, it, vi } from "vitest";

const LEAD_ID = randomUUID();
const ACTOR_ID = randomUUID();

const captured: Array<{ source: string; message: string }> = [];
let audited: Array<Record<string, unknown>>;
/** null simulates RLS refusing to return the row. */
let visibleLead: { id: string } | null;
let readError: { message: string } | null;

vi.mock("../src/lib/errors/capture", () => ({
  captureError: async (input: { source: string; error: unknown }) => {
    captured.push({
      source: input.source,
      message: input.error instanceof Error ? input.error.message : String(input.error),
    });
  },
  reportingFailures: async <T>(_source: string, run: () => Promise<T>) => run(),
}));

function fakeClient() {
  return {
    from(table: string) {
      return {
        select: () => ({
          eq: () => ({ maybeSingle: async () => ({ data: visibleLead, error: readError }) }),
        }),
        insert: async (row: Record<string, unknown>) => {
          if (table === "audit_log") audited.push(row);
          return { error: null };
        },
      };
    },
  } as never;
}

const { leadIsVisibleToCaller, SCOPE_VIOLATION_MESSAGE } = await import(
  "../src/lib/identity/assert-lead-visible"
);

beforeEach(() => {
  captured.length = 0;
  audited = [];
  visibleLead = { id: LEAD_ID };
  readError = null;
});

const check = {
  leadId: LEAD_ID,
  actorId: ACTOR_ID,
  source: "createLeadManually",
  context: { scope: "center", centerId: "kochi" },
};

describe("leadIsVisibleToCaller", () => {
  it("passes quietly when the creator can see what they created", async () => {
    expect(await leadIsVisibleToCaller(fakeClient(), check)).toBe(true);
    expect(captured).toEqual([]);
    expect(audited).toEqual([]);
  });

  it("fails when RLS will not show the lead to its creator", async () => {
    visibleLead = null;
    expect(await leadIsVisibleToCaller(fakeClient(), check)).toBe(false);
  });

  it("alerts an administrator, naming the source and the lead", async () => {
    visibleLead = null;
    await leadIsVisibleToCaller(fakeClient(), check);

    expect(captured).toHaveLength(1);
    expect(captured[0].source).toBe("scope:createLeadManually");
    expect(captured[0].message).toContain(LEAD_ID);
    // The wording matters: this is a code fault, and whoever reads the
    // alert should not go hunting for a misbehaving counsellor.
    expect(captured[0].message).toContain("This is a bug, not a user error");
  });

  it("records the violation in the audit log", async () => {
    visibleLead = null;
    await leadIsVisibleToCaller(fakeClient(), check);

    expect(audited).toHaveLength(1);
    expect(audited[0]).toMatchObject({
      action: "lead.scope_violation",
      entity_type: "leads",
      entity_id: LEAD_ID,
      actor_id: ACTOR_ID,
    });
  });

  it("treats a failed read as a failed check, not a pass", async () => {
    // "The check itself broke" is not a reason to wave the write through.
    visibleLead = null;
    readError = { message: "connection reset" };

    expect(await leadIsVisibleToCaller(fakeClient(), check)).toBe(false);
    expect(captured[0].message).toContain(LEAD_ID);
  });

  it("tells the user something true and actionable", () => {
    // Not "you don't have permission" — they may well have it, and the
    // fault is in the code.
    expect(SCOPE_VIOLATION_MESSAGE).toContain("flagged for an administrator");
    expect(SCOPE_VIOLATION_MESSAGE).not.toMatch(/permission/i);
  });
});
