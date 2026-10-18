import { describe, expect, it } from "vitest";

import { assessUsage, formatBytes, limitFromEnv } from "../src/lib/health/storage-level";

const MB = 1024 * 1024;

describe("assessUsage", () => {
  it("is ok below 70%, warns from 70%, critical from 90%", () => {
    expect(assessUsage(600 * MB, 1000 * MB)?.level).toBe("ok");
    expect(assessUsage(700 * MB, 1000 * MB)?.level).toBe("warn");
    expect(assessUsage(899 * MB, 1000 * MB)?.level).toBe("warn");
    expect(assessUsage(900 * MB, 1000 * MB)?.level).toBe("critical");
  });

  it("does not clamp: over the limit is over", () => {
    expect(assessUsage(1200 * MB, 1000 * MB)?.fraction).toBeCloseTo(1.2);
  });

  it("is null when it cannot be measured or the limit is nonsense", () => {
    expect(assessUsage(null, 1000 * MB)).toBeNull();
    expect(assessUsage(5, 0)).toBeNull();
  });
});

describe("formatBytes", () => {
  it("reads in MB then GB", () => {
    expect(formatBytes(5.25 * MB)).toBe("5.3 MB");
    expect(formatBytes(412 * MB)).toBe("412 MB");
    expect(formatBytes(1536 * MB)).toBe("1.5 GB");
  });
});

describe("limitFromEnv", () => {
  it("uses the value, or the free-plan fallback when unset or junk", () => {
    expect(limitFromEnv("8192", 1024)).toBe(8192 * MB);
    expect(limitFromEnv(undefined, 1024)).toBe(1024 * MB);
    expect(limitFromEnv("lots", 500)).toBe(500 * MB);
    expect(limitFromEnv("-5", 500)).toBe(500 * MB);
  });
});
