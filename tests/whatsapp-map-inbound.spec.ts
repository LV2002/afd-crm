import { describe, expect, it } from "vitest";

import {
  buttonText,
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

describe("button taps", () => {
  it("reads a template quick reply as the words on the button", () => {
    // Before this these arrived with a null body: a tap looked like an
    // empty message and no automation could act on it.
    expect(
      mapMessageContent({
        id: "m1",
        from: "+919847500101",
        timestamp: "1",
        type: "button",
        button: { text: "Yes, interested", payload: "YES" },
      }),
    ).toEqual({ messageType: "text", body: "Yes, interested", mediaId: null, mediaMimeType: null });
  });

  it("reads an interactive button and a list selection the same way", () => {
    expect(
      mapMessageContent({
        id: "m2",
        from: "+919847500101",
        timestamp: "1",
        type: "interactive",
        interactive: { type: "button_reply", button_reply: { id: "b1", title: "Not now" } },
      }).body,
    ).toBe("Not now");

    expect(
      mapMessageContent({
        id: "m3",
        from: "+919847500101",
        timestamp: "1",
        type: "interactive",
        interactive: { type: "list_reply", list_reply: { id: "l1", title: "NIFT" } },
      }).body,
    ).toBe("NIFT");
  });

  it("prefers the visible label over the developer payload", () => {
    // The label is what the person believes they said, and it is what an
    // automation branch is written against.
    expect(buttonText({ id: "m4", from: "x", timestamp: "1", type: "button", button: { text: "Yes", payload: "OPT_A" } })).toBe("Yes");
  });

  it("falls back to the payload when Meta sends no label", () => {
    expect(buttonText({ id: "m5", from: "x", timestamp: "1", type: "button", button: { payload: "OPT_A" } })).toBe("OPT_A");
  });

  it("is null for a message nobody pressed a button on", () => {
    expect(buttonText({ id: "m6", from: "x", timestamp: "1", type: "text", text: { body: "hi" } })).toBeNull();
  });
});

describe("message types that used to arrive as empty messages", () => {
  const base = { id: "w1", from: "919847100100", timestamp: "1700000000" };

  it("keeps the caption somebody typed under a photo, video or document", () => {
    expect(
      mapMessageContent({ ...base, type: "image", image: { id: "m1", mime_type: "image/jpeg", caption: " Marksheet " } }).body,
    ).toBe("Marksheet");
    expect(
      mapMessageContent({ ...base, type: "video", video: { id: "m2", mime_type: "video/mp4", caption: "My work" } }).body,
    ).toBe("My work");
  });

  it("treats a voice note as media", () => {
    expect(
      mapMessageContent({ ...base, type: "audio", audio: { id: "m3", mime_type: "audio/ogg; codecs=opus", voice: true } }),
    ).toMatchObject({ messageType: "media", mediaId: "m3", mediaMimeType: "audio/ogg; codecs=opus" });
  });

  it("does not store reactions or view-once / disappearing messages", () => {
    expect(mapMessageContent({ ...base, type: "reaction", reaction: { message_id: "x", emoji: "👍" } }).ignore).toBe(true);
    expect(mapMessageContent({ ...base, type: "unsupported" }).ignore).toBe(true);
  });

  it("turns a pin and a contact card into readable text", () => {
    expect(
      mapMessageContent({ ...base, type: "location", location: { latitude: 9.93, longitude: 76.26, name: "AFD Kochi" } }).body,
    ).toBe("📍 Location: AFD Kochi (9.93, 76.26)");
    expect(
      mapMessageContent({ ...base, type: "contacts", contacts: [{ name: { formatted_name: "Anjali" } }] }).body,
    ).toBe("👤 Shared a contact: Anjali");
  });

  it("says plainly what an unknown type was, rather than leaving a blank", () => {
    expect(mapMessageContent({ ...base, type: "order" }).body).toBe("[order message]");
  });
});
