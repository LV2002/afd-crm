/**
 * The automation engine against a real database.
 *
 * `flow-engine.spec.ts` covers the decisions; this covers the
 * consequences — that a run actually sends, actually parks, actually
 * branches on a button, and above all actually REFUSES to message
 * somebody who has opted out. Only `sendTemplateMessage` is mocked; the
 * runs, the guards and the unique index all run for real.
 *
 *   npm run db:migrate && npm test
 */
import { randomUUID } from "node:crypto";

import { config as loadEnv } from "dotenv";
import { and, eq, sql } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

loadEnv({ path: ".env" });
loadEnv({ path: ".env.local", override: true });

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set.");
if (!process.env.INTEGRATION_ENCRYPTION_KEY) throw new Error("INTEGRATION_ENCRYPTION_KEY is not set.");

vi.mock("../src/lib/integrations/whatsapp/client", () => ({
  sendTemplateMessage: vi.fn(),
}));
// The engine notifies a counsellor on a notify_owner step; that path has
// its own tests and needs a whole notification-settings fixture here.
vi.mock("../src/lib/notifications/notify", () => ({ notify: vi.fn() }));

const { sendTemplateMessage } = await import("../src/lib/integrations/whatsapp/client");
const { advanceRuns, resolveReply, startFlows } = await import("../src/lib/whatsapp/flow-runner");
const { db } = await import("../src/lib/db/client");
const {
  leads,
  whatsappFlowRunEvents,
  whatsappFlowRuns,
  whatsappFlowSteps,
  whatsappFlows,
  whatsappMessages,
  whatsappSuppressions,
} = await import("../src/lib/db/schema");
const { setIntegrationCredential, deleteIntegrationCredential } = await import(
  "../src/lib/integrations/credentials"
);

const MARKER = "WhatsAppFlowRunnerTest";

async function cleanup() {
  const testLeads = await db
    .select({ id: leads.id })
    .from(leads)
    .where(sql`${leads.studentName} like ${MARKER + "%"}`);
  for (const lead of testLeads) {
    await db.delete(whatsappMessages).where(eq(whatsappMessages.leadId, lead.id));
    await db.delete(whatsappFlowRuns).where(eq(whatsappFlowRuns.leadId, lead.id));
  }
  await db.delete(leads).where(sql`${leads.studentName} like ${MARKER + "%"}`);
  await db.delete(whatsappFlows).where(sql`${whatsappFlows.name} like ${MARKER + "%"}`);
  await db.delete(whatsappSuppressions).where(sql`${whatsappSuppressions.reason} = ${MARKER}`);
}

async function makeLead(label: string, phone: string) {
  const [lead] = await db
    .insert(leads)
    .values({ studentName: `${MARKER} ${label}`, primaryPhone: phone })
    .returning({ id: leads.id });
  return lead.id;
}

/** Send → wait for a reply → branch. The shape of every real follow-up sequence. */
async function makeFlow(label: string, active = true) {
  const [flow] = await db
    .insert(whatsappFlows)
    .values({
      name: `${MARKER} ${label}`,
      triggerType: "manual",
      isActive: active,
    })
    .returning({ id: whatsappFlows.id });

  const steps = await db
    .insert(whatsappFlowSteps)
    .values([
      {
        flowId: flow.id,
        position: 1,
        kind: "send_template",
        config: { templateName: "nift_intro", templateLanguage: "en_US", params: [] },
      },
      {
        flowId: flow.id,
        position: 2,
        kind: "wait_for_reply",
        config: {
          hours: 48,
          branches: [
            { match: "Yes, interested", goto: 3 },
            { match: "Not now", goto: 4 },
          ],
          onTimeout: 4,
        },
      },
      {
        flowId: flow.id,
        position: 3,
        kind: "add_tag",
        config: {},
      },
      { flowId: flow.id, position: 4, kind: "stop", config: {} },
    ])
    .returning({ id: whatsappFlowSteps.id, position: whatsappFlowSteps.position });

  return { flowId: flow.id, steps };
}

