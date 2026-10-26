/**
 * The Country field on a lead (migration 0103; "Country (specify)" removed by 0107) — needs a real database with
 * migrations applied:   npm run db:migrate && npm test
 */
import { config as loadEnv } from "dotenv";
import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

loadEnv({ path: ".env" });
loadEnv({ path: ".env.local", override: true });

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set — see the file header for how to run this suite.");
}

const { db } = await import("../src/lib/db/client");
const { fieldDefinitions } = await import("../src/lib/db/schema");

async function field(key: string) {
  const [row] = await db
    .select()
    .from(fieldDefinitions)
    .where(and(eq(fieldDefinitions.entity, "lead"), eq(fieldDefinitions.key, key)));
  return row;
}

describe("a lead's country", () => {
  it("is a select with the Gulf countries and an Others", async () => {
    const country = await field("country");
    expect(country).toBeTruthy();
    expect(country.type).toBe("select");
    // Custom field: no column behind it, so no schema change was needed.
    expect(country.isCore).toBe(false);
    expect(country.showInFilters).toBe(true);
    expect(country.options?.map((option) => option.label)).toEqual([
      "India",
      "UAE",
      "Oman",
      "Muscat",
      "Kuwait",
      "Saudi Arabia",
      "Others",
    ]);
  });

  it("no longer asks for a separate name when it is Others", async () => {
    // "Country (specify)" was removed from the lead form (0107 switches it
    // off on existing databases; a fresh seed never creates it).
    const other = await field("country_other");
    expect(other === undefined || other.isActive === false).toBe(true);
  });

  it("sits in Personal", async () => {
    const country = await field("country");
    expect(country.section).toBe("Personal");
  });
});
