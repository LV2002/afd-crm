/**
 * Every notification event has somewhere that fires it.
 *
 * `events.ts` states the rule in its own header — "every key here
 * corresponds to a real `notify()` call somewhere in the codebase, and a
 * key with no call site notifies nobody" — and until now nothing checked
 * it. That is precisely the failure the whole feature was built to fix:
 * the SLA escalation ladder sat in the admin UI, fully configurable and
 * completely inert, for months.
 *
 * A switch an admin can turn on that does nothing is worse than no
 * switch, because it is indistinguishable from one that works.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { NOTIFICATION_EVENTS } from "../src/lib/notifications/events";

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
 * The catalogue itself obviously names every key, so it is excluded —
 * otherwise the test would pass on the strength of the list it is
 * checking.
 */
const CATALOGUE = join("src", "lib", "notifications", "events.ts");

describe("the notification event catalogue", () => {
  const sources = walk("src")
    .filter((file) => file !== CATALOGUE)
    .map((file) => readFileSync(file, "utf8"));

  it.each(NOTIFICATION_EVENTS.map((event) => event.key))("%s is actually fired", (key) => {
    // Matched as a literal `eventKey: "<key>"` rather than as a bare
    // string, so a key that only appears in a comment or a seed list
    // does not count as a call site.
    const needle = `eventKey: "${key}"`;
    const found = sources.some((source) => source.includes(needle));

    expect(found, `${key} is in NOTIFICATION_EVENTS but nothing calls notify() with it`).toBe(true);
  });
});