async function startRun(flowId: string, leadId: string) {
  const [run] = await db
    .insert(whatsappFlowRuns)
    .values({ flowId, leadId, status: "running", wakeAt: new Date() })
    .returning({ id: whatsappFlowRuns.id });
  return run.id;
}

async function runRow(runId: string) {
  const [row] = await db.select().from(whatsappFlowRuns).where(eq(whatsappFlowRuns.id, runId));
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

afterEach(() => {
  vi.mocked(sendTemplateMessage).mockReset();
});

describe("advanceRuns", () => {
  it("sends the first message and parks on the reply step", async () => {
    const { flowId } = await makeFlow(`send-${randomUUID().slice(0, 6)}`);
    const leadId = await makeLead("Anjali", "+919847700101");
    const runId = await startRun(flowId, leadId);

    vi.mocked(sendTemplateMessage).mockResolvedValue("wamid.flow1");
    await advanceRuns();

    expect(sendTemplateMessage).toHaveBeenCalled();
    const row = await runRow(runId);
    expect(row.status).toBe("waiting");
    // Parked with somewhere to be woken FROM: awaiting_step_id is what the
    // inbound webhook looks for, and wake_at is the timeout.
    expect(row.awaitingStepId).not.toBeNull();
    expect(row.wakeAt).not.toBeNull();

    // Recorded on the lead's own thread. An automated message the
    // counsellor cannot see is one they will contradict.
    const messages = await db
      .select()
      .from(whatsappMessages)
      .where(eq(whatsappMessages.leadId, leadId));
    expect(messages).toHaveLength(1);
    expect(messages[0].templateName).toBe("nift_intro");
  });

  it("refuses to message somebody who has opted out, and says so", async () => {
    const { flowId } = await makeFlow(`optout-${randomUUID().slice(0, 6)}`);
    const leadId = await makeLead("Rajesh", "+919847700202");
    await db
      .insert(whatsappSuppressions)
      .values({ phone: "+919847700202", reason: MARKER, source: "keyword" });
    const runId = await startRun(flowId, leadId);

    await advanceRuns();

    expect(sendTemplateMessage).not.toHaveBeenCalled();
    const row = await runRow(runId);
    expect(row.status).toBe("stopped");
    expect(row.stopReason).toMatch(/[Oo]pted out/);
  });

  it("refuses a lead marked do-not-contact", async () => {
    const { flowId } = await makeFlow(`dnc-${randomUUID().slice(0, 6)}`);
    const leadId = await makeLead("Priya", "+919847700303");
    await db.update(leads).set({ doNotContact: true }).where(eq(leads.id, leadId));
    const runId = await startRun(flowId, leadId);

    await advanceRuns();

    expect(sendTemplateMessage).not.toHaveBeenCalled();
    expect((await runRow(runId)).status).toBe("stopped");
  });

  it("takes the timeout branch when the wait is over and nobody replied", async () => {
    const { flowId } = await makeFlow(`timeout-${randomUUID().slice(0, 6)}`);
    const leadId = await makeLead("Vishnu", "+919847700404");
    const runId = await startRun(flowId, leadId);

    vi.mocked(sendTemplateMessage).mockResolvedValue("wamid.flow2");
    await advanceRuns();

    // Pretend the 48 hours have passed.
    await db
      .update(whatsappFlowRuns)
      .set({ wakeAt: new Date(Date.now() - 1000) })
      .where(eq(whatsappFlowRuns.id, runId));
    await advanceRuns();

    const row = await runRow(runId);
    // onTimeout points at step 4, which is a stop.
    expect(row.status).toBe("completed");
    const events = await db
      .select()
      .from(whatsappFlowRunEvents)
      .where(eq(whatsappFlowRunEvents.runId, runId));
    expect(events.map((event) => event.kind)).toContain("timed_out");
  });
});

describe("resolveReply", () => {
  it("branches on the words the button carried", async () => {
    const { flowId } = await makeFlow(`branch-${randomUUID().slice(0, 6)}`);
    const leadId = await makeLead("Meera", "+919847700505");
    const runId = await startRun(flowId, leadId);

    vi.mocked(sendTemplateMessage).mockResolvedValue("wamid.flow3");
    await advanceRuns();
    expect((await runRow(runId)).status).toBe("waiting");

    // "Yes, interested" jumps to step 3 (add a tag) and then falls off the
    // end of the list, which completes the run.
    await resolveReply(leadId, "Yes, interested");

    const row = await runRow(runId);
    expect(row.status).toBe("completed");
    expect(row.awaitingStepId).toBeNull();

    const events = await db
      .select()
      .from(whatsappFlowRunEvents)
      .where(eq(whatsappFlowRunEvents.runId, runId));
    expect(events.map((event) => event.kind)).toContain("replied");
  });

  it("takes the other branch for a different answer", async () => {
    const { flowId } = await makeFlow(`branch2-${randomUUID().slice(0, 6)}`);
    const leadId = await makeLead("Nithin", "+919847700606");
    const runId = await startRun(flowId, leadId);

    vi.mocked(sendTemplateMessage).mockResolvedValue("wamid.flow4");
    await advanceRuns();
    await resolveReply(leadId, "not now thanks");

    expect((await runRow(runId)).status).toBe("completed");
  });

  it("does nothing to a run that isn't waiting for a reply", async () => {
    const { flowId } = await makeFlow(`idle-${randomUUID().slice(0, 6)}`);
    const leadId = await makeLead("Sana", "+919847700707");
    const runId = await startRun(flowId, leadId);

    const moved = await resolveReply(leadId, "hello?");
    expect(moved).toBe(0);
    expect((await runRow(runId)).status).toBe("running");
  });
});

describe("startFlows", () => {
  it("puts a lead into a flow once, never twice", async () => {
    // A lead re-entering a stage twice in a week must not get two
    // concurrent copies of the same sequence. The partial unique index is
    // what guarantees it, so this is really a test of the index.
    const { flowId } = await makeFlow(`once-${randomUUID().slice(0, 6)}`);
    const leadId = await makeLead("Deepa", "+919847700808");

    expect(await startFlows("manual", { leadId })).toBeGreaterThan(0);
    const again = await startFlows("manual", { leadId });

    const runs = await db
      .select()
      .from(whatsappFlowRuns)
      .where(and(eq(whatsappFlowRuns.flowId, flowId), eq(whatsappFlowRuns.leadId, leadId)));
    expect(runs).toHaveLength(1);
    expect(again).toBe(0);
  });

  it("ignores a flow that is switched off", async () => {
    const { flowId } = await makeFlow(`off-${randomUUID().slice(0, 6)}`, false);
    const leadId = await makeLead("Arun", "+919847700909");

    await startFlows("manual", { leadId });

    const runs = await db
      .select()
      .from(whatsappFlowRuns)
      .where(eq(whatsappFlowRuns.flowId, flowId));
    expect(runs).toHaveLength(0);
  });

  it("never starts anything for a lead marked do-not-contact", async () => {
    const { flowId } = await makeFlow(`dnc2-${randomUUID().slice(0, 6)}`);
    const leadId = await makeLead("Farhan", "+919847701010");
    await db.update(leads).set({ doNotContact: true }).where(eq(leads.id, leadId));

    await startFlows("manual", { leadId });

    const runs = await db
      .select()
      .from(whatsappFlowRuns)
      .where(eq(whatsappFlowRuns.flowId, flowId));
    expect(runs).toHaveLength(0);
  });
});

/**
 * The trigger says when a run may start; `applies_to` says for whom.
 *
 * Worth testing against the database rather than trusting
 * `evaluateConditions`' own unit tests, because the thing that breaks is
 * not the evaluator — it is the lead row reaching it. `startFlows` used
 * to select three columns, so every condition naming any other column
 * would have read `undefined` and quietly matched nothing. An automation
 * that reaches nobody looks exactly like one nobody has triggered yet.
 */
describe("startFlows honours a flow's conditions", () => {
  async function flowFor(label: string, appliesTo: Record<string, unknown> | null) {
    const { flowId } = await makeFlow(label);
    await db.update(whatsappFlows).set({ appliesTo }).where(eq(whatsappFlows.id, flowId));
    return flowId;
  }

  async function runsOf(flowId: string) {
    return db.select().from(whatsappFlowRuns).where(eq(whatsappFlowRuns.flowId, flowId));
  }

  it("starts when every condition matches", async () => {
    const flowId = await flowFor(`cond-hit-${randomUUID().slice(0, 6)}`, {
      all: [{ field: "education_status", op: "equals", value: "12th" }],
    });
    const leadId = await makeLead("Nithya", "+919847701111");
    await db.update(leads).set({ educationStatus: "12th" }).where(eq(leads.id, leadId));

    await startFlows("manual", { leadId });
    expect(await runsOf(flowId)).toHaveLength(1);
  });

  it("does not start when a condition fails", async () => {
    const flowId = await flowFor(`cond-miss-${randomUUID().slice(0, 6)}`, {
      all: [{ field: "education_status", op: "equals", value: "12th" }],
    });
    const leadId = await makeLead("Vivek", "+919847701212");
    await db.update(leads).set({ educationStatus: "graduate" }).where(eq(leads.id, leadId));

    await startFlows("manual", { leadId });
    expect(await runsOf(flowId)).toHaveLength(0);
  });

  it("reads the lead source, which lives on a differently named column", async () => {
    // `source` maps to `last_touch_source`, not a column called source.
    // The exact kind of mapping a three-column select would have broken.
    const flowId = await flowFor(`cond-source-${randomUUID().slice(0, 6)}`, {
      all: [{ field: "source", op: "equals", value: "meta_ads" }],
    });
    const leadId = await makeLead("Rahul", "+919847701313");
    await db.update(leads).set({ lastTouchSource: "meta_ads" }).where(eq(leads.id, leadId));

    await startFlows("manual", { leadId });
    expect(await runsOf(flowId)).toHaveLength(1);
  });

  it("matches an exam inside the interested-exams array", async () => {
    // text[] with `contains` — `equals` against an array never matches,
    // which is why the builder refuses to offer it.
    const flowId = await flowFor(`cond-exam-${randomUUID().slice(0, 6)}`, {
      all: [{ field: "interested_exams", op: "contains", value: "nift_ug" }],
    });
    const leadId = await makeLead("Aleena", "+919847701414");
    await db
      .update(leads)
      .set({ interestedExams: ["nid", "nift_ug"] })
      .where(eq(leads.id, leadId));

    await startFlows("manual", { leadId });
    expect(await runsOf(flowId)).toHaveLength(1);
  });

  it("ANDs them, so one failure is enough to hold it back", async () => {
    const flowId = await flowFor(`cond-and-${randomUUID().slice(0, 6)}`, {
      all: [
        { field: "source", op: "equals", value: "meta_ads" },
        { field: "education_status", op: "equals", value: "12th" },
      ],
    });
    const leadId = await makeLead("Sana", "+919847701515");
    await db
      .update(leads)
      .set({ lastTouchSource: "meta_ads", educationStatus: "graduate" })
      .where(eq(leads.id, leadId));

    await startFlows("manual", { leadId });
    expect(await runsOf(flowId)).toHaveLength(0);
  });

  it("reaches everybody when there are no conditions", async () => {
    // What every flow written before this column means. If null were
    // read as "matches nothing", every existing automation would stop.
    const flowId = await flowFor(`cond-null-${randomUUID().slice(0, 6)}`, null);
    const leadId = await makeLead("Joseph", "+919847701616");

    await startFlows("manual", { leadId });
    expect(await runsOf(flowId)).toHaveLength(1);
  });
});
