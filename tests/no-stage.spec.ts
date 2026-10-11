/**
 * Stages are gone, and this keeps them gone.
 *
 * Leon merged the pipeline stage into temperature ("I don't want stages
 * anymore"), and migration 0099 converted the data. The old table, column
 * and history are deliberately LEFT in the database — dropping the only
 * record of where each lead used to be, in the same migration that stops
 * using it, is a decision for after the new model has been seen working.
 * That makes a quiet failure possible: the columns still exist, so code
 * that reads or writes them still type-checks and still runs. A query that
 * filters on `stage_id` returns nothing useful and nothing complains.
 *
 * So this fails the build if any application code touches them. It reads
 * source rather than types because half the queries are strings handed to
 * PostgREST, which no compiler sees.
 *
 * Allowed: the Drizzle schema (the deprecated definitions themselves), the
 * table-classification list used by data resets, and migrations. Comments
 * are ignored — explaining why a thing was removed is not using it.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..");

const FORBIDDEN = [
  "stage_id",
  "stageId",
  "pipeline_stages",
  "pipelineStages",
  "stage_history",
  "stageHistory",
  "stage_type",
  "stageType",
  "pipeline-stages",
  "stage_entered",
  "set_stage",
];

const ALLOWED_PATHS = [
  join("src", "lib", "db", "schema") + "/",
  join("src", "lib", "db", "migrations") + "/",
  join("src", "lib", "db", "reset-tables.ts"),
];

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next" || name.startsWith(".")) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(full);
  }
  return out;
}

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

describe("nothing outside the schema reads or writes a stage", () => {
  const files = [...walk(join(ROOT, "src")), ...walk(join(ROOT, "e2e"))].filter((file) => {
    const relative = file.slice(ROOT.length + 1);
    return !ALLOWED_PATHS.some((allowed) => relative.startsWith(allowed));
  });

  it("scanned a plausible number of files", () => {
    // A guard that quietly scans nothing is worse than no guard.
    expect(files.length).toBeGreaterThan(200);
  });

  it("finds none of the retired names", () => {
    const hits: string[] = [];
    for (const file of files) {
      const code = stripComments(readFileSync(file, "utf8"));
      for (const name of FORBIDDEN) {
        if (code.includes(name)) hits.push(`${file.slice(ROOT.length + 1)}  →  ${name}`);
      }
    }
    expect(hits, "These files still use stages. Use the lead's temperature instead.").toEqual([]);
  });
});
