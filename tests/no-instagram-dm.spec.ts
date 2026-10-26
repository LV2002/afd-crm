/**
 * Instagram DMs are gone, and this keeps them gone.
 *
 * Leon does not want the CRM to see Instagram messages. The inbox tab, the
 * webhook route, the Graph client and the settings controls were removed.
 * The tables (`instagram_conversations`, `instagram_messages`) are left in
 * the database — nothing is hard-deleted — which makes a quiet regression
 * possible: code that touches them still type-checks and runs.
 *
 * "Instagram" as a lead SOURCE (an ad, a profile link) is unrelated and
 * stays; this only looks for the DM machinery. Comments are ignored.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..");

const FORBIDDEN = [
  "instagram_conversations",
  "instagram_messages",
  "instagramConversations",
  "instagramMessages",
  "webhooks/instagram",
  "whatsapp/instagram",
  "instagram_manage_messages",
  "ig_user_id",
  "lib/instagram",
  "integrations/instagram",
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

describe("nothing outside the schema handles Instagram DMs", () => {
  const files = [...walk(join(ROOT, "src")), ...walk(join(ROOT, "e2e"))].filter((file) => {
    const relative = file.slice(ROOT.length + 1);
    return !ALLOWED_PATHS.some((allowed) => relative.startsWith(allowed));
  });

  it("scanned a plausible number of files", () => {
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
    expect(hits, "Instagram DMs were removed on request — do not bring them back quietly.").toEqual([]);
  });
});
