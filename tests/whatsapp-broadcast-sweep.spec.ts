/**
 * Integration test for the WhatsApp broadcast sweep cron — needs a real
 * database with migrations applied and INTEGRATION_ENCRYPTION_KEY set:
 *
 *   npm run db:migrate && npm test
 *
 * Mocks only `sendTemplateMessage` (the one real network call); batch
 * selection, per-recipient status transitions, counsellor-number routing,
 * and broadcast completion all run for real against Postgres.
 */
import { randomUUID } from "node:crypto";

import { config as loadEnv } from "dotenv";
import { eq, sql } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

loadEnv({ path: ".env" });
loadEnv({ path: ".env.local", override: true });

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set — see the file header for how to run this suite.");
}
if (!process.env.INTEGRATION_ENCRYPTION_KEY) {
  throw new Error("INTEGRATION_ENCRYPTION_KEY is not set — see .env.local.");
}
process.env.CRON_SECRET ??= "test-cron-secret";

vi.mock("../src/lib/integrations/whatsapp/client", () => ({
  sendTemplateMessage: vi.fn(),
}));

const { sendTemplateMessage } = await import("../src/lib/integrations/whatsapp/client");
const { GET } = await import("../src/app/api/cron/whatsapp-broadcast-sweep/route");
const { db } = await import("../src/lib/db/client");
const { leads, profiles, roles, tags, whatsappBroadcastRecipients, whatsappBroadcasts } = await import("../src/lib/db/schema");
const { setIntegrationCredential, deleteIntegrationCredential } = await import("../src/lib/integrations/credentials");

const MARKER = "WhatsAppBroadcastSweepTest";

function request(): Request {
  return new Request("https://example.com/api/cron/whatsapp-broadcast-sweep", {
    headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
  });
}

let counsellorId: string;
let tagId: string;

async function makeLead(tag: string, phone: string, assignedTo: string | null) {
  const [lead] = await db
    .insert(leads)
    .values({ studentName: `${MARKER} ${tag}`, primaryPhone: phone, assignedTo })
    .returning({ id: leads.id });
  return lead.id;
}

async function makeBroadcast(name: string) {
  const [broadcast] = await db
    .insert(whatsappBroadcasts)
    .values({ name: `${MARKER} ${name}`, tagId, templateName: "demo_followup", templateLanguage: "en_US", status: "sending", totalRecipients: 1 })
    .returning({ id: whatsappBroadcasts.id });
  return broadcast.id;
}

async function sweep() {
  const testLeads = await db.select({ id: leads.id }).from(leads).where(sql`${leads.studentName} like ${MARKER + "%"}`);
  for (const lead of testLeads) {
    await db.delete(whatsappBroadcastRecipients).where(eq(whatsappBroadcastRecipients.leadId, lead.id));
  }
  await db.delete(leads).where(sql`${leads.studentName} like ${MARKER + "%"}`);
  await db.delete(whatsappBroadcasts).where(sql`${whatsappBroadcasts.name} like ${MARKER + "%"}`);
}

beforeAll(async () => {
  await sweep();

  const [counsellorRole] = await db.select({ id: roles.id }).from(roles).where(eq(roles.code, "counsellor"));
  if (!counsellorRole) throw new Error("Expected seeded role 'counsellor' — run `npm run db:seed` first.");

  counsellorId = randomUUID();
  const email = `${MARKER.toLowerCase()}.counsellor.${counsellorId.slice(0, 8)}@test.invalid`;
  await db.execute(sql`insert into auth.users (id, email) values (${counsellorId}, ${email})`);
  await db.insert(profiles).values({ id: counsellorId, fullName: `${MARKER} Counsellor`, email, roleId: counsellorRole.id });
  await setIntegrationCredential("whatsapp", "access_token", "fake-access-token");
  // One org-level number for the whole institute, not one per
  // counsellor — a number on the Cloud API can no longer be used in the
  // WhatsApp Business app, and AFD's counsellors keep those.
  await setIntegrationCredential("whatsapp", "phone_number_id", `${MARKER}-phone-number-id`);

  const [tag] = await db.insert(tags).values({ name: `${MARKER} Tag ${randomUUID().slice(0, 8)}` }).returning({ id: tags.id });
  tagId = tag.id;
});

