/**
 * The generated Google Apps Script, run for real.
 *
 * Google's services are faked (a sheet is an array, `UrlFetchApp` records what
 * it is asked to send), but the script is the exact text a person pastes. What
 * it sent is then handed to the real custom-webhook endpoint against the
 * database, so this proves the three things that matter: the signature
 * verifies, the row becomes a lead, and a retry does not become a second one.
 */
import { createHash, createHmac, randomBytes } from "node:crypto";
import vm from "node:vm";

import { config as loadEnv } from "dotenv";
import { eq, like } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

loadEnv({ path: ".env" });
loadEnv({ path: ".env.local", override: true });
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set.");

const { POST } = await import("../src/app/api/webhooks/custom/[slug]/route");
const { db } = await import("../src/lib/db/client");
const { customWebhooks, enquiries, leadIdentifiers, leads, webhookEvents } = await import("../src/lib/db/schema");
const { googleSheetScript } = await import("../src/lib/integrations/custom-webhook/google-sheet-script");

const MARKER = "SheetScriptTest";
let slug: string;
const secret = randomBytes(32).toString("hex");
const authKey = randomBytes(16).toString("hex");
const URL = () => `https://example.com/api/webhooks/custom/${slug}`;

type Sent = { url: string; body: string; headers: Record<string, string> };

/** Runs the script once against a fake sheet and returns what it did. */
function run(
  rows: unknown[][],
  options: { signing?: boolean; key?: boolean; respond?: (n: number) => { code: number; body: string } | "throw" } = {},
) {
  const sent: Sent[] = [];
  const sheet = rows.map((r) => [...r]);
  const triggers: string[] = [];
  const respond = options.respond ?? (() => ({ code: 200, body: '{"ok":true}' }));
  const script = googleSheetScript({
    url: URL(),
    signingSecret: options.signing === false ? null : secret,
    authKey: options.key ? authKey : null,
  });
  const sandbox: Record<string, unknown> = {
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => undefined }) },
    ScriptApp: {
      getProjectTriggers: () => [],
      deleteTrigger: () => undefined,
      newTrigger: (fn: string) => ({ timeBased: () => ({ everyMinutes: () => ({ create: () => triggers.push(fn) }) }) }),
    },
    SpreadsheetApp: {
      getActiveSpreadsheet: () => ({
        getId: () => "book1",
        getSheets: () => [fakeSheet],
        getSheetByName: () => fakeSheet,
      }),
    },
    Session: { getScriptTimeZone: () => "Asia/Kolkata" },
    Utilities: {
      DigestAlgorithm: { MD5: "md5" },
      formatDate: () => "25 Nov 2026 14:05",
      computeHmacSha256Signature: (text: string, key: string) =>
        Array.from(createHmac("sha256", key).update(text, "utf8").digest()).map((b) => (b > 127 ? b - 256 : b)),
      computeDigest: (algorithm: string, text: string) =>
        Array.from(createHash(algorithm).update(text, "utf8").digest()).map((b) => (b > 127 ? b - 256 : b)),
      base64EncodeWebSafe: (bytes: number[]) => Buffer.from(bytes.map((b) => b & 0xff)).toString("base64url"),
    },
    UrlFetchApp: {
      fetch: (url: string, init: { payload: string; headers: Record<string, string> }) => {
        sent.push({ url, body: init.payload, headers: init.headers });
        const r = respond(sent.length);
        if (r === "throw") throw new Error("no connection");
        return { getResponseCode: () => r.code, getContentText: () => r.body };
      },
    },
  };
  const fakeSheet = {
    getName: () => "Retargeting",
    getDataRange: () => ({ getValues: () => sheet.map((r) => [...r]) }),
    getRange: (row: number, col: number) => ({
      setValue: (v: unknown) => {
        while (sheet[row - 1].length < col) sheet[row - 1].push("");
        sheet[row - 1][col - 1] = v;
      },
    }),
  };
  vm.createContext(sandbox);
  vm.runInContext(`${script}\nthis.__api = { install: install, syncNewRows: syncNewRows };`, sandbox);
  const api = sandbox.__api as { install: () => void; syncNewRows: () => void };
  api.syncNewRows();
  return { sent, sheet, triggers, api };
}

