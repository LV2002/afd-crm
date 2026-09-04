import { describe, expect, it } from "vitest";

import {
  mapMessageContent,
  type WhatsAppInboundMessage,
} from "../src/lib/integrations/whatsapp/map-inbound";

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
