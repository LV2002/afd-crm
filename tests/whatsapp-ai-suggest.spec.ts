import { describe, expect, it } from "vitest";

import { buildContents, buildSystemInstruction, cleanSuggestion } from "../src/lib/whatsapp/ai-suggest";

describe("buildContents", () => {
  it("maps students to user and us to model, ends on a user turn, caps history", () => {
    const lines = Array.from({ length: 30 }, (_, i) => ({ direction: i % 2 ? ("outbound" as const) : ("inbound" as const), text: `m${i}` }));
    const contents = buildContents(lines, "Anjali");
    expect(contents).toHaveLength(13);
    expect(contents[contents.length - 1].role).toBe("user");
    expect(contents[0].role).toBe("user"); // the 12 newest start at m18, an inbound line
  });
  it("drops empty messages and truncates long ones", () => {
    const contents = buildContents([{ direction: "inbound", text: "  " }, { direction: "inbound", text: "x".repeat(900) }], "");
    expect(contents).toHaveLength(2);
    expect(contents[0].parts[0].text).toHaveLength(500);
  });
});

describe("buildSystemInstruction", () => {
  it("lists courses and approved wording and forbids inventing fees", () => {
    const text = buildSystemInstruction({ orgName: "AFD India", courses: ["NIFT Foundation"], savedReplies: [{ title: "Fees", body: "A counsellor will share fees." }] });
    expect(text).toContain("NIFT Foundation");
    expect(text).toContain("Never state fees");
    expect(text).toContain("A counsellor will share fees.");
  });
});

describe("cleanSuggestion", () => {
  it("strips quotes and markdown", () => {
    expect(cleanSuggestion('"Hi **Anjali**, thanks!"')).toBe("Hi Anjali, thanks!");
  });
});
