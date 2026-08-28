/**
 * Bootstraps a fresh instance's configuration from an exported bundle
 * (CLAUDE.md § Plug-and-play test) — the multi-company / staging-to-a-
 * brand-new-instance story. Run against a freshly-migrated, empty
 * database, before anyone has logged in (there's nothing to log in with
 * yet — `profiles`/`auth.users` aren't part of the bundle, same as
 * `npm run db:seed`; creating the first admin login is a separate step).
 *
 * Run with: npm run db:config-import -- path/to/bundle.json
 *
 * Not a web feature — see docs/DECISIONS.md for why config import only
 * exists as a CLI tool, never a Server Action.
 */
import "./load-env";

import { readFileSync } from "node:fs";

import { configBundleSchema } from "../config/bundle-schema";
import { importConfig } from "../config/import-config";

async function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error("Usage: npm run db:config-import -- path/to/bundle.json");
    process.exit(1);
  }

  let raw: string;
  try {
    raw = readFileSync(filePath, "utf8");
  } catch (error) {
    console.error(`Could not read ${filePath}: ${error instanceof Error ? error.message : error}`);
    process.exit(1);
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw);
  } catch {
    console.error(`${filePath} isn't valid JSON.`);
    process.exit(1);
  }

  const parsed = configBundleSchema.safeParse(parsedJson);
  if (!parsed.success) {
    console.error("Bundle doesn't match the expected shape:");
    for (const issue of parsed.error.issues) {
      console.error(`  ${issue.path.join(".")}: ${issue.message}`);
    }
    process.exit(1);
  }

  const result = await importConfig(parsed.data);
  if (result.error) {
    console.error(`Import refused: ${result.error}`);
    process.exit(1);
  }

  console.log("Import succeeded:");
  for (const [table, count] of Object.entries(result.counts ?? {})) {
    console.log(`  ${table}: ${count}`);
  }
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
