import { describe, expect, it } from "vitest";

import {
  buildResolveLeadInput,
  mapMessageContent,
  resolveContactName,
  type WhatsAppContact,
  type WhatsAppInboundMessage,
} from "../src/lib/integrations/whatsapp/map-inbound";

describe("resolveContactName", () => {
  it("uses the WhatsApp profile name when present", () => {
    const contact: WhatsAppContact = { profile: { name: "Jane Doe" }, wa_id: "919847100100" };
    expect(resolveContactName(contact, "919847100100")).toBe("Jane Doe");
  });

  it("falls back to a phone-based placeholder when there's no profile name", () => {
    expect(resolveContactName(undefined, "919847100100")).toBe("WhatsApp Lead 0100");
  });

  it("falls back when the profile name is blank/whitespace", () => {
    const contact: WhatsAppContact = { profile: { name: "   " }, wa_id: "919847100100" };
    expect(resolveContactName(contact, "919847100100")).toBe("WhatsApp Lead 0100");
  });
});

function message(overrides: Partial<WhatsAppInboundMessage> = {}): WhatsAppInboundMessage {
  return {
    id: "wamid.TEST123",
    from: "919847100100",
    timestamp: "1700000000",
    type: "text",
    text: { body: "Hello" },
    ...overrides,
  };
}

describe("mapMessageContent", () => {
  it("maps a text message", () => {
    expect(mapMessageContent(message())).toEqual({ messageType: "text", body: "Hello", mediaId: null, mediaMimeType: null });
  });

  it("maps an image message to media, without a body", () => {
    const mapped = mapMessageContent(message({ type: "image", text: undefined, image: { id: "media1", mime_type: "image/jpeg" } }));
    expect(mapped).toEqual({ messageType: "media", body: null, mediaId: "media1", mediaMimeType: "image/jpeg" });
  });

  it("maps a document message to media", () => {
    const mapped = mapMessageContent(
      message({ type: "document", text: undefined, document: { id: "media2", mime_type: "application/pdf", filename: "marksheet.pdf" } }),
    );
    expect(mapped).toEqual({ messageType: "media", body: null, mediaId: "media2", mediaMimeType: "application/pdf" });
  });
});

describe("buildResolveLeadInput", () => {
  it("maps the WhatsApp message onto ResolveLeadInput with source=whatsapp", () => {
    const input = buildResolveLeadInput(message(), "Jane Doe", "counsellor-1");
    expect(input.studentName).toBe("Jane Doe");
    expect(input.primaryPhone).toBe("919847100100");
    expect(input.source).toBe("whatsapp");
    expect(input.dedupeKey).toBe("wamid.TEST123");
    expect(input.assignedTo).toBe("counsellor-1");
    expect(input.receivedAt).toEqual(new Date(1700000000 * 1000));
  });

  it("leaves assignedTo undefined when no counsellor owns the receiving number", () => {
    const input = buildResolveLeadInput(message(), "Jane Doe", null);
    expect(input.assignedTo).toBeUndefined();
  });
});
