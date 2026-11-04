/**
 * The contact database's logic — needs a real database with migrations
 * applied (see confirm-admission.spec.ts).
 */
import { config as loadEnv } from "dotenv";
import { eq, inArray, like } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

loadEnv({ path: ".env" });
loadEnv({ path: ".env.local", override: true });
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set.");

const { db } = await import("../src/lib/db/client");
const { contactListMembers, contactLists, contacts, leadIdentifiers, leads } = await import("../src/lib/db/schema");
const { saveContact } = await import("../src/lib/contacts/save");
const { leadStateFor } = await import("../src/lib/contacts/lead-matches");
const { blankFillPatch } = await import("../src/lib/contacts/promote");
const { splitContactValues, contactFields } = await import("../src/lib/contacts/fields");

const MARK = "ContactsTest";
let listA: string;
let listB: string;

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
}

beforeAll(async () => {
  await sweep();
  const [a] = await db.insert(contactLists).values({ name: `${MARK} seminar` }).returning({ id: contactLists.id });
  const [b] = await db.insert(contactLists).values({ name: `${MARK} purchased` }).returning({ id: contactLists.id });
  listA = a.id;
  listB = b.id;
});
afterAll(sweep);

const ctx = (listId: string) => ({ listId, userId: null });

describe("saveContact", () => {
  it("makes one person once, however many lists they are on", async () => {
    const first = await db.transaction((tx) =>
      saveContact(tx, { name: `${MARK} Anjali`, phone: "+919847600001", email: null, fields: { city: "Kochi" } }, ctx(listA)),
    );
    expect(first.created).toBe(true);

    // The same person in a purchased database, now with an email and a class.
    const second = await db.transaction((tx) =>
      saveContact(
        tx,
        { name: `${MARK} Anjali K`, phone: "9847600001", email: "Anjali@Example.com", fields: { city: "Thrissur", education_status: "12th" } },
        ctx(listB),
      ),
    );
    expect(second).toMatchObject({ contactId: first.contactId, created: false });

    const rows = await db.select().from(contacts).where(like(contacts.name, `${MARK} Anjali%`));
    expect(rows).toHaveLength(1);
    // Blanks are filled; what was already there is not overwritten.
    expect(rows[0].email).toBe("anjali@example.com");
    expect(rows[0].name).toBe(`${MARK} Anjali`);
    expect(rows[0].fields).toEqual({ city: "Kochi", education_status: "12th" });

    const members = await db.select().from(contactListMembers).where(eq(contactListMembers.contactId, first.contactId));
    expect(members.map((m) => m.listId).sort()).toEqual([listA, listB].sort());
  });

  it("recognises a repeat of the same list as adding nothing", async () => {
    const input = { name: `${MARK} Rahul`, phone: "+919847600002", email: null, fields: {} };
    await db.transaction((tx) => saveContact(tx, input, ctx(listA)));
    const again = await db.transaction((tx) => saveContact(tx, input, ctx(listA)));
    expect(again).toMatchObject({ created: false, alreadyOnList: true });
  });

  it("matches by email when the phone is new, and needs one of the two", async () => {
    const a = await db.transaction((tx) =>
      saveContact(tx, { name: `${MARK} Meera`, phone: null, email: "meera@example.com", fields: {} }, ctx(listA)),
    );
    const b = await db.transaction((tx) =>
      saveContact(tx, { name: `${MARK} Meera`, phone: "+919847600003", email: "meera@example.com", fields: {} }, ctx(listB)),
    );
    expect(b.contactId).toBe(a.contactId);
    const [row] = await db.select().from(contacts).where(eq(contacts.id, a.contactId));
    expect(row.phone).toBe("+919847600003");

    await expect(
      db.transaction((tx) => saveContact(tx, { name: `${MARK} Nobody`, phone: null, email: null, fields: {} }, ctx(listA))),
    ).rejects.toThrow(/phone number or an email/);
  });
});

describe("leadStateFor", () => {
  it("shows a contact as a lead by any number or email the lead has, and not otherwise", async () => {
    const [lead] = await db
      .insert(leads)
      .values({ studentName: `${MARK} Lead`, primaryPhone: "+919847600010", email: "lead@example.com" })
      .returning({ id: leads.id, leadNumber: leads.leadNumber });
    await db.insert(leadIdentifiers).values([
      { leadId: lead.id, kind: "phone", valueNormalised: "+919847600010", isPrimary: true },
      { leadId: lead.id, kind: "phone", valueNormalised: "+919847600011" }, // a parent's number, folded in by a merge
      { leadId: lead.id, kind: "email", valueNormalised: "lead@example.com" },
    ]);

    const state = await leadStateFor([
      { id: "c-primary", phone: "+919847600010", email: null, leadId: null },
      { id: "c-parent", phone: "+919847600011", email: null, leadId: null },
      { id: "c-email", phone: "+919847600099", email: "lead@example.com", leadId: null },
      { id: "c-none", phone: "+919847600098", email: null, leadId: null },
      { id: "c-linked", phone: "+919847600097", email: null, leadId: lead.id },
    ]);

    expect(state.get("c-primary")?.match?.leadNumber).toBe(lead.leadNumber);
    expect(state.get("c-parent")?.match?.leadId).toBe(lead.id);
    expect(state.get("c-email")?.match?.leadId).toBe(lead.id);
    expect(state.get("c-none")).toEqual({ linked: null, match: null });
    // Once linked it is "linked", not a merge candidate.
    expect(state.get("c-linked")?.linked?.leadId).toBe(lead.id);
    expect(state.get("c-linked")?.match).toBeNull();
  });
});

describe("blankFillPatch (what a merge may write into an existing lead)", () => {
  const schema = new Map([
    ["city", { key: "city", isCore: true }],
    ["school_college", { key: "school_college", isCore: true }],
    ["student_name", { key: "student_name", isCore: true }],
    ["aptitude_score", { key: "aptitude_score", isCore: false }],
  ]);

  it("fills blanks, never overwrites, and never touches identity", () => {
    const patch = blankFillPatch(
      { city: "Kochi", school_college: null, custom: { aptitude_score: "" } },
      { city: "Thrissur", school_college: "St Xavier's", student_name: "Someone Else", aptitude_score: 42 },
      schema,
    );
    expect(patch).toEqual({ school_college: "St Xavier's", custom: { aptitude_score: 42 } });
  });

  it("writes nothing when the lead already has everything", () => {
    expect(blankFillPatch({ city: "Kochi" }, { city: "Thrissur" }, schema)).toEqual({});
  });
});

describe("contact fields", () => {
  it("splits identity from the rest, dropping blanks", () => {
    expect(
      splitContactValues({ student_name: " Anjali ", primary_phone: "+919847600001", email: null, city: "Kochi", state: "", interested_exams: [] }),
    ).toEqual({ name: "Anjali", phone: "+919847600001", email: null, fields: { city: "Kochi" } });
  });

  it("offers lead fields but not the ones only a lead has", () => {
    const entry = (key: string, type = "text") => ({ id: key, key, label: key, helpText: null, type, rawOptions: null, isCore: true, isRequired: false, section: "x", sortOrder: 0, showInList: false, showInFilters: false, isEditable: true }) as never;
    const keys = contactFields([entry("city"), entry("temperature"), entry("assigned_to", "user_ref"), entry("lead_source"), entry("exam_year")]).map((f) => f.key);
    expect(keys).toEqual(["city", "exam_year"]);
  });
});
