import { config as loadEnv } from "dotenv";
import { eq, inArray, like } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

loadEnv({ path: ".env" });
loadEnv({ path: ".env.local", override: true });
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set.");

const { db } = await import("../src/lib/db/client");
const { contacts, whatsappFlowRunEvents, whatsappFlowRuns, whatsappFlows, whatsappSpend } = await import("../src/lib/db/schema");
const { automationReport } = await import("../src/lib/whatsapp/automation-report");

const MARK = "AutoReportTest";
let flowId: string;
const wamids = ["wamid.AR_1", "wamid.AR_2"];

beforeAll(async () => {
  const [f] = await db.insert(whatsappFlows).values({ name: `${MARK} flow`, audience: "contact", triggerType: "manual" }).returning({ id: whatsappFlows.id });
  flowId = f.id;
  const [c] = await db.insert(contacts).values({ name: `${MARK} c`, phone: "+919847990001" }).returning({ id: contacts.id });
  const [run] = await db.insert(whatsappFlowRuns).values({ flowId, contactId: c.id, status: "completed" }).returning({ id: whatsappFlowRuns.id });
  await db.insert(whatsappFlowRunEvents).values([
    { runId: run.id, kind: "sent", detail: `Send "a" · ${wamids[0]}` },
    { runId: run.id, kind: "sent", detail: `Send "b" · ${wamids[1]}` },
    { runId: run.id, kind: "delivered", detail: null },
    { runId: run.id, kind: "read", detail: null },
    { runId: run.id, kind: "delivery_failed", detail: "Error 131042" },
  ]);
  await db.insert(whatsappSpend).values([
    { waMessageId: wamids[0], category: "utility", billable: true, amountTenThousandths: 1150, flowId },
    { waMessageId: wamids[1], category: "marketing", billable: true, amountTenThousandths: 8631, flowId },
  ]);
});
afterAll(async () => {
  await db.delete(whatsappSpend).where(inArray(whatsappSpend.waMessageId, wamids));
  await db.delete(whatsappFlows).where(like(whatsappFlows.name, `${MARK}%`));
  await db.delete(contacts).where(like(contacts.name, `${MARK}%`));
});

describe("the automation report", () => {
  it("counts what an automation sent and what Meta billed, in total, per day and per automation", async () => {
    const report = await automationReport(7);
    const row = report.rows.find((r) => r.flowId === flowId);
    expect(row).toMatchObject({ sent: 2, delivered: 1, read: 1, failed: 1, billable: 2, cost: 1150 + 8631 });
    expect(report.totals.sent).toBeGreaterThanOrEqual(2);
    expect(report.days).toHaveLength(7);
    const today = report.days[report.days.length - 1];
    expect(today.sent).toBeGreaterThanOrEqual(2);
    expect(today.cost).toBeGreaterThanOrEqual(1150 + 8631);
    // An automation with nothing in range still appears, as zeros.
    const [idle] = await db.insert(whatsappFlows).values({ name: `${MARK} idle`, audience: "contact", triggerType: "manual" }).returning({ id: whatsappFlows.id });
    const again = await automationReport(7);
    expect(again.rows.find((r) => r.flowId === idle.id)).toMatchObject({ sent: 0, cost: 0 });
    await db.delete(whatsappFlows).where(eq(whatsappFlows.id, idle.id));
  });
});
