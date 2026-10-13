import { describe, expect, it } from "vitest";

import { summariseDeliveries, type DeliveryRowLike } from "@/lib/integrations/delivery-summary";

const row = (status: string, at: string, error: string | null = null, id = "w1"): DeliveryRowLike => ({
  custom_webhook_id: id,
  received_at: at,
  status,
  last_error: error,
});

describe("summariseDeliveries", () => {
  it("does not call an old failure current when the newest delivery was accepted", () => {
    const summary = summariseDeliveries([
      row("done", "2026-10-13T07:14:00Z"),
      row("done", "2026-10-13T05:00:00Z"),
      row("failed", "2026-10-12T10:00:00Z", "Invalid or missing X-AFD-Signature"),
    ]).get("w1")!;
    expect(summary.count).toBe(3);
    expect(summary.failed).toBe(1);
    expect(summary.lastFailed).toBe(false);
    expect(summary.lastError).toBe("Invalid or missing X-AFD-Signature");
    expect(summary.lastErrorAt).toBe("2026-10-12T10:00:00Z");
  });

  it("flags the endpoint when the newest delivery itself was rejected", () => {
    const summary = summariseDeliveries([
      row("failed", "2026-10-13T07:14:00Z", "Invalid or missing X-AFD-Signature"),
      row("done", "2026-10-13T05:00:00Z"),
    ]).get("w1")!;
    expect(summary.lastFailed).toBe(true);
    expect(summary.lastError).toBe("Invalid or missing X-AFD-Signature");
  });

  it("keeps the NEWEST failure's reason, not an older one", () => {
    const summary = summariseDeliveries([
      row("done", "2026-10-13T09:00:00Z"),
      row("failed", "2026-10-13T08:00:00Z", "newer"),
      row("failed", "2026-10-12T08:00:00Z", "older"),
    ]).get("w1")!;
    expect(summary.lastError).toBe("newer");
    expect(summary.failed).toBe(2);
  });

  it("keeps endpoints apart and ignores rows with no endpoint", () => {
    const map = summariseDeliveries([
      row("done", "2026-10-13T09:00:00Z", null, "a"),
      row("failed", "2026-10-13T08:00:00Z", "x", "b"),
      { custom_webhook_id: null, received_at: "2026-10-13T07:00:00Z", status: "failed", last_error: "y" },
    ]);
    expect(map.get("a")!.failed).toBe(0);
    expect(map.get("b")!.lastFailed).toBe(true);
    expect(map.size).toBe(2);
  });
});
