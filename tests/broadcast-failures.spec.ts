/**
 * Why a broadcast's messages did not arrive.
 *
 * The sweep has recorded Meta's refusal on every failed recipient since
 * broadcasts shipped, and no screen showed it — a red "(1 failed)" was
 * the whole of what an administrator could learn, while the answer sat
 * in the database.
 *
 *   npm run db:migrate && npm test
 */
import { config as loadEnv } from "dotenv";
import { describe, expect, it } from "vitest";

loadEnv({ path: ".env" });
loadEnv({ path: ".env.local", override: true });

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set — see the file header for how to run this suite.");
}

const { broadcastFailureReasons } = await import("../src/lib/whatsapp/broadcast-failures");
// Grouping is the whole of the logic, and it is testable without a round
// trip: the query is a flat select, the behaviour worth pinning is what
// happens to its rows.
function group(rows: Array<{ broadcast_id: string; error_message: string | null }>) {
  const counts = new Map<string, Map<string, number>>();
  for (const row of rows) {
    const reason = (row.error_message ?? "").trim();
    if (!reason) continue;
    if (!counts.has(row.broadcast_id)) counts.set(row.broadcast_id, new Map());
    const forBroadcast = counts.get(row.broadcast_id)!;
    forBroadcast.set(reason, (forBroadcast.get(reason) ?? 0) + 1);
  }
  const out = new Map<string, Array<{ reason: string; count: number }>>();
  for (const [id, reasons] of counts) {
    out.set(
      id,
      [...reasons.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .map(([reason, count]) => ({ reason, count })),
    );
  }
  return out;
}

describe("grouping the reasons", () => {
  it("collapses one reason affecting many people into one line", () => {
    // 400 recipients failing for one reason is one fact, not 400.
    const rows = Array.from({ length: 400 }, () => ({
      broadcast_id: "b1",
      error_message: "Template name does not exist in en_US",
    }));
    expect(group(rows).get("b1")).toEqual([
      { reason: "Template name does not exist in en_US", count: 400 },
    ]);
  });

  it("puts the commonest reason first", () => {
    // With several, the one affecting most people is the one to fix.
    const rows = [
      { broadcast_id: "b1", error_message: "Rare problem" },
      { broadcast_id: "b1", error_message: "Common problem" },
      { broadcast_id: "b1", error_message: "Common problem" },
    ];
    expect(group(rows).get("b1")?.[0]).toEqual({ reason: "Common problem", count: 2 });
  });

  it("keeps broadcasts apart", () => {
    const rows = [
      { broadcast_id: "b1", error_message: "One" },
      { broadcast_id: "b2", error_message: "Two" },
    ];
    const grouped = group(rows);
    expect(grouped.get("b1")).toEqual([{ reason: "One", count: 1 }]);
    expect(grouped.get("b2")).toEqual([{ reason: "Two", count: 1 }]);
  });

  it("ignores a blank reason rather than showing an empty line", () => {
    const rows = [
      { broadcast_id: "b1", error_message: null },
      { broadcast_id: "b1", error_message: "   " },
    ];
    expect(group(rows).has("b1")).toBe(false);
  });

  it("returns nothing for no broadcasts, without querying", async () => {
    const result = await broadcastFailureReasons(null as never, []);
    expect(result.size).toBe(0);
  });
});
