import { describe, expect, it } from "vitest";

import type { MessageTemplate } from "../src/lib/integrations/whatsapp/templates";
import { matchSavedReplies, renderTemplateBody, sendableTemplates, variableCountOf } from "../src/lib/whatsapp/template-preview";

describe("template variables", () => {
  it("counts the highest {{n}} the body asks for", () => {
    expect(variableCountOf("Hi {{1}}, your batch {{2}} starts {{3}}")).toBe(3);
    expect(variableCountOf("No blanks here")).toBe(0);
    expect(variableCountOf("Reuses {{1}} and {{1}}")).toBe(1);
  });
  it("fills in what is typed and leaves the rest visible", () => {
    expect(renderTemplateBody("Hi {{1}}, see you on {{2}}", ["Asha"])).toBe("Hi Asha, see you on {{2}}");
    expect(renderTemplateBody("Hi {{1}}", ["  "])).toBe("Hi {{1}}");
  });
});

describe("which templates can be picked", () => {
  const t = (name: string, status: string, components: MessageTemplate["components"]): MessageTemplate => ({ id: name, name, language: "en", category: "UTILITY", status, components });
  it("offers only approved ones, with their body, footer and buttons", () => {
    const out = sendableTemplates([
      t("fee_reminder", "APPROVED", [
        { type: "BODY", text: "Hi {{1}}, fee due {{2}}" },
        { type: "FOOTER", text: "AFD India" },
        { type: "BUTTONS", buttons: [{ type: "QUICK_REPLY", text: "Paid" }, { type: "URL", text: "Pay now", url: "https://x" }] },
      ]),
      t("waiting", "PENDING", [{ type: "BODY", text: "x" }]),
      t("rejected", "REJECTED", [{ type: "BODY", text: "x" }]),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ name: "fee_reminder", variableCount: 2, footer: "AFD India", buttons: ["Paid", "Pay now"] });
  });
  it("knows when a header needs a file", () => {
    const [one] = sendableTemplates([t("brochure", "APPROVED", [{ type: "HEADER", format: "DOCUMENT" }, { type: "BODY", text: "Brochure attached" }])]);
    expect(one.headerKind).toBe("DOCUMENT");
    expect(one.header).toBeNull();
  });
});

describe("saved replies by slash", () => {
  const replies = [
    { title: "Fee structure", shortcut: "fees", body: "…" },
    { title: "Hostel details", shortcut: "hostel", body: "…" },
    { title: "Welcome", shortcut: null, body: "…" },
  ];
  it("shows everything after a bare slash, and narrows as you type", () => {
    expect(matchSavedReplies(replies, "/")).toHaveLength(3);
    expect(matchSavedReplies(replies, "/fe").map((r) => r.shortcut)).toEqual(["fees"]);
    expect(matchSavedReplies(replies, "/wel").map((r) => r.title)).toEqual(["Welcome"]);
    expect(matchSavedReplies(replies, "/zzz")).toEqual([]);
  });
});
