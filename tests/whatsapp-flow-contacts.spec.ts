/**
 * Automation flows for the contact database, against a real database.
 * Only `sendTemplateMessage` is mocked.
 */
import { config as loadEnv } from "dotenv";
import { eq, inArray, like, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

loadEnv({ path: ".env" });
loadEnv({ path: ".env.local", override: true });
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set.");
if (!process.env.INTEGRATION_ENCRYPTION_KEY) throw new Error("INTEGRATION_ENCRYPTION_KEY is not set.");

vi.mock("../src/lib/integrations/whatsapp/client", () => ({ sendTemplateMessage: vi.fn() }));
vi.mock("../src/lib/notifications/notify", () => ({ notify: vi.fn() }));

const { sendTemplateMessage } = await import("../src/lib/integrations/whatsapp/client");
const { advanceRuns, enrolNewListMembers, recordFlowDelivery, resolveContactReply, startFlowForContacts } = await import("../src/lib/whatsapp/flow-runner");
const { db } = await import("../src/lib/db/client");
const { describeDeliveryError } = await import("../src/lib/whatsapp/delivery-errors");
const {
  contactListMembers, contactLists, contacts, leadIdentifiers, leads,
  whatsappFlowRunEvents, whatsappFlowRuns, whatsappFlowSteps, whatsappFlows, whatsappSuppressions,
} = await import("../src/lib/db/schema");
const { setIntegrationCredential, deleteIntegrationCredential } = await import("../src/lib/integrations/credentials");

const MARK = "FlowContactTest";
let listId: string;
let flowId: string;

async function sweep() {
  await db.delete(whatsappFlows).where(like(whatsappFlows.name, `${MARK}%`));
  const cs = await db.select({ id: contacts.id }).from(contacts).where(like(contacts.name, `${MARK}%`));
  const ids = cs.map((c) => c.id);
  if (ids.length) await db.delete(contactListMembers).where(inArray(contactListMembers.contactId, ids));
  await db.delete(contacts).where(like(contacts.name, `${MARK}%`));
  await db.delete(contactLists).where(like(contactLists.name, `${MARK}%`));
  const ls = await db.select({ id: leads.id }).from(leads).where(like(leads.studentName, `${MARK}%`));
  const lids = ls.map((l) => l.id);
  if (lids.length) await db.delete(leadIdentifiers).where(inArray(leadIdentifiers.leadId, lids));
  await db.delete(leads).where(like(leads.studentName, `${MARK}%`));
  await db.delete(whatsappSuppressions).where(eq(whatsappSuppressions.reason, MARK));
}

async function addContact(name: string, phone: string) {
  const [c] = await db.insert(contacts).values({ name: `${MARK} ${name}`, phone }).returning({ id: contacts.id });
  await db.insert(contactListMembers).values({ contactId: c.id, listId });
  return c.id;
}

beforeAll(async () => {
  await sweep();
  await setIntegrationCredential("whatsapp", "access_token", "t");
  await setIntegrationCredential("whatsapp", "phone_number_id", "123");
  const [l] = await db.insert(contactLists).values({ name: `${MARK} list`, useForWhatsapp: true }).returning({ id: contactLists.id });
  listId = l.id;
  const [f] = await db
    .insert(whatsappFlows)
    .values({ name: `${MARK} flow`, audience: "contact", triggerType: "manual", isActive: true })
    .returning({ id: whatsappFlows.id });
  flowId = f.id;
  await db.insert(whatsappFlowSteps).values([
    { flowId, position: 1, kind: "send_template", config: { templateName: "seminar_followup", templateLanguage: "en_US", params: [] } },
    {
      flowId, position: 2, kind: "wait_for_reply",
      config: { hours: 24, branches: [{ match: "yes", goto: 3 }], onOther: "stop", onTimeout: "stop" },
    },
    { flowId, position: 3, kind: "send_template", config: { templateName: "seminar_details", templateLanguage: "en_US", params: [] } },
  ]);
});
afterAll(async () => {
  await sweep();
  await deleteIntegrationCredential("whatsapp", "access_token");
  await deleteIntegrationCredential("whatsapp", "phone_number_id");
});
beforeEach(() => {
  vi.mocked(sendTemplateMessage).mockReset();
  vi.mocked(sendTemplateMessage).mockResolvedValue("wamid.test");
});

describe("flows for database contacts", () => {
  it("starts for eligible contacts only, and messages them", async () => {
    const ok = await addContact("ok", "+919847620001");
    const optedOut = await addContact("optout", "+919847620002");
    await db.insert(whatsappSuppressions).values({ phone: "+919847620002", reason: MARK, source: "keyword" });
    const isLead = await addContact("islead", "+919847620003");
    const [lead] = await db.insert(leads).values({ studentName: `${MARK} lead`, primaryPhone: "+919847620003" }).returning({ id: leads.id });
    await db.insert(leadIdentifiers).values({ leadId: lead.id, kind: "phone", valueNormalised: "+919847620003" });

    const result = await startFlowForContacts(flowId, [listId]);
    expect(result.started).toBe(1);

    const runs = await db.select().from(whatsappFlowRuns).where(eq(whatsappFlowRuns.flowId, flowId));
    expect(runs.map((r) => r.contactId)).toEqual([ok]);
    expect(runs[0].leadId).toBeNull();
    expect([optedOut, isLead]).not.toContain(runs[0].contactId);

    await advanceRuns();
    expect(sendTemplateMessage).toHaveBeenCalledTimes(1);
    expect(vi.mocked(sendTemplateMessage).mock.calls[0][2]).toBe("+919847620001");
  });

  it("a second start does not double-enrol someone already in it", async () => {
    const again = await startFlowForContacts(flowId, [listId]);
    expect(again.started).toBe(0);
  });

  it("branches on the contact's reply, found by phone", async () => {
    const moved = await resolveContactReply("919847620001", "yes");
    expect(moved).toBe(1);
    expect(sendTemplateMessage).toHaveBeenCalledWith("123", "t", "+919847620001", "seminar_details", "en_US", undefined);
  });

  it("stops the run before a send if the contact has become a lead", async () => {
    const c = await addContact("late", "+919847620004");
    await db.insert(whatsappFlowRuns).values({ flowId, contactId: c, status: "running", wakeAt: new Date() });
    await db.update(contacts).set({ leadId: (await db.insert(leads).values({ studentName: `${MARK} late lead`, primaryPhone: "+919847620004" }).returning({ id: leads.id }))[0].id }).where(eq(contacts.id, c));
    await advanceRuns();
    expect(sendTemplateMessage).not.toHaveBeenCalled();
    const [run] = await db.select().from(whatsappFlowRuns).where(eq(whatsappFlowRuns.contactId, c));
    expect(run.status).toBe("stopped");
  });

  it("refuses a run with no subject", async () => {
    await expect(
      db.execute(sql`insert into whatsapp_flow_runs (flow_id) values (${flowId}::uuid)`),
    ).rejects.toThrow();
  });
});

describe("when somebody is added to a database", () => {
  let watchId: string;
  beforeAll(async () => {
    const [f] = await db
      .insert(whatsappFlows)
      .values({
        name: `${MARK} watch`,
        audience: "contact",
        triggerType: "list_joined",
        triggerConfig: { listIds: [listId], from: new Date().toISOString() },
        isActive: true,
      })
      .returning({ id: whatsappFlows.id });
    watchId = f.id;
    await db.insert(whatsappFlowSteps).values({
      flowId: watchId,
      position: 1,
      kind: "send_template",
      config: { templateName: "welcome", templateLanguage: "en_US", params: [] },
    });
  });

  it("messages only people added after it was set up, once, and not leads or opted-out people", async () => {
    // Joined before the automation existed: must not be messaged.
    const [old] = await db.insert(contacts).values({ name: `${MARK} old`, phone: "+919847630001" }).returning({ id: contacts.id });
    await db.insert(contactListMembers).values({ contactId: old.id, listId, addedAt: new Date(Date.now() - 86_400_000) });

    const fresh = await addContact("fresh", "+919847630002");
    await addContact("freshoptout", "+919847630003");
    await db.insert(whatsappSuppressions).values({ phone: "+919847630003", reason: MARK, source: "keyword" });

    const first = await enrolNewListMembers();
    expect(first.started).toBeGreaterThanOrEqual(1);
    const runs = await db.select().from(whatsappFlowRuns).where(eq(whatsappFlowRuns.flowId, watchId));
    expect(runs.map((r) => r.contactId)).toEqual([fresh]);

    await advanceRuns();
    const sentTo = vi.mocked(sendTemplateMessage).mock.calls.map((c) => c[2]);
    expect(sentTo).toContain("+919847630002");
    expect(sentTo).not.toContain("+919847630001");

    // A second sweep must not start them again, even after the run finished.
    await enrolNewListMembers();
    const again = await db.select().from(whatsappFlowRuns).where(eq(whatsappFlowRuns.flowId, watchId));
    expect(again).toHaveLength(1);
  });
});

describe("a per-person document on the first message", () => {
  it("attaches the contact's own link as the header, and stops a run that has none", async () => {
    const [f] = await db
      .insert(whatsappFlows)
      .values({ name: `${MARK} doc`, audience: "contact", triggerType: "manual", isActive: true })
      .returning({ id: whatsappFlows.id });
    await db.insert(whatsappFlowSteps).values({
      flowId: f.id,
      position: 1,
      kind: "send_template",
      config: { templateName: "admit_card", templateLanguage: "en_US", params: [], headerDocument: "contact" },
    });
    const withDoc = await addContact("withdoc", "+919847640001");
    await db.update(contacts).set({ fields: { document_url: "https://example.com/pass.pdf", document_name: "Admit card.pdf" } }).where(eq(contacts.id, withDoc));
    const noDoc = await addContact("nodoc", "+919847640002");

    await startFlowForContacts(f.id, [listId]);
    await advanceRuns();

    const calls = vi.mocked(sendTemplateMessage).mock.calls.filter((c) => c[3] === "admit_card");
    expect(calls).toHaveLength(1);
    expect(calls[0][2]).toBe("+919847640001");
    expect(calls[0][6]).toEqual({ kind: "document", link: "https://example.com/pass.pdf", filename: "Admit card.pdf" });
    const runs = await db.select().from(whatsappFlowRuns).where(eq(whatsappFlowRuns.flowId, f.id));
    expect(runs.find((r) => r.contactId === noDoc)?.status).not.toBe("running");
  });
});

describe("what Meta says after a message was accepted", () => {
  it("records a delivery failure on the run that sent it, in plain words", async () => {
    const [f] = await db
      .insert(whatsappFlows)
      .values({ name: `${MARK} delivery`, audience: "contact", triggerType: "manual", isActive: true })
      .returning({ id: whatsappFlows.id });
    await db.insert(whatsappFlowSteps).values({
      flowId: f.id, position: 1, kind: "send_template",
      config: { templateName: "delivery_probe", templateLanguage: "en_US", params: [] },
    });
    // Built by hand rather than by advanceRuns(): other spec files share this
    // database and sweep runs too, so a send here could be taken by them.
    const contactId = await addContact("delivery", "+919847650001");
    const [run] = await db.insert(whatsappFlowRuns).values({ flowId: f.id, contactId, status: "completed" }).returning({ id: whatsappFlowRuns.id });
    await db.insert(whatsappFlowRunEvents).values({ runId: run.id, kind: "sent", detail: "Send \"delivery_probe\" · wamid.DELIVERYPROBE1" });

    await recordFlowDelivery("wamid.DELIVERYPROBE1", "failed", describeDeliveryError(131042, "Payment issue"));
    await recordFlowDelivery("wamid.UNKNOWN", "failed", "ignored");

    const events = await db.select().from(whatsappFlowRunEvents).where(eq(whatsappFlowRunEvents.runId, run.id));
    const failed = events.find((e) => e.kind === "delivery_failed");
    expect(failed?.detail).toMatch(/payment method/);
    expect(events.some((e) => e.kind === "sent" && e.detail?.includes("wamid.DELIVERYPROBE1"))).toBe(true);
  });

  it("explains known codes and still says something for unknown ones", () => {
    expect(describeDeliveryError(131053)).toMatch(/download the attached file/);
    expect(describeDeliveryError(999999, "Odd")).toBe("Error 999999 (Odd)");
  });
});

describe("timed steps", () => {
  it("a run parks at a wait_until step until that moment, then carries on", async () => {
    const [f] = await db
      .insert(whatsappFlows)
      .values({ name: `${MARK} timed`, audience: "contact", triggerType: "manual", isActive: true })
      .returning({ id: whatsappFlows.id });
    const [wait] = await db
      .insert(whatsappFlowSteps)
      .values({ flowId: f.id, position: 1, kind: "wait_until", config: { at: "2099-01-01T09:00" } })
      .returning({ id: whatsappFlowSteps.id });
    await db.insert(whatsappFlowSteps).values({
      flowId: f.id, position: 2, kind: "send_template",
      config: { templateName: "timed_probe", templateLanguage: "en_US", params: [] },
    });
    await addContact("timed", "+919847660001");
    await startFlowForContacts(f.id, [listId]);
    await advanceRuns();

    const [run] = await db.select().from(whatsappFlowRuns).where(eq(whatsappFlowRuns.flowId, f.id));
    expect(run.status).toBe("waiting");
    expect(run.wakeAt?.getUTCFullYear()).toBe(2099);
    expect(wait.id).toBeTruthy();
    expect(vi.mocked(sendTemplateMessage).mock.calls.some((c) => c[3] === "timed_probe")).toBe(false);
  });
});
