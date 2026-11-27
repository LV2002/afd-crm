/**
 * What WhatsApp messages cost: the arithmetic, and recording what Meta billed.
 */
import { config as loadEnv } from "dotenv";
import { eq, inArray, like } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

loadEnv({ path: ".env" });
loadEnv({ path: ".env.local", override: true });
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set.");

const { estimateCost, flowCostPerPerson, formatRate, formatTotal, parseRate, rateFor } = await import("../src/lib/whatsapp/pricing");
const { db } = await import("../src/lib/db/client");
const { whatsappFlowRunEvents, whatsappFlowRuns, whatsappFlows, whatsappLinkClicks, whatsappLinks, whatsappSpend, contacts } =
  await import("../src/lib/db/schema");
const { recordMessageSpend } = await import("../src/lib/whatsapp/spend");
const { GET } = await import("../src/app/l/[code]/route");
const { NextRequest } = await import("next/server");

const RATES = { marketing: 8631, utility: 1150, authentication: 1150, service: 0 };

describe("pricing arithmetic", () => {
  it("reads and shows rates without floating point", () => {
    expect(parseRate("0.8631")).toBe(8631);
    expect(parseRate("1")).toBe(10_000);
    expect(parseRate("₹0.115")).toBe(1150);
    expect(parseRate("abc")).toBeNull();
    expect(parseRate("0.12345")).toBeNull();
    expect(formatRate(8631)).toBe("₹0.8631");
    expect(formatRate(1150)).toBe("₹0.1150");
    expect(formatTotal(8631 * 200)).toBe("₹172.62");
    expect(formatTotal(0)).toBe("₹0.00");
  });

  it("estimates a broadcast by the template's category, and treats an unknown category as marketing", () => {
    expect(estimateCost("MARKETING", 200, RATES)).toMatchObject({ perMessage: 8631, total: 1_726_200, category: "marketing" });
    expect(estimateCost("UTILITY", 1000, RATES).total).toBe(1_150_000);
    expect(rateFor(RATES, "something_new")).toBe(8631);
  });

  it("costs an automation as every template it can send, once", () => {
    const steps = [
      { kind: "send_template", config: { templateName: "welcome" } },
      { kind: "wait", config: {} },
      { kind: "send_text", config: { text: "hi" } },
      { kind: "send_template", config: { templateName: "offer" } },
    ];
    const cost = flowCostPerPerson(steps, new Map([["welcome", "UTILITY"], ["offer", "MARKETING"]]), RATES);
    expect(cost.total).toBe(1150 + 8631);
    expect(cost.parts).toHaveLength(2);
  });
});

const MARK = "WaCostTest";
let flowId: string;
let linkId: string;
const wamids = ["wamid.COST_FLOW_1", "wamid.COST_OTHER_1"];

beforeAll(async () => {
  const [f] = await db.insert(whatsappFlows).values({ name: `${MARK} flow`, audience: "contact", triggerType: "manual" }).returning({ id: whatsappFlows.id });
  flowId = f.id;
  const [c] = await db.insert(contacts).values({ name: `${MARK} c`, phone: "+919847900001" }).returning({ id: contacts.id });
  const [run] = await db.insert(whatsappFlowRuns).values({ flowId, contactId: c.id, status: "completed" }).returning({ id: whatsappFlowRuns.id });
  await db.insert(whatsappFlowRunEvents).values({ runId: run.id, kind: "sent", detail: `Send "welcome" · ${wamids[0]}` });
});
afterAll(async () => {
  await db.delete(whatsappSpend).where(inArray(whatsappSpend.waMessageId, wamids));
  if (linkId) await db.delete(whatsappLinks).where(eq(whatsappLinks.id, linkId));
  await db.delete(whatsappFlows).where(like(whatsappFlows.name, `${MARK}%`));
  await db.delete(contacts).where(like(contacts.name, `${MARK}%`));
});

describe("recording what Meta billed", () => {
  it("files an automation's message under that automation, and counts a message once", async () => {
    await recordMessageSpend(wamids[0], { billable: true, category: "utility" }, RATES);
    await recordMessageSpend(wamids[0], { billable: true, category: "utility" }, RATES);
    const rows = await db.select().from(whatsappSpend).where(eq(whatsappSpend.waMessageId, wamids[0]));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ flowId, category: "utility", amountTenThousandths: 1150, billable: true });
  });

  it("records a non-billable message as free, and ignores a report with no pricing", async () => {
    await recordMessageSpend(wamids[1], { billable: false, category: "service" }, RATES);
    await recordMessageSpend("wamid.COST_NONE", undefined, RATES);
    const [row] = await db.select().from(whatsappSpend).where(eq(whatsappSpend.waMessageId, wamids[1]));
    expect(row).toMatchObject({ amountTenThousandths: 0, billable: false, broadcastId: null, flowId: null });
    expect(await db.select().from(whatsappSpend).where(eq(whatsappSpend.waMessageId, "wamid.COST_NONE"))).toHaveLength(0);
  });
});

describe("tracked link taps", () => {
  it("logs each tap with its recipient reference and still redirects", async () => {
    const code = `t${Math.random().toString(36).slice(2, 8)}`;
    const [l] = await db.insert(whatsappLinks).values({ code, name: `${MARK} link`, url: "https://example.com/fees", campaign: `${MARK} campaign`, flowId }).returning({ id: whatsappLinks.id });
    linkId = l.id;
    const res = await GET(new NextRequest(`https://crm.example/l/${code}?r=abc123`), { params: Promise.resolve({ code }) });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("https://example.com/fees");
    await GET(new NextRequest(`https://crm.example/l/${code}`), { params: Promise.resolve({ code }) });
    const clicks = await db.select().from(whatsappLinkClicks).where(eq(whatsappLinkClicks.linkId, linkId));
    expect(clicks).toHaveLength(2);
    expect(new Set(clicks.map((c) => c.ref))).toEqual(new Set([null, "abc123"]));
    const [link] = await db.select().from(whatsappLinks).where(eq(whatsappLinks.id, linkId));
    expect(link.clicks).toBe(2);
  });
});
