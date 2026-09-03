/**
 * A "use server" file may export ONLY async functions.
 *
 * Next.js rewrites every export of such a file into a server-action stub,
 * so a plain `export const` becomes something that is not the value the
 * importer expects. TypeScript cannot see this — the types are perfectly
 * consistent — and the build succeeds. It fails at runtime, in the
 * browser, with errors that don't name the real cause:
 *
 *   A "use server" file can only export async functions, found object.
 *   ..._WEBPACK_IMPORTED_MODULE__.INSTALMENT_SLOTS.map is not a function
 *
 * That is exactly what happened with INSTALMENT_SLOTS, and it reached the
 * client's browser because nothing here checked. This scan is cheap and
 * catches the whole class.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === "node_modules" || entry === ".next") continue;
      walk(full, out);
    } else if (/\.tsx?$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

/**
 * Type-only exports (`export interface`, `export type`) are erased before
 * the directive matters, so they are legitimate and not flagged.
 */
const OFFENDING_EXPORT = /^export\s+(?:const|let|var|class|function)\s/gm;
const ALLOWED = /^export\s+async\s+function\s/gm;

describe('"use server" files', () => {
  const serverFiles = walk("src").filter((file) => {
    const source = readFileSync(file, "utf8");
    return /^["']use server["'];?\s*$/m.test(source.split("\n").slice(0, 3).join("\n"));
  });

  it("finds the server-action files to check", () => {
    // If this ever hits zero the scan below is silently vacuous.
    expect(serverFiles.length).toBeGreaterThan(0);
  });

  it.each(serverFiles)("%s exports only async functions", (file) => {
    const source = readFileSync(file, "utf8");
    const offenders: string[] = [];

    for (const match of source.matchAll(OFFENDING_EXPORT)) {
      // `export async function` is matched by OFFENDING_EXPORT's `function`
      // arm too, so re-check it against the allowed form.
      const at = match.index ?? 0;
      const fullLine = source.slice(at, source.indexOf("\n", at));
      if (ALLOWED.test(fullLine)) {
        ALLOWED.lastIndex = 0;
        continue;
      }
      ALLOWED.lastIndex = 0;
      offenders.push(fullLine.trim());
    }

    expect(
      offenders,
      `${file} has "use server" but exports a non-async value. Move it to a plain module — ` +
        `Next.js will rewrite it into an action stub and it will break at runtime.`,
    ).toEqual([]);
  });
});
