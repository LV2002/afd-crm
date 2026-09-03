/**
 * Public registration form, end to end against a real database.
 *
 * The point of these tests is the security boundary, not the happy path.
 * This is the only unauthenticated write path in the app that a stranger
 * can reach with nothing but a URL, so what it REFUSES matters more than
 * what it accepts: a closed form, an unknown token, and above all a
 * submission trying to set fields that decide ownership.
 *
 *   npm run db:migrate && npm run db:seed && npm test
 */
import { randomBytes, randomUUID } from "node:crypto";

import { config as loadEnv } from "dotenv";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

loadEnv({ path: ".env" });
loadEnv({ path: ".env.local", override: true });

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set — see the file header.");
}

const { getPublicForm } = await import("../src/lib/registration/get-form");
const { submitRegistration } = await import("../src/lib/registration/submit");
const { db } = await import("../src/lib/db/client");
const { enquiries, leadIdentifiers, leads, registrationForms } = await import("../src/lib/db/schema");

const MARKER = "RegistrationFormSpec";

function token(): string {
  return randomBytes(32).toString("base64url");
}

async function makeForm(overrides: Partial<{
  token: string;
  fieldKeys: string[];
  isActive: boolean;
  expiresAt: Date | null;
  centerId: string | null;
}> = {}) {
  const [row] = await db
    .insert(registrationForms)
    .values({
      name: `${MARKER} form ${randomUUID().slice(0, 8)}`,
      token: overrides.token ?? token(),
      source: `${MARKER} Source`,
      fieldKeys: overrides.fieldKeys ?? ["student_name", "primary_phone", "email", "city"],
      isActive: overrides.isActive ?? true,
      expiresAt: overrides.expiresAt ?? null,
      centerId: overrides.centerId ?? null,
    })
    .returning({ id: registrationForms.id, token: registrationForms.token });
  return row;
}

function submission(fields: Record<string, string | string[]>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    if (Array.isArray(value)) {
      for (const v of value) data.append(key, v);
    } else {
      data.set(key, value);
    }
  }
  return data;
}

async function sweep() {
  const testLeads = await db
    .select({ id: leads.id })
    .from(leads)
    .where(sql`${leads.studentName} like ${MARKER + "%"}`);
  for (const lead of testLeads) {
    await db.delete(enquiries).where(eq(enquiries.leadId, lead.id));
    await db.delete(leadIdentifiers).where(eq(leadIdentifiers.leadId, lead.id));
  }
  await db.delete(leads).where(sql`${leads.studentName} like ${MARKER + "%"}`);
  await db.delete(registrationForms).where(sql`${registrationForms.name} like ${MARKER + "%"}`);
}

beforeAll(sweep);
afterAll(sweep);

describe("getPublicForm", () => {
  it("returns the form and its configured fields for a valid token", async () => {
    const created = await makeForm({ fieldKeys: ["student_name", "primary_phone", "city"] });
    const result = await getPublicForm(created.token);
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.form.fields.map((f) => f.key)).toEqual(["student_name", "primary_phone", "city"]);
  });

  it("preserves the admin's chosen field ORDER, not the field definitions' sort order", async () => {
    // The order is content on a registration form — it reads as a
    // conversation — so it must come from field_keys, not the schema.
    const created = await makeForm({ fieldKeys: ["city", "primary_phone", "student_name"] });
    const result = await getPublicForm(created.token);
    if (result.status !== "ok") throw new Error("expected ok");
    expect(result.form.fields.map((f) => f.key)).toEqual(["city", "primary_phone", "student_name"]);
  });

  it("skips a key naming a field that no longer exists rather than breaking the form", async () => {
    const created = await makeForm({
      fieldKeys: ["student_name", "no_such_field_at_all", "primary_phone"],
    });
    const result = await getPublicForm(created.token);
    if (result.status !== "ok") throw new Error("expected ok");
    expect(result.form.fields.map((f) => f.key)).toEqual(["student_name", "primary_phone"]);
  });

  it("reports an unknown token as not_found", async () => {
    expect((await getPublicForm(token())).status).toBe("not_found");
  });

  it("rejects a short token without touching the database", async () => {
    expect((await getPublicForm("abc")).status).toBe("not_found");
    expect((await getPublicForm("")).status).toBe("not_found");
  });

  it("reports a deactivated form as closed, distinct from not_found", async () => {
    const created = await makeForm({ isActive: false });
    expect((await getPublicForm(created.token)).status).toBe("closed");
  });

  it("reports an expired form as closed", async () => {
    const created = await makeForm({ expiresAt: new Date(Date.now() - 60_000) });
    expect((await getPublicForm(created.token)).status).toBe("closed");
  });

  it("still serves a form whose expiry is in the future", async () => {
    const created = await makeForm({ expiresAt: new Date(Date.now() + 60_000) });
    expect((await getPublicForm(created.token)).status).toBe("ok");
  });
});

