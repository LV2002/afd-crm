/**
 * Whether a custom field's type is still free to change.
 *
 * The whole point of the count is that it must not miss an answer. A field
 * whose type changes while somebody has answered turns their answer into a
 * value nothing can read — a typed-in web address reinterpreted as an
 * uploaded file is a document that does not exist. So the cases that matter
 * here are the ones where an answer is easy to overlook: a student field
 * answered on the public profile form months before a `students` row exists,
 * and a field answered only by a lead in the centre the admin cannot see.
 *
 *   npm run db:migrate && npm test
 */
import { config as loadEnv } from "dotenv";
import { eq, like } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

loadEnv({ path: ".env" });
loadEnv({ path: ".env.local", override: true });

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set — see the file header.");

const { db } = await import("../src/lib/db/client");
const { centers, leads, students } = await import("../src/lib/db/schema");
const { countFieldAnswers } = await import("../src/lib/fields/count-answers");

const MARKER = "CountSpec";
const KEY = "count_spec_photo";

async function makeCentre(): Promise<string> {
  const [centre] = await db
    .insert(centers)
    .values({ name: `${MARKER} centre ${Date.now()}-${Math.random()}`, city: "Kochi" })
    .returning({ id: centers.id });
  return centre.id;
}

async function makeLead(
  values: Partial<typeof leads.$inferInsert> = {},
): Promise<{ id: string; centerId: string }> {
  const centerId = await makeCentre();
  const [lead] = await db
    .insert(leads)
    .values({
      studentName: `${MARKER} Anjali`,
      primaryPhone: `+9198470${Math.floor(10000 + Math.random() * 89999)}`,
      centerId,
      ...values,
    })
    .returning({ id: leads.id });
  return { id: lead.id, centerId };
}

async function sweep() {
  const made = await db.select({ id: leads.id }).from(leads).where(like(leads.studentName, `${MARKER}%`));
  for (const lead of made) {
    await db.delete(students).where(eq(students.leadId, lead.id));
    await db.delete(leads).where(eq(leads.id, lead.id));
  }
  await db.delete(centers).where(like(centers.name, `${MARKER}%`));
}

beforeEach(sweep);
afterAll(sweep);

describe("countFieldAnswers", () => {
  it("is zero when nobody has answered", async () => {
    await makeLead({ custom: { something_else: "yes" } });
    expect(await countFieldAnswers("lead", KEY)).toBe(0);
  });

  it("counts a lead's own answer", async () => {
    await makeLead({ custom: { [KEY]: "https://example.invalid/photo.jpg" } });
    await makeLead({ custom: { [KEY]: "https://example.invalid/other.jpg" } });
    expect(await countFieldAnswers("lead", KEY)).toBe(2);
  });

  it("counts a student field answered on the public profile form", async () => {
    // The case that would otherwise be missed entirely. A student answers
    // the profile form months before a `students` row exists, so looking
    // only at `students.custom` says nobody has answered — and the type
    // change that permits destroys their upload.
    await makeLead({ profileFormData: { [KEY]: "aadhaar.png" } });
    expect(await countFieldAnswers("student", KEY)).toBe(1);
  });

  it("adds up both homes of a student field", async () => {
    const lead = await makeLead({ profileFormData: { [KEY]: "aadhaar.png" } });
    await db.insert(students).values({
      leadId: lead.id,
      centerId: lead.centerId,
      studentCode: `${MARKER}-${Date.now()}`,
      fullName: `${MARKER} Anjali`,
      phone: "+919847011111",
      custom: { [KEY]: "another.png" },
    });
    expect(await countFieldAnswers("student", KEY)).toBe(2);
  });

  it("ignores a soft-deleted lead", async () => {
    // A deleted lead's answer is nobody's answer. Counting it would freeze
    // a field's type forever over a record that is already hidden.
    await makeLead({ custom: { [KEY]: "x" }, deletedAt: new Date() });
    expect(await countFieldAnswers("lead", KEY)).toBe(0);
  });

  it("ignores a key that is present but empty", async () => {
    // What a blank submission leaves behind. It is not an answer, and
    // treating it as one would block a fix nobody would mind.
    await makeLead({ custom: { [KEY]: "" } });
    expect(await countFieldAnswers("lead", KEY)).toBe(0);
  });

  it("does not confuse one entity's answers for another's", async () => {
    await makeLead({ custom: { [KEY]: "a lead answered this" } });
    expect(await countFieldAnswers("lead", KEY)).toBe(1);
    expect(await countFieldAnswers("student", KEY)).toBe(0);
  });

  it("is zero for an enrolment field, which has nowhere to store an answer", async () => {
    expect(await countFieldAnswers("enrolment", KEY)).toBe(0);
  });
});
