/** A tracked short link counts the tap and redirects; unknown codes 404. */
import { config as loadEnv } from "dotenv";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

loadEnv({ path: ".env" });
loadEnv({ path: ".env.local", override: true });
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set.");
vi.mock("server-only", () => ({}));

const { db } = await import("../src/lib/db/client");
const { whatsappLinks } = await import("../src/lib/db/schema");
const { GET } = await import("../src/app/l/[code]/route");
const { NextRequest } = await import("next/server");

const NAME = "LinkTest";
const call = (code: string) => GET(new NextRequest(`http://x/l/${code}`), { params: Promise.resolve({ code }) });

beforeAll(async () => {
  await db.delete(whatsappLinks).where(sql`${whatsappLinks.name} = ${NAME}`);
  await db.insert(whatsappLinks).values({ code: "linktst", name: NAME, url: "https://example.com/fees" });
});
afterAll(async () => {
  await db.delete(whatsappLinks).where(sql`${whatsappLinks.name} = ${NAME}`);
});

describe("tracked links", () => {
  it("redirects and counts each tap", async () => {
    const res = await call("linktst");
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("https://example.com/fees");
    await call("linktst");
    const [row] = await db.select().from(whatsappLinks).where(sql`${whatsappLinks.code} = 'linktst'`);
    expect(row.clicks).toBe(2);
  });
  it("404s for an unknown or malformed code", async () => {
    expect((await call("nope1234")).status).toBe(404);
    expect((await call("BAD CODE")).status).toBe(404);
  });
});
