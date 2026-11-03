/**
 * Tags are gone, and this keeps them gone.
 *
 * Nobody was using them, so they were taken out of the settings menu, the
 * lead page, the leads filter, automations, broadcasts, the AI analyst and
 * config export. The tables are deliberately LEFT in the database (`tags`,
 * `lead_tags`, `whatsapp_broadcasts.tag_id`) — dropping data in the same
 * change that stops using it is a decision for later. That makes a quiet
 * failure possible: the tables still exist, so code that touches them still
 * type-checks and runs. This fails the build if any application code does.
 *
 * Same idea as tests/no-stage.spec.ts. Comments are ignored.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..");

/** Names nothing may use at all, outside the schema/migrations/reset list. */
const FORBIDDEN = ["lead_tags", "leadTags", "LeadTags", 'from("tags")', "lead.tag_add", "lead.tag_remove", "/settings/tags"];

/**
 * Old automations may still hold a "put a tag on them" step or a tag
 * trigger. These few files recognise those names only to skip them safely.
 */
const LEGACY = ["add_tag", "tag_added"];
const LEGACY_ALLOWED = [
  join("src", "lib", "whatsapp", "flow-runner.ts"),
  join("src", "app", "(app)", "whatsapp", "flows", "[id]", "step-editor.tsx"),
  join("src", "app", "(app)", "whatsapp", "flows", "page.tsx"),
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

describe("nothing outside the schema uses a tag", () => {
  const files = walk(join(ROOT, "src")).filter((file) => {
    const relative = file.slice(ROOT.length + 1);
    return !ALLOWED_PATHS.some((allowed) => relative.startsWith(allowed));
  });

  it("scanned a plausible number of files", () => {
    expect(files.length).toBeGreaterThan(200);
  });

  it("finds none of the retired names", () => {
    const hits: string[] = [];
    for (const file of files) {
      const relative = file.slice(ROOT.length + 1);
      const code = stripComments(readFileSync(file, "utf8"));
      for (const name of FORBIDDEN) if (code.includes(name)) hits.push(`${relative}  →  ${name}`);
      if (!LEGACY_ALLOWED.includes(relative)) {
        for (const name of LEGACY) if (code.includes(name)) hits.push(`${relative}  →  ${name}`);
      }
    }
    expect(hits, "these files still use tags").toEqual([]);
  });

  it("no longer offers a tags screen", () => {
    expect(() => statSync(join(ROOT, "src", "app", "(app)", "settings", "tags"))).toThrow();
  });
});
