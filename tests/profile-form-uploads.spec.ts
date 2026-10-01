/**
 * Files a student attaches to their own profile form.
 *
 * The Storage client is mocked; the `attachments` rows are real. That split
 * is the point of the test — what matters is that a successful upload leaves
 * exactly one row per file with the right label, and a failed one leaves
 * nothing behind at all.
 *
 *   npm run db:migrate && npm test
 */
import { config as loadEnv } from "dotenv";
import { eq, like } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

loadEnv({ path: ".env" });
loadEnv({ path: ".env.local", override: true });

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set — see the file header.");

const uploaded: Array<{ path: string }> = [];
const removed: string[][] = [];
/** Fail every upload. */
let uploadShouldFail = false;
/** Succeed this many times, then fail — for the partial-failure case. */
let failAfter: number | null = null;
let uploadCalls = 0;

vi.mock("@/lib/supabase/service-role", () => ({
  createServiceRoleClient: () => ({
    storage: {
      from: () => ({
        upload: async (path: string) => {
          uploadCalls += 1;
          if (uploadShouldFail) return { error: { message: "bucket unavailable" } };
          if (failAfter !== null && uploadCalls > failAfter) {
            return { error: { message: "gone" } };
          }
          uploaded.push({ path });
          return { error: null };
        },
        remove: async (paths: string[]) => {
          removed.push(paths);
          return { error: null };
        },
      }),
    },
  }),
}));

const { db } = await import("../src/lib/db/client");
const { attachments, centers, leads } = await import("../src/lib/db/schema");
const { storeProfileFormUploads } = await import("../src/lib/profile-form/store-uploads");

const MARKER = "UploadSpec";

function png(name: string, bytes = 2048): File {
  return new File([new Uint8Array(bytes)], name, { type: "image/png" });
}

async function makeLead(): Promise<string> {
  const [centre] = await db
    .insert(centers)
    .values({ name: `${MARKER} centre ${Date.now()}`, city: "Kochi" })
    .returning({ id: centers.id });

  const [lead] = await db
    .insert(leads)
    .values({
      studentName: `${MARKER} Anjali`,
      primaryPhone: `+9198470${Math.floor(10000 + Math.random() * 89999)}`,
      centerId: centre.id,
    })
    .returning({ id: leads.id });

  return lead.id;
}

async function sweep() {
  const made = await db.select({ id: leads.id }).from(leads).where(like(leads.studentName, `${MARKER}%`));
  for (const lead of made) {
    await db.delete(attachments).where(eq(attachments.leadId, lead.id));
    await db.delete(leads).where(eq(leads.id, lead.id));
  }
  await db.delete(centers).where(like(centers.name, `${MARKER}%`));
}

beforeEach(async () => {
  uploaded.length = 0;
  removed.length = 0;
  uploadShouldFail = false;
  failAfter = null;
  uploadCalls = 0;
  await sweep();
});

afterAll(sweep);

