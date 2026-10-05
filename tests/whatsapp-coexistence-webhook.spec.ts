/**
 * Coexistence, end to end against Postgres.
 *
 *   npm run db:migrate && npm test
 *
 * The thing being tested is the inversion. The institute's broadcast
 * number must never create a lead from an inbound message — a reply
 * there is somebody who pressed a button on a campaign. A counsellor's
 * own number must, because a stranger asking about NIFT coaching is the
 * highest-intent enquiry this institute gets and until now it was typed
 * in by hand or lost. Same endpoint, same payload shape, opposite rule,
 * decided by a column on the number.
 */
import { createHmac, randomUUID } from "node:crypto";

import { config as loadEnv } from "dotenv";
import { and, eq, like, or, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

loadEnv({ path: ".env" });
loadEnv({ path: ".env.local", override: true });

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set — see the file header.");
if (!process.env.INTEGRATION_ENCRYPTION_KEY) throw new Error("INTEGRATION_ENCRYPTION_KEY is not set.");

const { POST } = await import("../src/app/api/webhooks/whatsapp/route");
const { db } = await import("../src/lib/db/client");
const { leadIdentifiers, leads, profiles, roles, webhookEvents, whatsappMessages, whatsappNumbers } =
  await import("../src/lib/db/schema");
const { setIntegrationCredential, deleteIntegrationCredential } = await import(
  "../src/lib/integrations/credentials"
);

const APP_SECRET = "test-coex-app-secret";
const MARKER = "CoexWebhookTest";

const COEX_PHONE_ID = `${MARKER}-coex-phone-id`;
const API_PHONE_ID = `${MARKER}-api-phone-id`;
const BUSINESS_DISPLAY = "919847600001";

let counsellorId: string;
let coexNumberId: string;

function sign(body: string): string {
  return `sha256=${createHmac("sha256", APP_SECRET).update(body, "utf8").digest("hex")}`;
}

function post(body: string): Promise<Response> {
  return POST(
    new Request("https://example.com/api/webhooks/whatsapp", {
      method: "POST",
      headers: { "content-type": "application/json", "x-hub-signature-256": sign(body) },
      body,
    }),
  );
}

function envelope(field: string, value: Record<string, unknown>, phoneNumberId: string): string {
  return JSON.stringify({
    object: "whatsapp_business_account",
    entry: [
      {
        id: "waba-coex",
        changes: [
          {
            field,
            value: {
              messaging_product: "whatsapp",
              metadata: { phone_number_id: phoneNumberId, display_phone_number: BUSINESS_DISPLAY },
              ...value,
            },
          },
        ],
      },
    ],
  });
}

async function sweep() {
  const testLeads = await db.select({ id: leads.id }).from(leads).where(like(leads.studentName, `${MARKER}%`));
  for (const lead of testLeads) {
    await db.delete(whatsappMessages).where(eq(whatsappMessages.leadId, lead.id));
    await db.delete(leadIdentifiers).where(eq(leadIdentifiers.leadId, lead.id));
  }
  await db.delete(leads).where(like(leads.studentName, `${MARKER}%`));
  await db
    .delete(webhookEvents)
    .where(or(like(webhookEvents.externalId, `%${MARKER}%`), like(webhookEvents.lastError, `%${MARKER}%`)));
  await db.delete(whatsappNumbers).where(like(whatsappNumbers.label, `${MARKER}%`));
  const stale = await db
    .select({ id: profiles.id })
    .from(profiles)
    .where(like(profiles.fullName, `${MARKER}%`));
  await db.delete(profiles).where(like(profiles.fullName, `${MARKER}%`));
  for (const row of stale) {
    await db.execute(sql`delete from auth.users where id = ${row.id}`);
  }
}

beforeAll(async () => {
  await sweep();
  await setIntegrationCredential("whatsapp", "app_secret", APP_SECRET);

  const [counsellorRole] = await db.select({ id: roles.id }).from(roles).where(eq(roles.code, "counsellor"));
  if (!counsellorRole) throw new Error("Expected seeded role 'counsellor' — run `npm run db:seed` first.");

  // auth.users is Supabase-owned and profiles.id carries a real FK to it,
  // so the fixture needs a row in both — the same shape as
  // tests/rls.spec.ts's createFixtureProfile.
  counsellorId = randomUUID();
  const email = `${MARKER.toLowerCase()}.${counsellorId.slice(0, 8)}@test.invalid`;
  await db.execute(sql`insert into auth.users (id, email) values (${counsellorId}, ${email})`);
  await db
    .insert(profiles)
    .values({ id: counsellorId, fullName: `${MARKER} Athira`, email, roleId: counsellorRole.id });

  const [coex] = await db
    .insert(whatsappNumbers)
    .values({
      phoneNumberId: COEX_PHONE_ID,
      displayPhoneNumber: BUSINESS_DISPLAY,
      label: `${MARKER} Athira's phone`,
      mode: "coexistence",
      counsellorId,
      createsLeads: true,
    })
    .returning({ id: whatsappNumbers.id });
  coexNumberId = coex.id;

  await db.insert(whatsappNumbers).values({
    phoneNumberId: API_PHONE_ID,
    displayPhoneNumber: BUSINESS_DISPLAY,
    label: `${MARKER} institute broadcast`,
    mode: "api",
    createsLeads: false,
  });
});

afterAll(async () => {
  await sweep();
  await deleteIntegrationCredential("whatsapp", "app_secret");
});

async function makeLead(name: string, phone: string) {
  const [lead] = await db
    .insert(leads)
    .values({ studentName: `${MARKER} ${name}`, primaryPhone: phone, assignedTo: counsellorId })
    .returning({ id: leads.id });
  await db.insert(leadIdentifiers).values({
    leadId: lead.id,
    kind: "phone",
    valueNormalised: phone,
  });
  return lead.id;
}

describe("an inbound message decides lead creation by the number it arrived on", () => {
  it("creates a lead on a counsellor's coexistence number, assigned to them", async () => {
    const from = "919847600101";
    const body = envelope(
      "messages",
      {
        contacts: [{ profile: { name: `${MARKER} Nivedita` }, wa_id: from }],
        messages: [
          {
            id: `wamid.${randomUUID()}`,
            from,
            timestamp: "1791100000",
            type: "text",
            text: { body: "Hi, is NIFT coaching available?" },
          },
        ],
      },
      COEX_PHONE_ID,
    );

    const response = await post(body);
    expect(response.status).toBe(200);

    const [lead] = await db.select().from(leads).where(eq(leads.primaryPhone, `+91${from.slice(2)}`));
    expect(lead, "a stranger messaging a counsellor is an enquiry").toBeTruthy();
    expect(lead.studentName).toBe(`${MARKER} Nivedita`);
    // The person already holding the conversation is the right owner —
    // routing this through the rules engine to somebody else would be
    // actively wrong.
    expect(lead.assignedTo).toBe(counsellorId);
    expect(lead.firstTouchSource).toBe("WhatsApp");
  });

  it("does not create one on the institute's broadcast number", async () => {
    const from = "919847600102";
    const body = envelope(
      "messages",
      {
        contacts: [{ profile: { name: `${MARKER} ButtonPresser` }, wa_id: from }],
        messages: [
          {
            id: `wamid.${randomUUID()}`,
            from,
            timestamp: "1791100000",
            type: "text",
            text: { body: "STOP" },
          },
        ],
      },
      API_PHONE_ID,
    );

    await post(body);

    const rows = await db.select().from(leads).where(eq(leads.primaryPhone, `+91${from.slice(2)}`));
    expect(rows, "a broadcast reply is not an enquiry").toHaveLength(0);
  });
});

describe("messages the counsellor sent from their phone", () => {
  it("land in the lead's thread as outbound", async () => {
    const phone = "+919847600201";
    const leadId = await makeLead("Echo", phone);
    const messageId = `wamid.${randomUUID()}`;

    const response = await post(
      envelope(
        "smb_message_echoes",
        {
          message_echoes: [
            {
              id: messageId,
              from: BUSINESS_DISPLAY,
              to: "919847600201",
              timestamp: "1791100500",
              type: "text",
              text: { body: "Sending you the fee structure now" },
            },
          ],
        },
        COEX_PHONE_ID,
      ),
    );
    expect(response.status).toBe(200);

    const [message] = await db
      .select()
      .from(whatsappMessages)
      .where(eq(whatsappMessages.waMessageId, messageId));

    expect(message.leadId).toBe(leadId);
    expect(message.direction).toBe("outbound");
    expect(message.body).toBe("Sending you the fee structure now");
    // Attributed to the phone's owner. Nobody is signed in when a
    // webhook arrives, and the conversation is theirs.
    expect(message.sentBy).toBe(counsellorId);
    // Already delivered — a "queued" row would sit in the outbox forever
    // waiting for a status callback that is never coming.
    expect(message.status).toBe("sent");
  });

  it("are not stored for somebody who is not a lead", async () => {
    // A counsellor's phone also messages their colleagues and their
    // mother. A CRM that invented a lead for each is unusable in a week.
    const messageId = `wamid.${randomUUID()}`;
    await post(
      envelope(
        "smb_message_echoes",
        {
          message_echoes: [
            {
              id: messageId,
              from: BUSINESS_DISPLAY,
              to: "919847600999",
              timestamp: "1791100600",
              type: "text",
              text: { body: "see you at 6" },
            },
          ],
        },
        COEX_PHONE_ID,
      ),
    );

    const rows = await db.select().from(whatsappMessages).where(eq(whatsappMessages.waMessageId, messageId));
    expect(rows).toHaveLength(0);

    const leadRows = await db.select().from(leads).where(eq(leads.primaryPhone, "+919847600999"));
    expect(leadRows).toHaveLength(0);
  });

  it("are not duplicated when Meta redelivers the same echo", async () => {
    const phone = "+919847600202";
    await makeLead("Retry", phone);
    const messageId = `wamid.${randomUUID()}`;
    const body = envelope(
      "smb_message_echoes",
      {
        message_echoes: [
          { id: messageId, from: BUSINESS_DISPLAY, to: "919847600202", timestamp: "1791100700", type: "text", text: { body: "ok" } },
        ],
      },
      COEX_PHONE_ID,
    );

    await post(body);
    await post(body);

    const rows = await db.select().from(whatsappMessages).where(eq(whatsappMessages.waMessageId, messageId));
    expect(rows).toHaveLength(1);
  });
});

describe("the 180-day history backfill", () => {
  it("attaches past messages to the lead, keeping their own dates", async () => {
    const phone = "+919847600301";
    const leadId = await makeLead("History", phone);
    const inboundId = `wamid.${randomUUID()}`;
    const outboundId = `wamid.${randomUUID()}`;

    const response = await post(
      envelope(
        "history",
        {
          history: [
            {
              metadata: { phase: 0, chunk_order: 1, progress: 100 },
              threads: [
                {
                  id: "thread-1",
                  messages: [
                    {
                      id: inboundId,
                      from: "919847600301",
                      to: BUSINESS_DISPLAY,
                      timestamp: "1775000000",
                      type: "text",
                      text: { body: "Is the Kochi batch full?" },
                      history_context: { status: "delivered" },
                    },
                    {
                      id: outboundId,
                      from: BUSINESS_DISPLAY,
                      to: "919847600301",
                      timestamp: "1775000100",
                      type: "text",
                      text: { body: "Two seats left" },
                    },
                  ],
                },
              ],
            },
          ],
        },
        COEX_PHONE_ID,
      ),
    );
    expect(response.status).toBe(200);

    const stored = await db
      .select()
      .from(whatsappMessages)
      .where(and(eq(whatsappMessages.leadId, leadId)));

    expect(stored).toHaveLength(2);
    const inbound = stored.find((m) => m.waMessageId === inboundId);
    const outbound = stored.find((m) => m.waMessageId === outboundId);

    expect(inbound?.direction).toBe("inbound");
    expect(outbound?.direction).toBe("outbound");
    // Six months ago, not today — the conversation has to read in order.
    expect(inbound?.occurredAt.toISOString()).toBe(new Date(1775000000 * 1000).toISOString());
  });

  it("counts what it brought in, and does not call itself finished early", async () => {
    const [number] = await db.select().from(whatsappNumbers).where(eq(whatsappNumbers.id, coexNumberId));

    expect(number.historyMessageCount).toBeGreaterThan(0);
    // Phase 0 at 100% is one day of history, not six months. Calling
    // that done is how somebody concludes the backfill lost their chats.
    expect(number.historyCompletedAt).toBeNull();
  });

  it("marks the backfill complete only on the final phase", async () => {
    await post(
      envelope(
        "history",
        { history: [{ metadata: { phase: 2, chunk_order: 9, progress: 100 }, threads: [] }] },
        COEX_PHONE_ID,
      ),
    );

    const [number] = await db.select().from(whatsappNumbers).where(eq(whatsappNumbers.id, coexNumberId));
    expect(number.historyCompletedAt).not.toBeNull();
  });
});

describe("the phone's address book", () => {
  it("is recorded and creates nothing", async () => {
    const response = await post(
      envelope(
        "smb_app_state_sync",
        {
          contacts: [
            { action: "add", contact: { phone_number: "919847600401", full_name: "Dentist" } },
            { action: "add", contact: { phone_number: "919847600402", full_name: "Landlord" } },
          ],
        },
        COEX_PHONE_ID,
      ),
    );
    expect(response.status).toBe(200);

    const created = await db
      .select()
      .from(leads)
      .where(or(eq(leads.primaryPhone, "+919847600401"), eq(leads.primaryPhone, "+919847600402")));
    expect(created, "a counsellor's contacts are not prospective students").toHaveLength(0);

    const [event] = await db
      .select()
      .from(webhookEvents)
      .where(like(webhookEvents.externalId, `contacts:${coexNumberId}%`));
    expect(event.status).toBe("done");
    expect(event.lastError).toContain("not imported as leads");
  });
});

describe("a coexistence delivery for a number nobody registered", () => {
  it("is recorded with what to do about it", async () => {
    const response = await post(
      envelope(
        "smb_message_echoes",
        {
          message_echoes: [
            { id: `wamid.${randomUUID()}`, from: BUSINESS_DISPLAY, to: "919847600501", timestamp: "1791100800", type: "text", text: { body: "hello" } },
          ],
        },
        `${MARKER}-unregistered`,
      ),
    );
    expect(response.status).toBe(200);

    const [event] = await db
      .select()
      .from(webhookEvents)
      .where(like(webhookEvents.externalId, `unregistered:%${MARKER}-unregistered`));

    expect(event.status).toBe("failed");
    expect(event.lastError).toContain("not registered");
    expect(event.lastError).toContain("Settings");
  });
});
