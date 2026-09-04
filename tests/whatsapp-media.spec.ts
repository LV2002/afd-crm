/**
 * Sending images and video over the Business API.
 *
 * Two halves, both worth pinning. The rules half (`lib/whatsapp/media.ts`)
 * is Meta's limits expressed once so the composer and the Server Action
 * cannot disagree — a file the browser accepts and the server refuses is a
 * upload spent for nothing, and the reverse is a send that fails at Meta's
 * door with an error nobody can act on.
 *
 * The payload half is the shape of the JSON that actually leaves this
 * codebase. Meta answers a wrong shape with an opaque 400, so the shapes
 * are asserted here rather than discovered in production: the media object
 * hangs off a key named after its own type, a filename rides only on a
 * document, and a template's header component must precede its body one.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  sendMediaMessage,
  sendTemplateMessage,
  uploadMedia,
} from "@/lib/integrations/whatsapp/client";
import { templateHeaderMediaKind, type MessageTemplate } from "@/lib/integrations/whatsapp/templates";
import {
  MAX_CAPTION_LENGTH,
  mediaKindFor,
  trimCaption,
  validateWhatsAppMedia,
} from "@/lib/whatsapp/media";

const MB = 1024 * 1024;

describe("mediaKindFor", () => {
  it("maps each accepted type to Meta's own word for it", () => {
    expect(mediaKindFor("image/jpeg")).toBe("image");
    expect(mediaKindFor("image/png")).toBe("image");
    expect(mediaKindFor("video/mp4")).toBe("video");
    expect(mediaKindFor("video/3gpp")).toBe("video");
    expect(mediaKindFor("application/pdf")).toBe("document");
  });

  it("is null for anything Meta would not take", () => {
    expect(mediaKindFor("image/heic")).toBeNull();
    expect(mediaKindFor("image/svg+xml")).toBeNull();
    expect(mediaKindFor("text/html")).toBeNull();
    expect(mediaKindFor("")).toBeNull();
  });
});

describe("validateWhatsAppMedia", () => {
  it("accepts a photo and a short video", () => {
    expect(validateWhatsAppMedia({ size: 2 * MB, type: "image/jpeg" })).toBeNull();
    expect(validateWhatsAppMedia({ size: 12 * MB, type: "video/mp4" })).toBeNull();
  });

  it("applies a DIFFERENT limit per kind, which is the whole point", () => {
    // 12 MB is fine as a video and refused as an image. A single limit
    // would have to be the smaller one, and would rule out video entirely.
    expect(validateWhatsAppMedia({ size: 12 * MB, type: "image/png" })).toMatch(/limit for images is 5 MB/);
    expect(validateWhatsAppMedia({ size: 12 * MB, type: "video/mp4" })).toBeNull();
  });

  it("accepts a file exactly at its limit", () => {
    expect(validateWhatsAppMedia({ size: 5 * MB, type: "image/jpeg" })).toBeNull();
    expect(validateWhatsAppMedia({ size: 16 * MB, type: "video/mp4" })).toBeNull();
  });

  it("names the actual size so somebody can go and shrink the file", () => {
    expect(validateWhatsAppMedia({ size: 40 * MB, type: "video/mp4" })).toMatch(/40\.0 MB/);
  });

  it("refuses a type WhatsApp cannot send, including ones the CRM itself stores", () => {
    // HEIC is fine as a CRM attachment and not sendable over WhatsApp, so
    // the two allow-lists genuinely differ and neither can be dropped.
    expect(validateWhatsAppMedia({ size: MB, type: "image/heic" })).toMatch(/JPG and PNG/);
    expect(validateWhatsAppMedia({ size: MB, type: "image/webp" })).toMatch(/JPG and PNG/);
  });

  it("refuses an empty file", () => {
    expect(validateWhatsAppMedia({ size: 0, type: "image/jpeg" })).toMatch(/empty/i);
  });
});

describe("trimCaption", () => {
  it("trims whitespace and caps at WhatsApp's caption length", () => {
    expect(trimCaption("  hello  ")).toBe("hello");
    expect(trimCaption("x".repeat(2000))).toHaveLength(MAX_CAPTION_LENGTH);
  });
});

describe("templateHeaderMediaKind", () => {
  function template(components: MessageTemplate["components"]): MessageTemplate {
    return { id: "1", name: "t", language: "en", category: "MARKETING", status: "APPROVED", components };
  }

  it("reports the media header a template was approved with", () => {
    expect(templateHeaderMediaKind(template([{ type: "HEADER", format: "IMAGE" }]))).toBe("image");
    expect(templateHeaderMediaKind(template([{ type: "HEADER", format: "VIDEO" }]))).toBe("video");
    expect(templateHeaderMediaKind(template([{ type: "HEADER", format: "DOCUMENT" }]))).toBe("document");
  });

  it("is null for a text header or no header, so no file field is offered", () => {
    // Meta rejects a media header component on a TEXT-header template, so
    // offering the field would produce a send that always fails.
    expect(templateHeaderMediaKind(template([{ type: "HEADER", format: "TEXT", text: "Hi" }]))).toBeNull();
    expect(templateHeaderMediaKind(template([{ type: "BODY", text: "Hello" }]))).toBeNull();
  });
});

/** Captures the single fetch the client makes and hands back its arguments. */
function captureFetch(responseBody: unknown) {
  const spy = vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => responseBody,
  })) as unknown as typeof fetch;
  vi.stubGlobal("fetch", spy);
  return spy as unknown as ReturnType<typeof vi.fn>;
}

