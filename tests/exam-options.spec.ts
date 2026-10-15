/**
 * The Interested exams list (migration 0104) — needs a real database with
 * migrations applied:   npm run db:migrate && npm test
 */
import { config as loadEnv } from "dotenv";
import { and, asc, eq, isNull } from "drizzle-orm";
import { describe, expect, it } from "vitest";

loadEnv({ path: ".env" });
loadEnv({ path: ".env.local", override: true });

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set — see the file header for how to run this suite.");
}

const { db } = await import("../src/lib/db/client");
const { dropdownOptions } = await import("../src/lib/db/schema");

const WANTED = [
  "NID UG", "NID PG", "NIFT UG", "NIFT PG", "UCEED", "CEED", "NATA", "JEE 2",
  "BFA", "MFA", "KSDAT", "GAT", "PF", "Others",
];

describe("the Interested exams options", () => {
  it("are the fourteen Leon asked for, in that order, all live", async () => {
    const rows = await db
      .select({ value: dropdownOptions.value, label: dropdownOptions.label, isActive: dropdownOptions.isActive })
      .from(dropdownOptions)
      .where(and(eq(dropdownOptions.category, "exam"), isNull(dropdownOptions.deletedAt)))
      .orderBy(asc(dropdownOptions.sortOrder));
    expect(rows.slice(0, WANTED.length).map((row) => row.label)).toEqual(WANTED);
    expect(rows.slice(0, WANTED.length).every((row) => row.isActive)).toBe(true);
  });

  it("keeps the stored values leads already carry, so nobody is orphaned", async () => {
    const rows = await db
      .select({ value: dropdownOptions.value, label: dropdownOptions.label })
      .from(dropdownOptions)
      .where(and(eq(dropdownOptions.category, "exam"), isNull(dropdownOptions.deletedAt)));
    const labelOf = new Map(rows.map((row) => [row.value, row.label]));
    expect(labelOf.get("nid")).toBe("NID UG");
    expect(labelOf.get("nift_mdes")).toBe("NIFT PG");
    expect(labelOf.get("jee_paper_2")).toBe("JEE 2");
  });
});
