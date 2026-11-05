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
const { advanceRuns, resolveContactReply, startFlowForContacts } = await import("../src/lib/whatsapp/flow-runner");
const { db } = await import("../src/lib/db/client");
const {
  contactListMembers, contactLists, contacts, leadIdentifiers, leads,
  whatsappFlowRuns, whatsappFlowSteps, whatsappFlows, whatsappSuppressions,
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
