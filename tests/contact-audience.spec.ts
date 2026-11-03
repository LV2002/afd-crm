/**
 * Which contacts go to Meta and Google, against a real database.
 */
import { config as loadEnv } from "dotenv";
import { eq, inArray, like } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

loadEnv({ path: ".env" });
loadEnv({ path: ".env.local", override: true });
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set.");

const { db } = await import("../src/lib/db/client");
const { adAudienceContactMembers, contactListMembers, contactLists, contacts, leadIdentifiers, leads } = await import("../src/lib/db/schema");
const { isContactAudienceEligible, syncContactAudience } = await import("../src/lib/integrations/contact-audience");

const MARK = "AudienceTest";
let adsList: string;
let noAdsList: string;

async function sweep() {
  const cs = await db.select({ id: contacts.id }).from(contacts).where(like(contacts.name, `${MARK}%`));
  const ids = cs.map((c) => c.id);
  if (ids.length) {
    await db.delete(adAudienceContactMembers).where(inArray(adAudienceContactMembers.contactId, ids));
    await db.delete(contactListMembers).where(inArray(contactListMembers.contactId, ids));
  }
  await db.delete(contacts).where(like(contacts.name, `${MARK}%`));
  await db.delete(contactLists).where(like(contactLists.name, `${MARK}%`));
  const ls = await db.select({ id: leads.id }).from(leads).where(like(leads.studentName, `${MARK}%`));
  const lids = ls.map((l) => l.id);
  if (lids.length) await db.delete(leadIdentifiers).where(inArray(leadIdentifiers.leadId, lids));
  await db.delete(leads).where(like(leads.studentName, `${MARK}%`));
}

beforeAll(async () => {
  await sweep();
  const [a] = await db.insert(contactLists).values({ name: `${MARK} ads`, useForAds: true }).returning({ id: contactLists.id });
  const [b] = await db.insert(contactLists).values({ name: `${MARK} no ads`, useForAds: false }).returning({ id: contactLists.id });
  adsList = a.id;
  noAdsList = b.id;
});
afterAll(sweep);

async function addContact(name: string, phone: string | null, listId: string, email: string | null = null) {
  const [c] = await db.insert(contacts).values({ name: `${MARK} ${name}`, phone, email }).returning({ id: contacts.id });
  await db.insert(contactListMembers).values({ contactId: c.id, listId });
  return c.id;
}

function recorder() {
  const sent = { added: [] as string[], removed: [] as string[] };
  return {
    sent,
    sender: {
      platform: "meta" as const,
      add: async (p: string[]) => void sent.added.push(...p),
      remove: async (p: string[]) => void sent.removed.push(...p),
    },
  };
}

describe("the rule", () => {
  it("needs a phone, a list that allows ads, and not being a lead", () => {
    const ok = { deleted: false, phone: "+919847000001", onAdsList: true, isLead: false };
    expect(isContactAudienceEligible(ok)).toBe(true);
    expect(isContactAudienceEligible({ ...ok, phone: null })).toBe(false);
    expect(isContactAudienceEligible({ ...ok, onAdsList: false })).toBe(false);
    expect(isContactAudienceEligible({ ...ok, isLead: true })).toBe(false);
    expect(isContactAudienceEligible({ ...ok, deleted: true })).toBe(false);
  });
});

describe("syncContactAudience", () => {
  it("sends the eligible once, and takes people out when they stop being eligible", async () => {
    const seminar = await addContact("seminar", "+919847610001", adsList);
    const noAds = await addContact("noads", "+919847610002", noAdsList);
    const emailOnly = await addContact("emailonly", null, adsList, "e@example.com");
    const becomesLead = await addContact("becomes lead", "+919847610003", adsList);
    const gone = await addContact("deleted", "+919847610004", adsList);

    const first = recorder();
    await syncContactAudience(first.sender);
    expect(first.sent.added).toEqual(expect.arrayContaining(["+919847610001", "+919847610003", "+919847610004"]));
    expect(first.sent.added).not.toContain("+919847610002"); // the list does not allow ads
    expect(first.sent.removed).toEqual([]);
    void noAds;
    void emailOnly;

    // Nothing changed: nothing is sent again.
    const second = recorder();
    await syncContactAudience(second.sender);
    expect(second.sent.added).toEqual([]);
    expect(second.sent.removed).toEqual([]);

    // One enquires (becomes a lead), one is deleted, the seminar list stops allowing ads.
    const [lead] = await db
      .insert(leads)
      .values({ studentName: `${MARK} lead`, primaryPhone: "+919847610003" })
      .returning({ id: leads.id });
    await db.insert(leadIdentifiers).values({ leadId: lead.id, kind: "phone", valueNormalised: "+919847610003", isPrimary: true });
    await db.update(contacts).set({ deletedAt: new Date() }).where(eq(contacts.id, gone));

    const third = recorder();
    await syncContactAudience(third.sender);
    expect(third.sent.removed.sort()).toEqual(["+919847610003", "+919847610004"]);
    expect(third.sent.added).toEqual([]);

    await db.update(contactLists).set({ useForAds: false }).where(eq(contactLists.id, adsList));
    const fourth = recorder();
    await syncContactAudience(fourth.sender);
    expect(fourth.sent.removed).toEqual(["+919847610001"]);

    // Allowing ads again brings them back.
    await db.update(contactLists).set({ useForAds: true }).where(eq(contactLists.id, adsList));
    const fifth = recorder();
    await syncContactAudience(fifth.sender);
    expect(fifth.sent.added).toContain("+919847610001");
    void seminar;
    void becomesLead;
  });

  it("keeps a lead's audience and the contacts' audience apart", async () => {
    // A person who is a lead by EMAIL only is still recognised.
    const c = await addContact("email match", "+919847610020", adsList, "match@example.com");
    const [lead] = await db
      .insert(leads)
      .values({ studentName: `${MARK} email lead`, primaryPhone: "+919847610021" })
      .returning({ id: leads.id });
    await db.insert(leadIdentifiers).values([
      { leadId: lead.id, kind: "phone", valueNormalised: "+919847610021", isPrimary: true },
      { leadId: lead.id, kind: "email", valueNormalised: "match@example.com" },
    ]);
    const r = recorder();
    await syncContactAudience(r.sender);
    expect(r.sent.added).not.toContain("+919847610020");
    void c;
  });
});
