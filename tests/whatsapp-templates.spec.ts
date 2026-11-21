/**
 * Message-template helpers.
 *
 * Templates are the only thing WhatsApp accepts outside the 24-hour
 * window, and Meta rejects a malformed one with an opaque 400 — so the
 * rules worth checking before the request are checked here. No network:
 * these are all pure.
 */
import { describe, expect, it } from "vitest";

import {
  buildTemplateComponents,
  isValidTemplateName,
  templateBody,
  templatePlaceholderCount,
  templateQuickReplies,
  type MessageTemplate,
} from "@/lib/integrations/whatsapp/templates";

function template(components: MessageTemplate["components"]): MessageTemplate {
  return {
    id: "1",
    name: "t",
    language: "en",
    category: "UTILITY",
    status: "APPROVED",
    components,
  };
}

describe("isValidTemplateName", () => {
  it("accepts Meta's shape", () => {
    expect(isValidTemplateName("fee_reminder")).toBe(true);
    expect(isValidTemplateName("batch2026_start")).toBe(true);
  });

  it("rejects what Meta would reject, before spending a request on it", () => {
    expect(isValidTemplateName("Fee Reminder")).toBe(false);
    expect(isValidTemplateName("fee-reminder")).toBe(false);
    expect(isValidTemplateName("")).toBe(false);
  });
});

describe("buildTemplateComponents", () => {
  const base = { name: "t", language: "en", category: "UTILITY" as const, body: "Hello {{1}}" };

  it("sends a body and nothing else when nothing else was filled in", () => {
    expect(buildTemplateComponents(base)).toEqual([{ type: "BODY", text: "Hello {{1}}" }]);
  });

  it("keeps Meta's component order — header, body, footer, buttons", () => {
    const components = buildTemplateComponents({
      ...base,
      header: "AFD India",
      footer: "Kochi & Kannur",
      quickReplies: ["Yes", "No"],
    });
    expect(components.map((c) => c.type)).toEqual(["HEADER", "BODY", "FOOTER", "BUTTONS"]);
  });

  it("drops blank optional fields rather than sending empty ones", () => {
    const components = buildTemplateComponents({
      ...base,
      header: "   ",
      footer: "",
      quickReplies: ["Yes", "  ", ""],
    });
    expect(components.map((c) => c.type)).toEqual(["BODY", "BUTTONS"]);
    expect(components[1].buttons).toEqual([{ type: "QUICK_REPLY", text: "Yes" }]);
  });

  it("omits the buttons component entirely when every quick reply was blank", () => {
    const components = buildTemplateComponents({ ...base, quickReplies: ["", "  "] });
    expect(components.map((c) => c.type)).toEqual(["BODY"]);
  });
});

describe("reading a template back", () => {
  it("finds the body among the components", () => {
    expect(
      templateBody(
        template([
          { type: "HEADER", text: "AFD" },
          { type: "BODY", text: "Hi {{1}}" },
        ]),
      ),
    ).toBe("Hi {{1}}");
  });

  it("returns empty rather than undefined for a template with no body", () => {
    expect(templateBody(template([{ type: "HEADER", text: "AFD" }]))).toBe("");
  });

  it("lists only the quick replies, not URL or call buttons", () => {
    const withButtons = template([
      { type: "BODY", text: "Hi" },
      {
        type: "BUTTONS",
        buttons: [
          { type: "QUICK_REPLY", text: "Yes" },
          { type: "URL", text: "Website", url: "https://afd.example" },
          { type: "QUICK_REPLY", text: "No" },
        ],
      },
    ]);
    expect(templateQuickReplies(withButtons)).toEqual(["Yes", "No"]);
  });

  // The send form asks for exactly this many values, so counting the
  // HIGHEST placeholder rather than the occurrences is what matters —
  // {{1}} twice is still one value.
  it("counts the values a send has to supply", () => {
    expect(templatePlaceholderCount(template([{ type: "BODY", text: "Hi {{1}}, {{2}} due" }]))).toBe(2);
    expect(templatePlaceholderCount(template([{ type: "BODY", text: "Hi {{1}}, bye {{1}}" }]))).toBe(1);
    expect(templatePlaceholderCount(template([{ type: "BODY", text: "No variables" }]))).toBe(0);
  });
});

import { buildTemplateComponents as buildWithLinks } from "../src/lib/integrations/whatsapp/templates";
import { describe as d2, expect as e2, it as i2 } from "vitest";

d2("template link and call buttons", () => {
  i2("adds a web-page and a call button after the quick replies", () => {
    const parts = buildWithLinks({
      name: "x", language: "en", category: "UTILITY", body: "Hi",
      quickReplies: ["Yes"],
      urlButton: { text: "Fees", url: "https://afdindia.com/fees" },
      callButton: { text: "Call us", phone: "+919847012345" },
    });
    const buttons = parts.find((c) => c.type === "BUTTONS")?.buttons;
    e2(buttons?.map((b) => b.type)).toEqual(["QUICK_REPLY", "URL", "PHONE_NUMBER"]);
  });
});

d2("template media header", () => {
  i2("uses the uploaded sample handle as the header example", () => {
    const parts = buildWithLinks({ name: "x", language: "en", category: "MARKETING", body: "Hi", header: "ignored", headerMedia: { format: "IMAGE", handle: "4::abc" } });
    const header = parts.find((c) => c.type === "HEADER");
    e2(header?.format).toBe("IMAGE");
    e2(header?.example?.header_handle).toEqual(["4::abc"]);
    e2(header?.text).toBeUndefined();
  });
});