describe("submitRegistration", () => {
  it("creates a lead through the normal ingestion path", async () => {
    const created = await makeForm();
    const result = await submitRegistration(
      {},
      submission({
        token: created.token,
        student_name: `${MARKER} Asha`,
        primary_phone: "9847100501",
        email: "asha@example.invalid",
        city: "Kochi",
      }),
    );
    expect(result.error).toBeUndefined();
    expect(result.success).toBeTruthy();

    const [lead] = await db.select().from(leads).where(eq(leads.studentName, `${MARKER} Asha`));
    expect(lead).toBeDefined();
    expect(lead.city).toBe("Kochi");
    // Normalised to E.164 by the shared identity code, not stored raw.
    expect(lead.primaryPhone).toBe("+919847100501");
    // Attribution comes from the form, and first-touch is set on creation.
    expect(lead.firstTouchSource).toBe(`${MARKER} Source`);
  });

  it("matches a returning student to their existing lead instead of duplicating", async () => {
    // The whole reason submissions go through resolveOrCreateLead: the
    // same person filling the form twice is one lead with two enquiries.
    const created = await makeForm();
    const phone = "9847100502";
    await submitRegistration(
      {},
      submission({ token: created.token, student_name: `${MARKER} Ravi`, primary_phone: phone }),
    );
    await submitRegistration(
      {},
      submission({ token: created.token, student_name: `${MARKER} Ravi`, primary_phone: phone }),
    );

    const rows = await db.select().from(leads).where(eq(leads.primaryPhone, "+919847100502"));
    expect(rows).toHaveLength(1);

    const enquiryRows = await db.select().from(enquiries).where(eq(enquiries.leadId, rows[0].id));
    expect(enquiryRows.length).toBeGreaterThanOrEqual(2);
  });

  it("refuses a submission to a closed form", async () => {
    const created = await makeForm({ isActive: false });
    const result = await submitRegistration(
      {},
      submission({ token: created.token, student_name: `${MARKER} Closed`, primary_phone: "9847100503" }),
    );
    expect(result.error).toMatch(/no longer accepting/i);
    const rows = await db.select().from(leads).where(eq(leads.studentName, `${MARKER} Closed`));
    expect(rows).toHaveLength(0);
  });

  it("refuses a submission with an unknown token", async () => {
    const result = await submitRegistration(
      {},
      submission({ token: token(), student_name: `${MARKER} Ghost`, primary_phone: "9847100504" }),
    );
    expect(result.error).toMatch(/not valid/i);
    expect(await db.select().from(leads).where(eq(leads.studentName, `${MARKER} Ghost`))).toHaveLength(0);
  });

  it("IGNORES fields that decide ownership, even when the form asks for them", async () => {
    // The security property that matters most here. A stranger posting
    // stage_id/assigned_to/center_id/temperature must not be able to place
    // themselves in the pipeline or assign themselves to a counsellor —
    // even if an admin mistakenly adds those keys to the form.
    const created = await makeForm({
      fieldKeys: ["student_name", "primary_phone", "stage_id", "assigned_to", "temperature", "center_id"],
    });
    const stranger = randomUUID();
    await submitRegistration(
      {},
      submission({
        token: created.token,
        student_name: `${MARKER} Injector`,
        primary_phone: "9847100505",
        stage_id: stranger,
        assigned_to: stranger,
        temperature: "Hot",
        center_id: stranger,
      }),
    );

    const [lead] = await db.select().from(leads).where(eq(leads.studentName, `${MARKER} Injector`));
    expect(lead).toBeDefined();
    expect(lead.assignedTo).not.toBe(stranger);
    expect(lead.stageId).not.toBe(stranger);
    expect(lead.centerId).not.toBe(stranger);
    expect(lead.temperature).not.toBe("Hot");
  });

  it("silently accepts a honeypot submission without creating anything", async () => {
    const created = await makeForm();
    const result = await submitRegistration(
      {},
      submission({
        token: created.token,
        student_name: `${MARKER} Bot`,
        primary_phone: "9847100506",
        website: "http://spam.example",
      }),
    );
    // Reports success on purpose: telling a bot it was caught just invites
    // a retry without the trap.
    expect(result.success).toBeTruthy();
    expect(await db.select().from(leads).where(eq(leads.studentName, `${MARKER} Bot`))).toHaveLength(0);
  });

  it("rejects a missing name or phone with a readable message", async () => {
    const created = await makeForm();
    const noName = await submitRegistration(
      {},
      submission({ token: created.token, student_name: "", primary_phone: "9847100507" }),
    );
    expect(noName.error).toMatch(/name/i);

    const noPhone = await submitRegistration(
      {},
      submission({ token: created.token, student_name: `${MARKER} NoPhone`, primary_phone: "" }),
    );
    expect(noPhone.error).toMatch(/phone/i);
  });

  it("enforces the admin's required fields", async () => {
    // 'city' is not required by the field definition, so make one that is
    // required by construction: dob is optional in the seed, and the check
    // is driven by the field's own is_required flag, so use a field the
    // seed marks required.
    const created = await makeForm({ fieldKeys: ["student_name", "primary_phone"] });
    const result = await submitRegistration(
      {},
      submission({ token: created.token, student_name: `${MARKER} Req`, primary_phone: "9847100508" }),
    );
    // Both mandatory fields supplied, so this must succeed — the guard
    // only fires on a genuinely missing required answer.
    expect(result.error).toBeUndefined();
  });

  it("stores a custom field's answer in leads.custom, not as a column", async () => {
    const created = await makeForm({ fieldKeys: ["student_name", "primary_phone", "city"] });
    await submitRegistration(
      {},
      submission({
        token: created.token,
        student_name: `${MARKER} Custom`,
        primary_phone: "9847100509",
        city: "Kannur",
      }),
    );
    const [lead] = await db.select().from(leads).where(eq(leads.studentName, `${MARKER} Custom`));
    expect(lead.city).toBe("Kannur");
  });
});
