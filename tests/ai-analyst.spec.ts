/**
 * AI analyst scoping and tool boundary.
 *
 * CLAUDE.md § AI analyst rules is explicit: "Every tool must receive the
 * caller's user_id and apply the same centre scoping as RLS. A centre head
 * asking 'how did Kochi do' when they only own Kannur must get nothing."
 * These tests are that sentence, executed — plus the guarantee that the
 * model is never handed a way to write its own query.
 *
 *   npm run db:migrate && npm run db:seed && npm test
 */
import { randomUUID } from "node:crypto";

import { config as loadEnv } from "dotenv";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

loadEnv({ path: ".env" });
loadEnv({ path: ".env.local", override: true });

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set — see the file header.");

const { ANALYST_TOOLS, anthropicToolDefinitions, runAnalystTool } = await import("../src/lib/ai/tools");
const { allowedCenterIds, analystScope, leadScopeWhere } = await import("../src/lib/ai/tools/scope");
const { db } = await import("../src/lib/db/client");
const { centers, leads } = await import("../src/lib/db/schema");

const MARKER = "AiAnalystSpec";

type SessionUser = Parameters<typeof analystScope>[0];

function userWith(
  permissions: Record<string, "own" | "center" | "all">,
  centerIds: string[] = [],
  id = randomUUID(),
): SessionUser {
  return {
    id,
    email: `${MARKER}@test.invalid`,
    fullName: `${MARKER} User`,
    avatarUrl: null,
    roleId: randomUUID(),
    roleCode: "test",
    roleName: "Test",
    centerIds,
    permissions,
  } as SessionUser;
}

let kochiId: string;
let kannurId: string;
const counsellorId = randomUUID();

async function sweep() {
  await db.delete(leads).where(sql`${leads.studentName} like ${MARKER + "%"}`);
}

beforeAll(async () => {
  await sweep();
  const rows = await db.select({ id: centers.id, name: centers.name }).from(centers);
  kochiId = rows.find((c) => c.name === "Kochi")!.id;
  kannurId = rows.find((c) => c.name === "Kannur")!.id;

  await db.insert(leads).values([
    { studentName: `${MARKER} Kochi A`, primaryPhone: "+919847200601", centerId: kochiId, firstTouchSource: "Website" },
    { studentName: `${MARKER} Kochi B`, primaryPhone: "+919847200602", centerId: kochiId, firstTouchSource: "Website" },
    { studentName: `${MARKER} Kannur A`, primaryPhone: "+919847200603", centerId: kannurId, firstTouchSource: "meta" },
    {
      studentName: `${MARKER} Mine`,
      primaryPhone: "+919847200604",
      centerId: kochiId,
      assignedTo: null,
      firstTouchSource: "CSV Import",
    },
  ]);
});

afterAll(sweep);

describe("analystScope", () => {
  it("takes the widest report permission the caller holds", () => {
    expect(analystScope(userWith({ "report.read": "own" }))).toBe("own");
    expect(analystScope(userWith({ "report.read": "own", "report.center": "center" }))).toBe("center");
    expect(analystScope(userWith({ "report.read": "own", "report.org": "all" }))).toBe("all");
    // Presence of the code decides, not the scope attribute on it — same
    // rule the Insights page uses.
    expect(analystScope(userWith({ "report.center": "own" }))).toBe("center");
  });

  it("falls back to own for someone holding no report permission at all", () => {
    expect(analystScope(userWith({}))).toBe("own");
  });
});

describe("allowedCenterIds", () => {
  it("passes a requested centre through for an org-wide caller", () => {
    expect(allowedCenterIds(userWith({ "report.org": "all" }), [kochiId])).toEqual([kochiId]);
  });

  it("drops a centre the caller does not belong to", () => {
    // The exact scenario CLAUDE.md names: asking about Kochi while owning
    // only Kannur must yield nothing, not Kochi's numbers.
    const centreHead = userWith({ "report.center": "center" }, [kannurId]);
    expect(allowedCenterIds(centreHead, [kochiId])).toEqual([]);
  });

  it("keeps only the permitted subset of a mixed request", () => {
    const centreHead = userWith({ "report.center": "center" }, [kannurId]);
    expect(allowedCenterIds(centreHead, [kochiId, kannurId])).toEqual([kannurId]);
  });

  it("defaults to the caller's own centres when none are requested", () => {
    const centreHead = userWith({ "report.center": "center" }, [kannurId]);
    expect(allowedCenterIds(centreHead, undefined)).toEqual([kannurId]);
  });

  it("returns nothing for a centre-scoped caller belonging to no centre", () => {
    // Failing closed is the only safe direction here.
    expect(allowedCenterIds(userWith({ "report.center": "center" }, []), [kochiId])).toEqual([]);
  });
});