function bodyOf(spy: ReturnType<typeof vi.fn>): Record<string, unknown> {
  const init = spy.mock.calls[0][1] as RequestInit;
  return JSON.parse(init.body as string);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("uploadMedia", () => {
  it("posts multipart with messaging_product and the file's own type", async () => {
    const spy = captureFetch({ id: "media-123" });
    const file = new File([new Uint8Array([1, 2, 3])], "campus.jpg", { type: "image/jpeg" });

    const id = await uploadMedia("PHONE_ID", "TOKEN", file, "campus.jpg");
    expect(id).toBe("media-123");

    const [url, init] = spy.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/PHONE_ID/media");
    const form = init.body as FormData;
    expect(form.get("messaging_product")).toBe("whatsapp");
    expect(form.get("type")).toBe("image/jpeg");

    // Setting Content-Type by hand loses the multipart boundary and the
    // upload fails with a 400 that says nothing useful.
    expect(init.headers).not.toHaveProperty("Content-Type");
  });

  it("treats a 200 with no id as a failure rather than sending an empty media id", async () => {
    captureFetch({});
    const file = new File([new Uint8Array([1])], "a.jpg", { type: "image/jpeg" });
    await expect(uploadMedia("PHONE_ID", "TOKEN", file, "a.jpg")).rejects.toThrow(/no media id/i);
  });
});

describe("sendMediaMessage", () => {
  it("names the payload key after the media type", async () => {
    const spy = captureFetch({ messages: [{ id: "wamid.1" }] });
    await sendMediaMessage("PHONE_ID", "TOKEN", "+919847000001", {
      kind: "image",
      mediaId: "media-1",
      caption: "Our Kochi campus",
    });

    const body = bodyOf(spy);
    expect(body.type).toBe("image");
    expect(body.image).toEqual({ id: "media-1", caption: "Our Kochi campus" });
    // Meta wants digits only; the CRM stores E.164 with a '+'.
    expect(body.to).toBe("919847000001");
  });

  it("puts a filename on a document and never on an image", async () => {
    const spy = captureFetch({ messages: [{ id: "wamid.2" }] });
    await sendMediaMessage("PHONE_ID", "TOKEN", "+919847000001", {
      kind: "document",
      mediaId: "media-2",
      fileName: "brochure.pdf",
    });
    expect(bodyOf(spy).document).toEqual({ id: "media-2", filename: "brochure.pdf" });

    vi.unstubAllGlobals();
    const imageSpy = captureFetch({ messages: [{ id: "wamid.3" }] });
    await sendMediaMessage("PHONE_ID", "TOKEN", "+919847000001", {
      kind: "image",
      mediaId: "media-3",
      fileName: "photo.jpg",
    });
    expect(bodyOf(imageSpy).image).toEqual({ id: "media-3" });
  });

  it("omits an empty caption rather than sending a blank one", async () => {
    const spy = captureFetch({ messages: [{ id: "wamid.4" }] });
    await sendMediaMessage("PHONE_ID", "TOKEN", "+919847000001", { kind: "video", mediaId: "m" });
    expect(bodyOf(spy).video).toEqual({ id: "m" });
  });
});

describe("sendTemplateMessage with a media header", () => {
  it("sends the header component before the body one", async () => {
    // Meta reads components in order and 400s on a header that arrives
    // second, so this ordering is load-bearing rather than tidy.
    const spy = captureFetch({ messages: [{ id: "wamid.5" }] });
    await sendTemplateMessage("PHONE_ID", "TOKEN", "+919847000001", "campus_tour", "en_US", ["Anjali"], {
      kind: "video",
      mediaId: "media-9",
    });

    const template = bodyOf(spy).template as { components: Array<Record<string, unknown>> };
    expect(template.components).toHaveLength(2);
    expect(template.components[0]).toEqual({
      type: "header",
      parameters: [{ type: "video", video: { id: "media-9" } }],
    });
    expect(template.components[1]).toEqual({
      type: "body",
      parameters: [{ type: "text", text: "Anjali" }],
    });
  });

  it("sends no components at all for a plain template", async () => {
    // An empty components array is not the same as none: Meta rejects it.
    const spy = captureFetch({ messages: [{ id: "wamid.6" }] });
    await sendTemplateMessage("PHONE_ID", "TOKEN", "+919847000001", "reminder", "en_US");
    expect(bodyOf(spy).template).not.toHaveProperty("components");
  });

  it("sends a header with no body params when the template takes none", async () => {
    const spy = captureFetch({ messages: [{ id: "wamid.7" }] });
    await sendTemplateMessage("PHONE_ID", "TOKEN", "+919847000001", "poster", "en_US", undefined, {
      kind: "image",
      mediaId: "media-10",
    });
    const template = bodyOf(spy).template as { components: Array<Record<string, unknown>> };
    expect(template.components).toHaveLength(1);
    expect(template.components[0].type).toBe("header");
  });
});
