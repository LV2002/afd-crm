/**
 * Broadcasts to the contact database: who is in the audience, and who is
 * still allowed at send time. Needs a real database with migrations applied.
 */
import { config as loadEnv } from "dotenv";
import { eq, inArray, like } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

loadEnv({ path: ".env" });
loadEnv({ path: ".env.local", override: true });
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set.");

const { db } = await import("../src/lib/db/client");
const { contactListMembers, contactLists, contacts, leadIdentifiers, leads, whatsappSuppressions } = await import("../src/lib/db/schema");
const { resolveAudience } = await import("../src/lib/whatsapp/audience");
const { messageableContactIds } = await import("../src/lib/contacts/whatsapp-eligibility");

const MARK = "BroadcastTest";
let agreed: string;
let notAgreed: string;

async function sweep() {
  const cs = await db.select({ id: contacts.id }).from(contacts).where(like(contacts.name, `${MARK}%`));
  const ids = cs.map((c) => c.id);
  if (ids.length) await db.delete(contactListMembers).where(inArray(contactListMembers.contactId, ids));
  await db.delete(contacts).where(like(contacts.name, `${MARK}%`));
  await db.delete(contactLists).where(like(contactLists.name, `${MARK}%`));
  const ls = await db.select({ id: leads.id }).from(leads).where(like(leads.studentName, `${MARK}%`));
  const lids = ls.map((l) => l.id);
  if (lids.length) await db.delete(leadIdentifiers).where(inArray(leadIdentifiers.leadId, lids));
  await db.delete(leads).where(like(leads.studentName, `${MARK}%`));
  await db.delete(whatsappSuppressions).where(like(whatsappSuppressions.phone, "+9198476200%"));
}

beforeAll(async () => {
  await sweep();
  const [a] = await db.insert(contactLists).values({ name: `${MARK} agreed`, useForWhatsapp: true }).returning({ id: contactLists.id });
  const [b] = await db.insert(contactLists).values({ name: `${MARK} not agreed`, useForWhatsapp: false }).returning({ id: contactLists.id });
  agreed = a.id;
  notAgreed = b.id;
});
afterAll(sweep);

async function addContact(name: string, phone: string | null, listId: string, fields: Record<string, unknown> = {}, email: string | null = null) {
  const [c] = await db.insert(contacts).values({ name: `${MARK} ${name}`, phone, email, fields }).returning({ id: contacts.id });
  await db.insert(contactListMembers).values({ contactId: c.id, listId });
  return c.id;
}

/** A stand-in for the RLS client: every query resolves to the rows for its table. */
function fakeSupabase(tables: Record<string, unknown[]>) {
  const chain = (table: string): unknown => {
    const q: unknown = new Proxy(
      {},
      {
        get: (_t, prop) => {
          if (prop === "then") return undefined;
          if (prop === "returns") return () => Promise.resolve({ data: tables[table] ?? [], error: null });
          return () => q;
        },
      },
    );
    return q;
  };
  return { from: (t: string) => chain(t) } as never;
}

const user = { id: "u", roleId: "r", roleCode: "admin", centerIds: [], permissions: {} } as never;
const cityField = {
  id: "f1", key: "city", label: "City", help_text: null, type: "text", options: null, is_required: false,
  section: "Personal", sort_order: 1, show_in_list: false, show_in_filters: true, is_core: true,
  visible_to_roles: null, editable_by_roles: null,
};

describe("the Database audience", () => {
  it("includes only people on agreed lists, never leads, and honours opt-outs and filters", async () => {
    const a = await addContact("Anjali", "+919847620001", agreed, { city: "Kochi" });
    const b = await addContact("Rahul", "+919847620002", agreed, { city: "Kochi" });
    const lead = await addContact("Is a lead", "+919847620003", agreed, { city: "Kochi" });
    const stopped = await addContact("Said stop", "+919847620004", agreed, { city: "Kochi" });
    const elsewhere = await addContact("Other city", "+919847620005", agreed, { city: "Thrissur" });
    const noPhone = await addContact("Email only", null, agreed, { city: "Kochi" }, "e@example.com");

    // One of them already exists as a lead (by phone), another opted out.
    const [l] = await db.insert(leads).values({ studentName: `${MARK} lead`, primaryPhone: "+919847620003" }).returning({ id: leads.id });
    await db.insert(leadIdentifiers).values({ leadId: l.id, kind: "phone", valueNormalised: "+919847620003", isPrimary: true });
    await db.insert(whatsappSuppressions).values({ phone: "+919847620004", reason: "stop", source: "keyword" });

    const rows = [a, b, lead, stopped, elsewhere, noPhone].map((id, i) => ({
      id,
      name: `${MARK} ${i}`,
      phone: ["+919847620001", "+919847620002", "+919847620003", "+919847620004", "+919847620005", null][i],
      email: i === 5 ? "e@example.com" : null,
      fields: { city: i === 4 ? "Thrissur" : "Kochi" },
      lead_id: null,
    }));
    const supabase = fakeSupabase({
      contact_lists: [{ id: agreed, name: "agreed", use_for_whatsapp: true }],
      contacts: rows,
      field_definitions: [cityField],
    });

    const result = await resolveAudience(supabase, user, { entity: "contact", filters: { city: "Kochi" }, listIds: [agreed] });

    expect(result.members.map((m) => m.phone).sort()).toEqual(["+919847620001", "+919847620002"]);
    expect(result.skipped).toMatchObject({ alreadyLeads: 1, optedOut: 1, noPhone: 1 });
    expect(result.members.every((m) => m.entity === "contact")).toBe(true);
  });

  it("refuses a list that has not agreed to WhatsApp, by name", async () => {
    const supabase = fakeSupabase({
      contact_lists: [{ id: notAgreed, name: "Purchased exam list", use_for_whatsapp: false }],
      contacts: [],
      field_definitions: [cityField],
    });
    await expect(
      resolveAudience(supabase, user, { entity: "contact", filters: {}, listIds: [notAgreed] }),
    ).rejects.toThrow(/Purchased exam list.*agreed to WhatsApp/);
  });

  it("needs at least one list", async () => {
    await expect(
      resolveAudience(fakeSupabase({}), user, { entity: "contact", filters: {}, listIds: [] }),
    ).rejects.toThrow(/at least one list/);
  });
});

describe("messageableContactIds (the send-time check)", () => {
  it("drops a contact who has become a lead, been removed, or whose list lost its tick", async () => {
    const ok = await addContact("still ok", "+919847620010", agreed);
    const becameLead = await addContact("became lead", "+919847620011", agreed);
    const removed = await addContact("removed", "+919847620012", agreed);
    const unticked = await addContact("unticked", "+919847620013", notAgreed);

    const [l] = await db.insert(leads).values({ studentName: `${MARK} l2`, primaryPhone: "+919847620011" }).returning({ id: leads.id });
    await db.insert(leadIdentifiers).values({ leadId: l.id, kind: "phone", valueNormalised: "+919847620011", isPrimary: true });
    await db.update(contacts).set({ deletedAt: new Date() }).where(eq(contacts.id, removed));

    const allowed = await messageableContactIds([ok, becameLead, removed, unticked]);
    expect([...allowed]).toEqual([ok]);
    expect((await messageableContactIds([])).size).toBe(0);
  });
});