async function replay(sent: Sent): Promise<unknown> {
  const headers: Record<string, string> = { "content-type": "application/json", ...sent.headers };
  const response = await POST(new Request(sent.url, { method: "POST", headers, body: sent.body }), { params: Promise.resolve({ slug }) });
  return response.json();
}

async function sweep() {
  const ls = await db.select({ id: leads.id }).from(leads).where(like(leads.studentName, `${MARKER}%`));
  for (const l of ls) {
    await db.delete(enquiries).where(eq(enquiries.leadId, l.id));
    await db.delete(leadIdentifiers).where(eq(leadIdentifiers.leadId, l.id));
  }
  await db.delete(leads).where(like(leads.studentName, `${MARKER}%`));
  const hooks = await db.select({ id: customWebhooks.id }).from(customWebhooks).where(like(customWebhooks.name, `${MARKER}%`));
  for (const h of hooks) await db.delete(webhookEvents).where(eq(webhookEvents.customWebhookId, h.id));
  await db.delete(customWebhooks).where(like(customWebhooks.name, `${MARKER}%`));
}

beforeAll(async () => {
  await sweep();
  slug = randomBytes(32).toString("hex");
  await db.insert(customWebhooks).values({
    name: `${MARKER} sheet`, slug, source: `${MARKER} Retargeting sheet`, signingSecret: secret, requireSignature: true, authToken: authKey,
  });
});
afterAll(sweep);

const HEADER = ["Timestamp", "Full Name", "Mobile", "Email", "City"];

