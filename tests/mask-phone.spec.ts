import { describe, expect, it } from "vitest";

import { maskPhone } from "../src/lib/leads/mask-phone";

describe("maskPhone", () => {
  it("masks the CLAUDE.md example exactly: +91 98••••3456", () => {
    expect(maskPhone("+919847123456")).toBe("+91 98••••3456");
  });

  it("returns an em dash for null/undefined", () => {
    expect(maskPhone(null)).toBe("—");
    expect(maskPhone(undefined)).toBe("—");
  });

  it("returns a too-short number as-is rather than mangling it", () => {
    expect(maskPhone("+9198")).toBe("+9198");
  });

  it("shows a non-E.164 value as-is rather than guessing", () => {
    expect(maskPhone("9847123456")).toBe("9847123456");
  });

  it("applies a generic mask for a non-Indian number", () => {
    expect(maskPhone("+14155552671")).toBe("+14••••2671");
  });
});
