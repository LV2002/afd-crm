/**
 * Each database is its own ad audience, against a real database.
 */
import { config as loadEnv } from "dotenv";
import { eq, inArray, like } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

loadEnv({ path: ".env" });
loadEnv({ path: ".env.local", override: true });
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set.");

const { db } = await import("../src/lib/db/client");
const { adListAudienceMembers, contactListAudiences, contactListMembers, contactLists, contacts, leadIdentifiers, leads } =
  await import("../src/lib/db/schema");
const { audienceNameFor, syncListAudiences } = await import("../src/lib/integrations/list-audiences");

const MARK = "ListAudTest";

async function sweep() {
  const ls = await db.select({ id: contactLists.id }).from(contactLists).where(like(contactLists.name, `${MARK}%`));
  const ids = ls.map((l) => l.id);
  if (ids.length) {
    await db.delete(contactListAudiences).where(inArray(contactListAudiences.listId, ids));
    await db.delete(adListAudienceMembers).where(inArray(adListAudienceMembers.listId, ids));
    await db.delete(contactListMembers).where(inArray(contactListMembers.listId, ids));
  }
  await db.delete(contacts).where(like(contacts.name, `${MARK}%`));
  await db.delete(contactLists).where(like(contactLists.name, `${MARK}%`));
  const lds = await db.select({ id: leads.id }).from(leads).where(like(leads.studentName, `${MARK}%`));
  const lids = lds.map((l) => l.id);
  if (lids.length) await db.delete(leadIdentifiers).where(inArray(leadIdentifiers.leadId, lids));
  await db.delete(leads).where(like(leads.studentName, `${MARK}%`));
}
beforeAll(sweep);
afterAll(sweep);

/** A fake ad platform: audiences by id, each a set of phones. */
function fakePlatform() {
  const audiences = new Map<string, Set<string>>();
  let next = 0;
  return {
    audiences,
    sender: {
      platform: "meta" as const,
      create: async (name: string) => {
        const id = `aud_${++next}_${name.includes(MARK) ? "t" : "x"}`;
        audiences.set(id, new Set());
        return id;
      },
      add: async (id: string, phones: string[]) => void phones.forEach((p) => audiences.get(id)!.add(p)),
      remove: async (id: string, phones: string[]) => void phones.forEach((p) => audiences.get(id)!.delete(p)),
    },
  };
}

async function addTo(listId: string, name: string, phone: string) {
  const [c] = await db.insert(contacts).values({ name: `${MARK} ${name}`, phone }).returning({ id: contacts.id });
  await db.insert(contactListMembers).values({ contactId: c.id, listId });
  return c.id;
}

describe("a separate audience for each database", () => {
  it("creates one audience per database, fills each with its own people, and picks up new people and new databases", async () => {
    const [a] = await db.insert(contactLists).values({ name: `${MARK} A`, useForAds: true }).returning({ id: contactLists.id });
    const [b] = await db.insert(contactLists).values({ name: `${MARK} B`, useForAds: true }).returning({ id: contactLists.id });
    await addTo(a.id, "a1", "+919847700001");
    await addTo(b.id, "b1", "+919847700002");

    const platform = fakePlatform();
    const first = await syncListAudiences(platform.sender);
    expect(first.created).toBeGreaterThanOrEqual(2);
    const audA = (await db.select().from(contactListAudiences).where(eq(contactListAudiences.listId, a.id)))[0];
    const audB = (await db.select().from(contactListAudiences).where(eq(contactListAudiences.listId, b.id)))[0];
    expect(audA.name).toBe(audienceNameFor(`${MARK} A`));
    expect([...platform.audiences.get(audA.externalId)!]).toEqual(["+919847700001"]);
    expect([...platform.audiences.get(audB.externalId)!]).toEqual(["+919847700002"]);

    // Someone new on A, and a brand-new database C.
    await addTo(a.id, "a2", "+919847700003");
    const [c] = await db.insert(contactLists).values({ name: `${MARK} C`, useForAds: true }).returning({ id: contactLists.id });
    await addTo(c.id, "c1", "+919847700004");
    await syncListAudiences(platform.sender);
    expect([...platform.audiences.get(audA.externalId)!].sort()).toEqual(["+919847700001", "+919847700003"]);
    const audC = (await db.select().from(contactListAudiences).where(eq(contactListAudiences.listId, c.id)))[0];
    expect([...platform.audiences.get(audC.externalId)!]).toEqual(["+919847700004"]);

    // A second run changes nothing.
    const again = await syncListAudiences(platform.sender);
    expect(again.added).toBe(0);
    expect(again.created).toBe(0);
  });

  it("keeps leads out, and empties a database's audience when it is archived or stops allowing ads", async () => {
    const [d] = await db.insert(contactLists).values({ name: `${MARK} D`, useForAds: true }).returning({ id: contactLists.id });
    await addTo(d.id, "d1", "+919847700011");
    const leadContact = await addTo(d.id, "dlead", "+919847700012");
    const [lead] = await db.insert(leads).values({ studentName: `${MARK} lead`, primaryPhone: "+919847700012" }).returning({ id: leads.id });
    await db.insert(leadIdentifiers).values({ leadId: lead.id, kind: "phone", valueNormalised: "+919847700012" });
    expect(leadContact).toBeTruthy();

    const platform = fakePlatform();
    await syncListAudiences(platform.sender);
    const aud = (await db.select().from(contactListAudiences).where(eq(contactListAudiences.listId, d.id)))[0];
    expect([...platform.audiences.get(aud.externalId)!]).toEqual(["+919847700011"]);

    await db.update(contactLists).set({ useForAds: false }).where(eq(contactLists.id, d.id));
    await syncListAudiences(platform.sender);
    expect(platform.audiences.get(aud.externalId)!.size).toBe(0);
  });

  it("one database failing does not stop the others, and the error is kept", async () => {
    const [e] = await db.insert(contactLists).values({ name: `${MARK} E`, useForAds: true }).returning({ id: contactLists.id });
    await addTo(e.id, "e1", "+919847700021");
    const platform = fakePlatform();
    const failing = {
      ...platform.sender,
      add: async (id: string, phones: string[]) => {
        if (phones.includes("+919847700021")) throw new Error("Platform said no");
        await platform.sender.add(id, phones);
      },
    };
    const result = await syncListAudiences(failing);
    expect(result.failed).toBeGreaterThanOrEqual(1);
    const aud = (await db.select().from(contactListAudiences).where(eq(contactListAudiences.listId, e.id)))[0];
    expect(aud.lastError).toMatch(/Platform said no/);
  });
});