afterAll(async () => {
  await sweep();
  await deleteIntegrationCredential("whatsapp", "access_token");
  await deleteIntegrationCredential("whatsapp", "phone_number_id");
  await db.delete(tags).where(eq(tags.id, tagId));
  await db.delete(profiles).where(eq(profiles.id, counsellorId));
  await db.execute(sql`delete from auth.users where id = ${counsellorId}`);
});

afterEach(() => {
  vi.mocked(sendTemplateMessage).mockReset();
});

describe("GET /api/cron/whatsapp-broadcast-sweep", () => {
  it("rejects a request without the correct CRON_SECRET", async () => {
    const res = await GET(new Request("https://example.com/api/cron/whatsapp-broadcast-sweep"));
    expect(res.status).toBe(401);
  });

  it("sends a queued recipient on the institute number and marks it sent", async () => {
    vi.mocked(sendTemplateMessage).mockResolvedValue("wamid.sent123");

    const broadcastId = await makeBroadcast("basic");
    const leadId = await makeLead("basic", "+919847600401", counsellorId);
    await db.insert(whatsappBroadcastRecipients).values({ broadcastId, leadId, phone: "+919847600401", status: "queued" });

    const res = await GET(request());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.sent).toBeGreaterThanOrEqual(1);

    const [recipient] = await db.select().from(whatsappBroadcastRecipients).where(eq(whatsappBroadcastRecipients.leadId, leadId));
    expect(recipient.status).toBe("sent");
    expect(recipient.waMessageId).toBe("wamid.sent123");

    // The trailing `undefined` is the media header: a broadcast without
    // one must send no header component at all, since Meta rejects one on
    // a template whose header is text.
    expect(sendTemplateMessage).toHaveBeenCalledWith(`${MARKER}-phone-number-id`, "fake-access-token", "+919847600401", "demo_followup", "en_US", undefined, undefined);
  });

  it("marks the broadcast completed once its only recipient is done", async () => {
    vi.mocked(sendTemplateMessage).mockResolvedValue("wamid.sent456");

    const broadcastId = await makeBroadcast("completes");
    const leadId = await makeLead("completes", "+919847600402", counsellorId);
    await db.insert(whatsappBroadcastRecipients).values({ broadcastId, leadId, phone: "+919847600402", status: "queued" });

    await GET(request());

    const [broadcast] = await db.select().from(whatsappBroadcasts).where(eq(whatsappBroadcasts.id, broadcastId));
    expect(broadcast.status).toBe("completed");
    expect(broadcast.sentCount).toBe(1);
    expect(broadcast.completedAt).not.toBeNull();
  });

  /**
   * A lead with no counsellor used to fail the send, because the sweep
   * looked up that counsellor's own number. On one institute number
   * there is nothing to look up, so an unowned lead is reached like
   * anybody else — which is the point of a broadcast.
   */
  it("still reaches a lead who has no assigned counsellor", async () => {
    vi.mocked(sendTemplateMessage).mockResolvedValue("wamid.sent789");

    const broadcastId = await makeBroadcast("unassigned");
    const leadId = await makeLead("unassigned", "+919847600403", null);
    await db.insert(whatsappBroadcastRecipients).values({ broadcastId, leadId, phone: "+919847600403", status: "queued" });

    const res = await GET(request());
    expect(res.status).toBe(200);

    const [recipient] = await db.select().from(whatsappBroadcastRecipients).where(eq(whatsappBroadcastRecipients.leadId, leadId));
    expect(recipient.status).toBe("sent");
    expect(sendTemplateMessage).toHaveBeenCalledWith(
      `${MARKER}-phone-number-id`,
      "fake-access-token",
      "+919847600403",
      "demo_followup",
      "en_US",
      undefined,
      undefined,
    );

    const [broadcast] = await db.select().from(whatsappBroadcasts).where(eq(whatsappBroadcasts.id, broadcastId));
    expect(broadcast.status).toBe("completed");
  });

  it("passes the broadcast's header media to every recipient", async () => {
    // Uploaded once when the campaign was composed, then reused: a
    // 400-person send pushes the video across the wire once, not 400
    // times. If this stopped being passed through, every message would
    // arrive without the picture and Meta would reject the send outright.
    vi.mocked(sendTemplateMessage).mockResolvedValue("wamid.media1");

    const broadcastId = await makeBroadcast("with-header");
    await db
      .update(whatsappBroadcasts)
      .set({ headerMediaId: "media-abc", headerMediaKind: "image", headerMediaFilename: "poster.jpg" })
      .where(eq(whatsappBroadcasts.id, broadcastId));
    const leadId = await makeLead("with-header", "+919847600405", counsellorId);
    await db.insert(whatsappBroadcastRecipients).values({ broadcastId, leadId, phone: "+919847600405", status: "queued" });

    await GET(request());

    expect(sendTemplateMessage).toHaveBeenCalledWith(
      `${MARKER}-phone-number-id`,
      "fake-access-token",
      "+919847600405",
      "demo_followup",
      "en_US",
      undefined,
      { kind: "image", mediaId: "media-abc" },
    );
  });

  it("sends without a header when the stored kind is not one Meta knows", async () => {
    // The kind column is plain text, so a nonsense value drops the header
    // rather than throwing away the whole batch.
    vi.mocked(sendTemplateMessage).mockResolvedValue("wamid.media2");

    const broadcastId = await makeBroadcast("bad-header-kind");
    await db
      .update(whatsappBroadcasts)
      .set({ headerMediaId: "media-def", headerMediaKind: "sticker" })
      .where(eq(whatsappBroadcasts.id, broadcastId));
    const leadId = await makeLead("bad-header-kind", "+919847600406", counsellorId);
    await db.insert(whatsappBroadcastRecipients).values({ broadcastId, leadId, phone: "+919847600406", status: "queued" });

    await GET(request());

    const [recipient] = await db
      .select()
      .from(whatsappBroadcastRecipients)
      .where(eq(whatsappBroadcastRecipients.leadId, leadId));
    expect(recipient.status).toBe("sent");
    expect(vi.mocked(sendTemplateMessage).mock.calls[0][6]).toBeUndefined();
  });

  it("leaves a scheduled broadcast alone until its time has come", async () => {
    // The whole point of scheduling. Composing on Monday for Tuesday
    // morning is worthless if Monday night's sweep sends it.
    const broadcastId = await makeBroadcast("future");
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await db
      .update(whatsappBroadcasts)
      .set({ status: "scheduled", scheduledFor: tomorrow, startedAt: null })
      .where(eq(whatsappBroadcasts.id, broadcastId));
    const leadId = await makeLead("future", "+919847600505", counsellorId);
    await db
      .insert(whatsappBroadcastRecipients)
      .values({ broadcastId, leadId, phone: "+919847600505", status: "queued" });

    await GET(request());

    const [broadcast] = await db
      .select()
      .from(whatsappBroadcasts)
      .where(eq(whatsappBroadcasts.id, broadcastId));
    expect(broadcast.status).toBe("scheduled");
    expect(broadcast.startedAt).toBeNull();

    const [recipient] = await db
      .select()
      .from(whatsappBroadcastRecipients)
      .where(eq(whatsappBroadcastRecipients.leadId, leadId));
    expect(recipient.status).toBe("queued");
  });

  it("starts a scheduled broadcast whose time has passed, even if the sweep was late", async () => {
    // `<=`, not an equality on the minute: the sweep runs on a cron and
    // will essentially never be looking at the exact scheduled minute, so
    // one whose time passed hours ago has to go late rather than never.
    const broadcastId = await makeBroadcast("past");
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    await db
      .update(whatsappBroadcasts)
      .set({ status: "scheduled", scheduledFor: yesterday, startedAt: null })
      .where(eq(whatsappBroadcasts.id, broadcastId));
    const leadId = await makeLead("past", "+919847600606", counsellorId);
    await db
      .insert(whatsappBroadcastRecipients)
      .values({ broadcastId, leadId, phone: "+919847600606", status: "queued" });

    vi.mocked(sendTemplateMessage).mockResolvedValue("wamid.scheduled");
    await GET(request());

    const [broadcast] = await db
      .select()
      .from(whatsappBroadcasts)
      .where(eq(whatsappBroadcasts.id, broadcastId));
    // Completed, not merely started: promotion and sending both happen in
    // the same run, so a scheduled campaign does not lose a whole cron
    // cycle waiting to begin.
    expect(broadcast.status).toBe("completed");
    expect(broadcast.startedAt).not.toBeNull();

    const [recipient] = await db
      .select()
      .from(whatsappBroadcastRecipients)
      .where(eq(whatsappBroadcastRecipients.leadId, leadId));
    expect(recipient.status).toBe("sent");
  });

  it("stops dead when a broadcast is cancelled mid-send", async () => {
    // Cancelling is a status change and nothing else; the sweep's own
    // `status = 'sending'` filter is what actually halts it. If that ever
    // stopped being true, cancelling would become decorative.
    const broadcastId = await makeBroadcast("cancelled");
    await db
      .update(whatsappBroadcasts)
      .set({ status: "cancelled", cancelledAt: new Date() })
      .where(eq(whatsappBroadcasts.id, broadcastId));
    const leadId = await makeLead("cancelled", "+919847600707", counsellorId);
    await db
      .insert(whatsappBroadcastRecipients)
      .values({ broadcastId, leadId, phone: "+919847600707", status: "queued" });

    await GET(request());

    const [recipient] = await db
      .select()
      .from(whatsappBroadcastRecipients)
      .where(eq(whatsappBroadcastRecipients.leadId, leadId));
    expect(recipient.status).toBe("queued");
    expect(sendTemplateMessage).not.toHaveBeenCalled();
  });

  it("sends each recipient their OWN resolved values", async () => {
    const broadcastId = await makeBroadcast("personalised");
    await db
      .update(whatsappBroadcasts)
      .set({ bodyParams: [{ kind: "variable", key: "first_name", fallback: "there" }] })
      .where(eq(whatsappBroadcasts.id, broadcastId));

    const anjali = await makeLead("anjali", "+919847600808", counsellorId);
    const rajesh = await makeLead("rajesh", "+919847600909", counsellorId);
    await db.insert(whatsappBroadcastRecipients).values([
      { broadcastId, leadId: anjali, phone: "+919847600808", status: "queued", params: ["Anjali"] },
      { broadcastId, leadId: rajesh, phone: "+919847600909", status: "queued", params: ["Rajesh"] },
    ]);

    vi.mocked(sendTemplateMessage).mockResolvedValue("wamid.personalised");
    await GET(request());

    // Position 5 is the body params argument. Two people, two different
    // greetings — before this the same word went to the whole audience.
    const byPhone = new Map(
      vi.mocked(sendTemplateMessage).mock.calls.map((call) => [call[2], call[5]]),
    );
    expect(byPhone.get("+919847600808")).toEqual(["Anjali"]);
    expect(byPhone.get("+919847600909")).toEqual(["Rajesh"]);
  });

  it("still uses the old single body_param for a broadcast composed before personalisation", async () => {
    // Nothing sent before today changes meaning.
    const broadcastId = await makeBroadcast("legacy");
    await db
      .update(whatsappBroadcasts)
      .set({ bodyParam: "NIFT 2027", bodyParams: null })
      .where(eq(whatsappBroadcasts.id, broadcastId));
    const leadId = await makeLead("legacy", "+919847601010", counsellorId);
    await db
      .insert(whatsappBroadcastRecipients)
      .values({ broadcastId, leadId, phone: "+919847601010", status: "queued", params: null });

    vi.mocked(sendTemplateMessage).mockResolvedValue("wamid.legacy");
    await GET(request());

    const call = vi
      .mocked(sendTemplateMessage)
      .mock.calls.find((entry) => entry[2] === "+919847601010");
    expect(call?.[5]).toEqual(["NIFT 2027"]);
  });

  it("never touches a recipient whose broadcast isn't in 'sending' status", async () => {
    const broadcastId = await makeBroadcast("draft");
    await db.update(whatsappBroadcasts).set({ status: "draft" }).where(eq(whatsappBroadcasts.id, broadcastId));
    const leadId = await makeLead("draft", "+919847600404", counsellorId);
    await db.insert(whatsappBroadcastRecipients).values({ broadcastId, leadId, phone: "+919847600404", status: "queued" });

    await GET(request());

    const [recipient] = await db.select().from(whatsappBroadcastRecipients).where(eq(whatsappBroadcastRecipients.leadId, leadId));
    expect(recipient.status).toBe("queued");
  });
});
