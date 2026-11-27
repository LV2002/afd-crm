import { describe, expect, it } from "vitest";

const { causeOf, describeError } = await import("../src/lib/errors/capture");

describe("what is recorded for a failed database query", () => {
  it("keeps the real reason that drizzle's wrapper hides on `cause`", () => {
    const pg = Object.assign(new Error("remaining connection slots are reserved"), { code: "53300" });
    const wrapped = new Error('Failed query: select "id" from "whatsapp_numbers" params: ', { cause: pg });
    expect(causeOf(wrapped)).toBe("53300: remaining connection slots are reserved");
    expect(describeError(wrapped).message).toMatch(/Failed query: .* — reason: 53300: remaining connection slots/);
  });

  it("follows a short chain, and leaves an error with no cause as it was", () => {
    const inner = new Error("connect ETIMEDOUT");
    const mid = new Error("connection failed", { cause: inner });
    const top = new Error("Failed query", { cause: mid });
    expect(causeOf(top)).toBe("connection failed ← connect ETIMEDOUT");
    expect(describeError(new Error("plain")).message).toBe("plain");
    expect(causeOf("not an error")).toBeNull();
  });
});