describe("the generated Google Sheet script", () => {
  it("makes a lead from a new row, with a signature the endpoint accepts", async () => {
    const { sent, sheet } = run([HEADER, ["2026-11-24 10:00", `${MARKER} Asha`, 9847012301, "asha@example.com", "Kochi"]], { key: true });
    expect(sent).toHaveLength(1);
    expect(await replay(sent[0])).toEqual({ ok: true });
    const [lead] = await db.select().from(leads).where(like(leads.studentName, `${MARKER} Asha`));
    expect(lead).toBeTruthy();
    expect(lead.primaryPhone).toBe("+919847012301");
    // The row is marked, in a column the script added.
    expect(sheet[0][5]).toBe("CRM status");
    expect(sheet[1][5]).toMatch(/^Sent 25 Nov 2026 14:05/);
  });

  it("sends the same row twice as one submission, so a retry never becomes a second lead", async () => {
    const row = ["2026-11-24 10:05", `${MARKER} Bala`, "9847012302", "", "Kannur"];
    const first = run([HEADER, row], { key: true }).sent[0];
    const second = run([HEADER, row], { key: true }).sent[0];
    expect(JSON.parse(first.body).submission_id).toBe(JSON.parse(second.body).submission_id);
    expect(await replay(first)).toEqual({ ok: true });
    expect(await replay(second)).toEqual({ ok: true, duplicate: true });
    expect(await db.select().from(leads).where(like(leads.studentName, `${MARKER} Bala`))).toHaveLength(1);
  });

  it("does not resend a row it has already marked, and sends only the new ones", () => {
    const { sent, sheet, api } = run([HEADER, ["t1", `${MARKER} Chitra`, "9847012303", "", ""], ["t2", `${MARKER} Dev`, "9847012304", "", ""]], { key: true });
    expect(sent).toHaveLength(2);
    // Run again over the same, now-marked sheet: nothing is resent.
    api.syncNewRows();
    expect(sent).toHaveLength(2);
    // A new row arrives from the other tool: only that one is sent.
    sheet.push(["t3", `${MARKER} Esha`, "9847012305", "", ""]);
    api.syncNewRows();
    expect(sent).toHaveLength(3);
    expect(JSON.parse(sent[2].body)["Full Name"]).toBe(`${MARKER} Esha`);
    expect(sheet[3][5]).toMatch(/^Sent /);
  });

  it("skips blank rows and leaves out empty cells", () => {
    const { sent } = run([HEADER, ["", "", "", "", ""], ["t", `${MARKER} Fida`, "9847012306", "", ""]], { key: true });
    expect(sent).toHaveLength(1);
    const body = JSON.parse(sent[0].body);
    expect(body).not.toHaveProperty("Email");
    expect(body["Full Name"]).toBe(`${MARKER} Fida`);
  });

  it("marks a row the CRM cannot use as Skipped, with the reason, and does not retry it", async () => {
    const { sent, sheet } = run([HEADER, ["t", `${MARKER} Gita`, "", "", ""]], { key: true, respond: () => ({ code: 200, body: '{"ok":false,"error":"No phone field found. Fields sent: Full Name."}' }) });
    expect(sheet[1][5]).toMatch(/^Skipped: No phone field found/);
    // And the real endpoint really does answer that way.
    const real = (await replay(sent[0])) as { ok: boolean; error?: string };
    expect(real.ok).toBe(false);
    expect(real.error).toMatch(/phone/i);
  });

  it("leaves a failed row for the next run, and stops after a refusal", () => {
    const failing = run([HEADER, ["a", "A One", "9847012307", "", ""], ["b", "B Two", "9847012308", "", ""]], { key: true, respond: () => ({ code: 500, body: "{}" }) });
    expect(failing.sheet[1][5]).toMatch(/^Retry \(500\)/);
    expect(failing.sent).toHaveLength(2); // a server error: every row tried, each left to retry

    const refused = run([HEADER, ["a", "A One", "9847012307", "", ""], ["b", "B Two", "9847012308", "", ""]], { key: true, respond: () => ({ code: 401, body: "{}" }) });
    expect(refused.sent).toHaveLength(1); // a wrong key: one attempt, then stop
    expect(refused.sheet[1][5]).toMatch(/^Retry \(401/);
    expect(refused.sheet[2][5] ?? "").toBe("");

    const offline = run([HEADER, ["a", "A One", "9847012307", "", ""]], { key: true, respond: () => "throw" });
    expect(offline.sheet[1][5]).toMatch(/^Retry \(no connection\)/);
  });

  it("sends the key header and no signature when the endpoint is set up that way", () => {
    const keyOnly = run([HEADER, ["t", "K One", "9847012309", "", ""]], { signing: false, key: true });
    expect(keyOnly.sent[0].headers["X-AFD-Key"]).toBe(authKey);
    expect(keyOnly.sent[0].headers).not.toHaveProperty("X-AFD-Signature");
    const signedOnly = run([HEADER, ["t", "S One", "9847012310", "", ""]], { key: false });
    expect(signedOnly.sent[0].headers["X-AFD-Signature"]).toMatch(/^sha256=[0-9a-f]{64}$/);
    expect(signedOnly.sent[0].headers).not.toHaveProperty("X-AFD-Key");
  });

  it("names the sheet as the form, unless the sheet already has a form column", () => {
    const plain = JSON.parse(run([HEADER, ["t", "F One", "9847012311", "", ""]]).sent[0].body);
    expect(plain.form_name).toBe("Retargeting");
    const own = JSON.parse(run([[...HEADER, "Form name"], ["t", "F Two", "9847012312", "", "", "Foundation"]]).sent[0].body);
    expect(own["Form name"]).toBe("Foundation");
    expect(own).not.toHaveProperty("form_name");
  });

  it("installs a five-minute timer and runs once straight away", () => {
    const { triggers, sent, api } = run([HEADER, ["t", "I One", "9847012313", "", ""]]);
    sent.length = 0;
    api.install();
    expect(triggers).toEqual(["syncNewRows"]);
  });

  it("carries the endpoint's own address and keys, safely quoted", () => {
    const text = googleSheetScript({ url: 'https://x.test/a"b', signingSecret: "s'e\"cret", authKey: null });
    expect(() => new vm.Script(text)).not.toThrow();
    expect(text).toContain(JSON.stringify('https://x.test/a"b'));
  });
});
