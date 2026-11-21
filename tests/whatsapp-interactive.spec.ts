import { describe, expect, it } from "vitest";

import { checkListMessage, checkReplyButtons, describeInteractive } from "../src/lib/whatsapp/interactive";

describe("reply buttons", () => {
  it("accepts up to three short buttons", () => {
    expect(checkReplyButtons({ body: "Hi", buttons: ["Yes", "No", "Later"] }).ok).toBe(true);
  });
  it("refuses four, long, or duplicate buttons", () => {
    expect(checkReplyButtons({ body: "Hi", buttons: ["a", "b", "c", "d"] }).ok).toBe(false);
    expect(checkReplyButtons({ body: "Hi", buttons: ["x".repeat(21)] }).ok).toBe(false);
    expect(checkReplyButtons({ body: "Hi", buttons: ["Yes", "yes"] }).ok).toBe(false);
  });
});

describe("list message", () => {
  it("refuses eleven choices and over-long titles", () => {
    const rows = Array.from({ length: 11 }, (_, i) => ({ title: `Choice ${i}` }));
    expect(checkListMessage({ body: "Pick", buttonText: "Go", rows }).ok).toBe(false);
    expect(checkListMessage({ body: "Pick", buttonText: "Go", rows: [{ title: "x".repeat(25) }] }).ok).toBe(false);
  });
  it("describes what was sent for the chat history", () => {
    expect(describeInteractive("buttons", "Hi", ["A", "B"])).toContain("A · B");
  });
});
