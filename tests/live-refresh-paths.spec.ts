import { describe, expect, it } from "vitest";

import { isLivePath } from "../src/lib/leads/live-refresh-paths";

describe("isLivePath", () => {
  it("is true for the work lists", () => {
    for (const p of ["/dashboard", "/leads", "/leads/", "/follow-ups", "/unassigned", "/dashboard/team/abc"]) {
      expect(isLivePath(p), p).toBe(true);
    }
  });

  it("is false where a refresh would disturb somebody", () => {
    for (const p of ["/leads/123", "/leads/new", "/leads/import", "/settings/health", "/finance", null]) {
      expect(isLivePath(p), String(p)).toBe(false);
    }
  });
});