describe("storeProfileFormUploads", () => {
  it("does nothing, successfully, when the form had no file fields", async () => {
    const result = await storeProfileFormUploads(await makeLead(), []);
    expect(result).toEqual({ ok: true, stored: [] });
    expect(uploaded).toHaveLength(0);
  });

  it("stores each file against the lead, labelled with its own question", async () => {
    const leadId = await makeLead();
    const result = await storeProfileFormUploads(leadId, [
      { key: "id_proof", label: "ID proof", file: png("aadhaar.png") },
      { key: "photo", label: "Passport photograph", file: png("me.png") },
    ]);

    expect(result.ok).toBe(true);
    expect(result.ok && result.stored.map((s) => ({ key: s.key, fileName: s.fileName }))).toEqual([
      { key: "id_proof", fileName: "aadhaar.png" },
      { key: "photo", fileName: "me.png" },
    ]);

    const rows = await db
      .select({
        id: attachments.id,
        label: attachments.label,
        fileName: attachments.fileName,
        kind: attachments.kind,
        fieldKey: attachments.fieldKey,
      })
      .from(attachments)
      .where(eq(attachments.leadId, leadId));

    // The returned ids are the rows that were actually written — this is
    // what the submitted-forms list links to, so a wrong one is a link to
    // somebody else's document.
    const byKey = new Map(rows.map((row) => [row.fieldKey, row.id]));
    expect(result.ok && result.stored.map((s) => byKey.get(s.key))).toEqual(
      result.ok ? result.stored.map((s) => s.attachmentId) : [],
    );

    // The label is what makes the file findable — a counsellor opening the
    // lead sees "ID proof", not an opaque filename.
    expect(rows.map((r) => r.label).sort()).toEqual(["ID proof", "Passport photograph"]);
    expect(rows.every((r) => r.kind === "document")).toBe(true);
    // The question each file answers, which is how the list finds it.
    expect(rows.map((r) => r.fieldKey).sort()).toEqual(["id_proof", "photo"]);
  });

  it("leaves uploaded_by null, because a student is not a staff account", async () => {
    const leadId = await makeLead();
    await storeProfileFormUploads(leadId, [
      { key: "id_proof", label: "ID proof", file: png("aadhaar.png") },
    ]);

    const [row] = await db
      .select({ uploadedBy: attachments.uploadedBy })
      .from(attachments)
      .where(eq(attachments.leadId, leadId));
    expect(row.uploadedBy).toBeNull();
  });

  it("gives every file its own unguessable path under the lead", async () => {
    const leadId = await makeLead();
    await storeProfileFormUploads(leadId, [
      { key: "a", label: "A", file: png("same-name.png") },
      { key: "b", label: "B", file: png("same-name.png") },
    ]);

    expect(uploaded).toHaveLength(2);
    expect(uploaded[0].path).not.toBe(uploaded[1].path);
    for (const { path } of uploaded) {
      expect(path.startsWith(`lead/${leadId}/`)).toBe(true);
    }
  });

  it("refuses a file type that is not on the allow-list, before writing anything", async () => {
    const leadId = await makeLead();
    const result = await storeProfileFormUploads(leadId, [
      { key: "id_proof", label: "ID proof", file: new File(["x"], "virus.exe", { type: "application/x-msdownload" }) },
    ]);

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toContain("ID proof");
    expect(uploaded).toHaveLength(0);
    const rows = await db.select().from(attachments).where(eq(attachments.leadId, leadId));
    expect(rows).toHaveLength(0);
  });

  it("refuses an empty file rather than storing a zero-byte document", async () => {
    const result = await storeProfileFormUploads(await makeLead(), [
      { key: "id_proof", label: "ID proof", file: new File([], "nothing.png", { type: "image/png" }) },
    ]);
    expect(result.ok).toBe(false);
  });

  it("validates every file before storing any of them", async () => {
    // The second file is bad. Nothing at all should be written, so the
    // student is not left with half an application they cannot re-send.
    const leadId = await makeLead();
    const result = await storeProfileFormUploads(leadId, [
      { key: "good", label: "ID proof", file: png("ok.png") },
      { key: "bad", label: "Photograph", file: new File(["x"], "x.exe", { type: "application/x-msdownload" }) },
    ]);

    expect(result.ok).toBe(false);
    expect(uploaded).toHaveLength(0);
    const rows = await db.select().from(attachments).where(eq(attachments.leadId, leadId));
    expect(rows).toHaveLength(0);
  });

  it("rolls the storage objects back when an upload fails part-way", async () => {
    // A student cannot resubmit, so a partial success is worse than a clean
    // failure: they would be thanked with one document missing.
    const leadId = await makeLead();
    uploadShouldFail = true;

    const result = await storeProfileFormUploads(leadId, [
      { key: "id_proof", label: "ID proof", file: png("aadhaar.png") },
    ]);

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toMatch(/Could not upload ID proof/);
    const rows = await db.select().from(attachments).where(eq(attachments.leadId, leadId));
    expect(rows).toHaveLength(0);
  });

  it("removes what it already wrote when a later file fails", async () => {
    // Succeed once, then fail — the case that would otherwise leave an
    // orphaned object in the bucket that nothing points at.
    const leadId = await makeLead();
    failAfter = 1;

    const result = await storeProfileFormUploads(leadId, [
      { key: "a", label: "ID proof", file: png("a.png") },
      { key: "b", label: "Photograph", file: png("b.png") },
    ]);

    expect(result.ok).toBe(false);
    // The one object that did get written is cleaned up.
    expect(removed).toHaveLength(1);
    expect(removed[0]).toEqual([uploaded[0].path]);

    // And no half-written row survives.
    const rows = await db.select().from(attachments).where(eq(attachments.leadId, leadId));
    expect(rows).toHaveLength(0);
  });
});
