/**
 * The richer automation steps against a real database: free-form messages
 * (only inside the 24-hour window), ask-and-save, conditions, and the lead
 * actions. Only the WhatsApp client is mocked.
 */
import { randomUUID } from "node:crypto";

import { config as loadEnv } from "dotenv";
import { eq, sql } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

loadEnv({ path: ".env" });
loadEnv({ path: ".env.local", override: true });

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set.");
if (!process.env.INTEGRATION_ENCRYPTION_KEY) throw new Error("INTEGRATION_ENCRYPTION_KEY is not set.");

vi.mock("../src/lib/integrations/whatsapp/client", () => ({
  sendTemplateMessage: vi.fn(),
  sendTextMessage: vi.fn(),
  sendReplyButtons: vi.fn(),
  sendMediaByLink: vi.fn(),
}));
vi.mock("../src/lib/notifications/notify", () => ({ notify: vi.fn() }));

import type { FlowStepKind } from "../src/lib/whatsapp/flow-engine";

const client = await import("../src/lib/integrations/whatsapp/client");
const { advanceRuns, resolveReply } = await import("../src/lib/whatsapp/flow-runner");
const { db } = await import("../src/lib/db/client");
const { leads, whatsappFlowRuns, whatsappFlowSteps, whatsappFlows, whatsappMessages } = await import("../src/lib/db/schema");
const { setIntegrationCredential, deleteIntegrationCredential } = await import("../src/lib/integrations/credentials");

const MARKER = "WhatsAppRichStepsTest";

async function cleanup() {
  const rows = await db.select({ id: leads.id }).from(leads).where(sql`${leads.studentName} like ${MARKER + "%"}`);
  for (const lead of rows) {
    await db.delete(whatsappMessages).where(eq(whatsappMessages.leadId, lead.id));
    await db.delete(whatsappFlowRuns).where(eq(whatsappFlowRuns.leadId, lead.id));
  }
  await db.delete(leads).where(sql`${leads.studentName} like ${MARKER + "%"}`);
  await db.delete(whatsappFlows).where(sql`${whatsappFlows.name} like ${MARKER + "%"}`);
}

async function setup(phone: string, steps: Array<{ kind: FlowStepKind; config: Record<string, unknown> }>, windowOpen: boolean) {
  const [lead] = await db
    .insert(leads)
    .values({ studentName: `${MARKER} ${randomUUID().slice(0, 6)}`, primaryPhone: phone })
    .returning({ id: leads.id });
  if (windowOpen) {
    await db.insert(whatsappMessages).values({
      leadId: lead.id,
      direction: "inbound",
      waMessageId: `in-${randomUUID()}`,
      fromPhone: phone,
      toPhone: "x",
      messageType: "text",
      body: "hi",
      status: "received",
    });
  }
  const [flow] = await db
    .insert(whatsappFlows)
    .values({ name: `${MARKER} ${randomUUID().slice(0, 6)}`, triggerType: "manual", isActive: true })
    .returning({ id: whatsappFlows.id });
  await db.insert(whatsappFlowSteps).values(steps.map((s, i) => ({ flowId: flow.id, position: i + 1, kind: s.kind, config: s.config })));
  const [run] = await db
    .insert(whatsappFlowRuns)
    .values({ flowId: flow.id, leadId: lead.id, status: "running", wakeAt: new Date() })
    .returning({ id: whatsappFlowRuns.id });
  return { leadId: lead.id, runId: run.id };
}

async function runRow(id: string) {
  const [row] = await db.select().from(whatsappFlowRuns).where(eq(whatsappFlowRuns.id, id));
  return row;
}

beforeAll(async () => {
  await cleanup();
  await setIntegrationCredential("whatsapp", "access_token", "fake-access-token");
  await setIntegrationCredential("whatsapp", "phone_number_id", `${MARKER}-phone`);
});
afterAll(async () => {
  await cleanup();
  await deleteIntegrationCredential("whatsapp", "access_token");
  await deleteIntegrationCredential("whatsapp", "phone_number_id");
});
afterEach(() => vi.clearAllMocks());

describe("free-form steps", () => {
  it("sends typed text inside the 24-hour window and records it", async () => {
    vi.mocked(client.sendTextMessage).mockResolvedValue("wamid.t1");
    const { leadId, runId } = await setup("+919847710001", [{ kind: "send_text", config: { text: "Thanks!" } }], true);
    await advanceRuns();
    expect(client.sendTextMessage).toHaveBeenCalledTimes(1);
    expect((await runRow(runId)).status).toBe("completed");
    const out = await db.select().from(whatsappMessages).where(eq(whatsappMessages.leadId, leadId));
    expect(out.filter((m) => m.direction === "outbound")).toHaveLength(1);
  });

  it("skips a typed message outside the window but keeps going", async () => {
    const { runId } = await setup("+919847710002", [{ kind: "send_text", config: { text: "Thanks!" } }], false);
    await advanceRuns();
    expect(client.sendTextMessage).not.toHaveBeenCalled();
    expect((await runRow(runId)).status).toBe("completed");
  });
});

describe("ask_question", () => {
  it("saves a valid answer onto the lead and moves on", async () => {
    vi.mocked(client.sendTextMessage).mockResolvedValue("wamid.q1");
    const { leadId, runId } = await setup(
      "+919847710003",
      [{ kind: "ask_question", config: { question: "Email?", field: "email", hours: 24 } }, { kind: "stop", config: {} }],
      true,
    );
    await advanceRuns();
    expect((await runRow(runId)).awaitingStepId).not.toBeNull();
    await resolveReply(leadId, "Anjali@Example.com");
    const [lead] = await db.select({ email: leads.email }).from(leads).where(eq(leads.id, leadId));
    expect(lead.email).toBe("anjali@example.com");
    expect((await runRow(runId)).status).toBe("completed");
  });

  it("asks again after an answer that is not an email", async () => {
    vi.mocked(client.sendTextMessage).mockResolvedValue("wamid.q2");
    const { leadId, runId } = await setup(
      "+919847710004",
      [{ kind: "ask_question", config: { question: "Email?", field: "email", hours: 24 } }],
      true,
    );
    await advanceRuns();
    await resolveReply(leadId, "no idea");
    expect(client.sendTextMessage).toHaveBeenCalledTimes(2);
    expect((await runRow(runId)).awaitingStepId).not.toBeNull();
  });
});

describe("condition and lead actions", () => {
  it("branches on a lead field", async () => {
    const { leadId, runId } = await setup(
      "+919847710005",
      [
        { kind: "condition", config: { conditions: { all: [{ field: "city", op: "equals", value: "Kochi" }] }, thenGoto: 3, elseGoto: "stop" } },
        { kind: "stop", config: {} },
        { kind: "schedule_followup", config: { days: 2 } },
      ],
      false,
    );
    await db.update(leads).set({ city: "Kochi" }).where(eq(leads.id, leadId));
    await advanceRuns();
    const [lead] = await db.select({ next: leads.nextFollowupAt }).from(leads).where(eq(leads.id, leadId));
    expect(lead.next).not.toBeNull();
    expect((await runRow(runId)).status).toBe("completed");
  });
});