describe("tool results respect the caller's scope", () => {
  it("an org-wide caller sees every centre's leads", async () => {
    const result = (await runAnalystTool("leads_by_source", {}, {
      user: userWith({ "report.org": "all" }),
    })) as { ok: true; result: { totalLeads: number } };
    expect(result.ok).toBe(true);
    expect(result.result.totalLeads).toBeGreaterThanOrEqual(4);
  });

  it("a Kannur centre head does NOT see Kochi's leads", async () => {
    const kannurHead = userWith({ "report.center": "center" }, [kannurId]);
    const rows = await db
      .select({ id: leads.id })
      .from(leads)
      .where(leadScopeWhere(kannurHead));
    const kochiRows = await db
      .select({ id: leads.id })
      .from(leads)
      .where(eq(leads.centerId, kochiId));
    const visible = new Set(rows.map((r) => r.id));
    for (const kochiLead of kochiRows) {
      expect(visible.has(kochiLead.id)).toBe(false);
    }
  });

  it("an own-scope counsellor sees only leads assigned to them", async () => {
    const counsellor = userWith({ "report.read": "own" }, [kochiId], counsellorId);
    const result = (await runAnalystTool("leads_by_source", {}, { user: counsellor })) as {
      ok: true;
      result: { totalLeads: number };
    };
    // Nothing in the fixtures is assigned to this id.
    expect(result.result.totalLeads).toBe(0);
  });

  it("withholds the counsellor scorecard from an own-scope caller", async () => {
    const result = (await runAnalystTool("conversion_by_counsellor", {}, {
      user: userWith({ "report.read": "own" }),
    })) as { ok: true; result: { scorecard: unknown[]; note?: string } };
    expect(result.result.scorecard).toEqual([]);
    expect(result.result.note).toBeTruthy();
  });

  it("list_centres shows an org-wide caller every centre, a centre head only theirs", async () => {
    const orgWide = (await runAnalystTool("list_centres", {}, {
      user: userWith({ "report.org": "all" }),
    })) as { ok: true; result: { centres: Array<{ id: string }> } };
    expect(orgWide.result.centres.length).toBeGreaterThanOrEqual(2);

    const kannurHead = (await runAnalystTool("list_centres", {}, {
      user: userWith({ "report.center": "center" }, [kannurId]),
    })) as { ok: true; result: { centres: Array<{ id: string }> } };
    expect(kannurHead.result.centres.map((c) => c.id)).toEqual([kannurId]);
  });
});

describe("the tool surface itself", () => {
  it("exposes no tool that takes free-form SQL or a table/column name", () => {
    // The guarantee behind "never generate SQL against the live database":
    // there is no argument through which a query could arrive.
    const forbidden = ["sql", "query", "table", "column", "where", "filter", "expression", "raw"];
    for (const tool of ANALYST_TOOLS) {
      const properties = Object.keys(
        (tool.inputSchema as { properties?: Record<string, unknown> }).properties ?? {},
      );
      for (const property of properties) {
        expect(forbidden).not.toContain(property.toLowerCase());
      }
    }
  });

  it("every tool rejects unknown arguments at the schema level", () => {
    for (const tool of ANALYST_TOOLS) {
      expect((tool.inputSchema as { additionalProperties?: boolean }).additionalProperties).toBe(false);
    }
  });

  it("publishes exactly the tools it can run — no more, no fewer", () => {
    // A definition without a runner would fail at call time; a runner
    // without a definition would be unreachable. Both are bugs.
    const published = anthropicToolDefinitions().map((t) => t.name).sort();
    const runnable = ANALYST_TOOLS.map((t) => t.name).sort();
    expect(published).toEqual(runnable);
  });

  it("reports an unknown tool as an error instead of throwing", async () => {
    const result = await runAnalystTool("drop_all_leads", {}, {
      user: userWith({ "report.org": "all" }),
    });
    expect(result).toEqual({ ok: false, error: "No such tool: drop_all_leads" });
  });

  it("reports invalid arguments as an error the model can recover from", async () => {
    const result = await runAnalystTool("leads_by_source", { from: "not-a-date" }, {
      user: userWith({ "report.org": "all" }),
    });
    expect(result.ok).toBe(false);
  });

  it("every tool has a description the model can choose from", () => {
    for (const tool of ANALYST_TOOLS) {
      expect(tool.description.length).toBeGreaterThan(30);
    }
  });
});

describe("Gemini schema translation", () => {
  it("strips additionalProperties, which Gemini's schema subset rejects", async () => {
    // The tool definitions keep `additionalProperties: false` because it
    // documents intent and a future provider may enforce it; Gemini 400s on
    // it. Arguments are validated by zod in runAnalystTool either way, so
    // the model not seeing the constraint costs nothing.
    const { geminiToolDeclarations } = await import("../src/lib/ai/gemini-tools");
    for (const declaration of geminiToolDeclarations(ANALYST_TOOLS)) {
      expect(declaration.parameters).not.toHaveProperty("additionalProperties");
    }
  });

  it("omits an empty properties map rather than sending one", async () => {
    // Gemini rejects `{type: "object", properties: {}}`. sla_breaches and
    // list_centres take no arguments, so they are the ones that would trip it.
    const { geminiToolDeclarations } = await import("../src/lib/ai/gemini-tools");
    const noArgTools = geminiToolDeclarations(ANALYST_TOOLS).filter((d) =>
      ["sla_breaches", "list_centres"].includes(d.name),
    );
    expect(noArgTools.length).toBe(2);
    for (const declaration of noArgTools) {
      expect(declaration.parameters).not.toHaveProperty("properties");
    }
  });

  it("keeps the date-range properties for tools that take them", async () => {
    const { geminiToolDeclarations } = await import("../src/lib/ai/gemini-tools");
    const bySource = geminiToolDeclarations(ANALYST_TOOLS).find((d) => d.name === "leads_by_source");
    expect(Object.keys((bySource!.parameters as { properties: object }).properties)).toEqual(["from", "to"]);
  });
});
