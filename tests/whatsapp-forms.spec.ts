import { describe, expect, it } from "vitest";

import { formAnswersOf, mapMessageContent, type WhatsAppInboundMessage } from "../src/lib/integrations/whatsapp/map-inbound";
import { buildFlowJson, cleanFormAnswers, FORM_SCREEN_ID, isFormFieldList } from "../src/lib/whatsapp/flow-form";

describe("buildFlowJson", () => {
  const json = buildFlowJson({ title: "Admission enquiry", fields: ["email", "city", "exam_year"], submitLabel: "Submit" }) as {
    screens: Array<{ id: string; terminal: boolean; layout: { children: Array<{ type: string; children: Array<Record<string, unknown>> }> } }>;
  };
  const form = json.screens[0].layout.children[0];

  it("has one terminal screen with a form", () => {
    expect(json.screens).toHaveLength(1);
    expect(json.screens[0].id).toBe(FORM_SCREEN_ID);
    expect(json.screens[0].terminal).toBe(true);
    expect(form.type).toBe("Form");
  });
  it("asks for each field with the right input type", () => {
    const inputs = form.children.filter((c) => c.type === "TextInput");
    expect(inputs.map((i) => [i.name, i["input-type"]])).toEqual([["email", "email"], ["city", "text"], ["exam_year", "number"]]);
  });
  it("sends every field back in the submit payload", () => {
    const footer = form.children.find((c) => c.type === "Footer") as { "on-click-action": { name: string; payload: Record<string, string> } };
    expect(footer["on-click-action"].name).toBe("complete");
    expect(footer["on-click-action"].payload).toEqual({ email: "${form.email}", city: "${form.city}", exam_year: "${form.exam_year}" });
  });
  it("keeps every label within Meta's 20 characters", () => {
    for (const c of form.children.filter((x) => x.type === "TextInput")) expect(String(c.label).length).toBeLessThanOrEqual(20);
  });
});

describe("isFormFieldList", () => {
  it("accepts known fields only", () => {
    expect(isFormFieldList(["email", "city"])).toBe(true);
    expect(isFormFieldList(["email", "password"])).toBe(false);
    expect(isFormFieldList([])).toBe(false);
  });
});

describe("cleanFormAnswers", () => {
  it("keeps good answers, drops Meta's token and unknown keys, reports bad ones", () => {
    const { values, rejected } = cleanFormAnswers({ flow_token: "form:1", email: "A@B.com", city: "Kochi", exam_year: "soon", sneaky: "x" });
    expect(values).toEqual({ email: "a@b.com", city: "Kochi" });
    expect(rejected).toEqual(["exam_year"]);
  });
});

describe("a submitted form arriving on the webhook", () => {
  const message: WhatsAppInboundMessage = {
    id: "wamid.1", from: "919847000000", timestamp: "1", type: "interactive",
    interactive: { type: "nfm_reply", nfm_reply: { name: "flow", response_json: JSON.stringify({ flow_token: "form:1", city: "Kochi" }) } },
  };
  it("reads as a line of text and exposes its answers", () => {
    expect(mapMessageContent(message).body).toMatch(/form/i);
    expect(formAnswersOf(message)).toEqual({ flow_token: "form:1", city: "Kochi" });
  });
  it("is not a form when there is no response", () => {
    expect(formAnswersOf({ ...message, interactive: { type: "button_reply" } })).toBeNull();
  });
});
