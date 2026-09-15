/**
 * Every analyst tool must scope to the caller's centres.
 *
 * CLAUDE.md § AI analyst rules: "A centre head asking 'how did Kochi do'
 * when they only own Kannur must get nothing." Today every tool does the
 * right thing — the security audit of 2026-09-15 checked all ten by hand
 * and found no gap. What it flagged (finding #3) is that nothing *keeps*
 * them right: the tools run on the direct database client, which bypasses
 * RLS, so a new tool that forgets to scope would leak quietly and no
 * Postgres policy would catch it.
 *
 * This is that missing catch. It reads the registry's own source and
 * insists each tool reaches for one of the scoping helpers. A syntactic
 * check is a blunt instrument — mentioning `leadScopeWhere` is not proof
 * of using it correctly — but it makes the omission impossible to commit
 * by accident, which is the actual failure mode. Correct *use* is covered
 * by tests/ai-person-history.spec.ts and tests/ai-analyst.spec.ts against
 * a real database.
 *
 * No database needed: this reads a file.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const REGISTRY = join(process.cwd(), "src/lib/ai/tools/index.ts");

/**
 * Any one of these in a tool's body means it has thought about scope.
 *
 * - `leadScopeWhere` / `analystScope` / `allowedCenterIds` — the scope is
 *   applied to the query itself.
 * - `scopedLeadRows` — the shared helper in the same file, which applies
 *   `leadScopeWhere` for its callers.
 * - `refuseUnlessOrgWide` — the tool returns individual people and is
 *   closed to anybody but org-wide readers, which is a stronger bar.
 */
const SCOPING_HELPERS = [
  "leadScopeWhere",
  "scopedLeadRows",
  "allowedCenterIds",
  "analystScope",
  "refuseUnlessOrgWide",
] as const;

/**
 * Tools deliberately exempt, with the reason. Adding a name here is a
 * decision somebody has to write down and defend in review — which is the
 * point. Empty today.
 */
const EXEMPT: Record<string, string> = {};

interface ToolSource {
  name: string;
  body: string;
}

function readToolSources(): ToolSource[] {
  const source = readFileSync(REGISTRY, "utf8");
  const start = source.indexOf("export const ANALYST_TOOLS");
  const end = source.indexOf("export const TOOLS_BY_NAME");
  expect(start, "ANALYST_TOOLS not found — has the registry been renamed?").toBeGreaterThan(-1);
  expect(end, "TOOLS_BY_NAME not found — has the registry been renamed?").toBeGreaterThan(start);

  const registry = source.slice(start, end);
  const matches = [...registry.matchAll(/^ {4}name: "([a-z_]+)"/gm)];

  return matches.map((match, index) => ({
    name: match[1],
    body: registry.slice(match.index, matches[index + 1]?.index ?? registry.length),
  }));
}

describe("every analyst tool is scoped", () => {
  const tools = readToolSources();

  it("finds the tools in the registry at all", () => {
    // Guards the parsing above: a refactor that breaks the regex would
    // otherwise make every assertion below pass vacuously.
    expect(tools.length).toBeGreaterThanOrEqual(10);
    expect(tools.map((tool) => tool.name)).toContain("leads_by_source");
  });

  it.each(readToolSources().map((tool) => [tool.name, tool.body] as const))(
    "%s applies a scope helper",
    (name, body) => {
      if (EXEMPT[name]) return;
      const used = SCOPING_HELPERS.filter((helper) => body.includes(helper));
      expect(
        used,
        `Analyst tool "${name}" does not reference any of ${SCOPING_HELPERS.join(", ")}. ` +
          "Every tool runs on the RLS-bypassing client, so the scope has to be applied in " +
          "the tool itself. Add one, or add the tool to EXEMPT with a written reason.",
      ).not.toEqual([]);
    },
  );

  it("keeps the exemption list honest", () => {
    for (const [name, reason] of Object.entries(EXEMPT)) {
      expect(tools.map((tool) => tool.name), `${name} is exempt but no longer exists`).toContain(name);
      expect(reason.length, `${name} is exempt with no reason given`).toBeGreaterThan(20);
    }
  });
});
