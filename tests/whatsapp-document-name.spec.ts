/**
 * The name a recipient sees on a document sent through the WhatsApp API.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

const { sendTemplateMessage, sendMediaMessage } = await import("../src/lib/integrations/whatsapp/client");
const { filenameFromLink } = await import("../src/lib/whatsapp/flow-runner");

function captureFetch() {
  const calls: Array<{ template: { components: Array<{ parameters: Array<Record<string, unknown> & { document?: unknown }> }> }; document?: unknown }> = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init: { body: string }) => {
      calls.push(JSON.parse(init.body));
      return { ok: true, json: async () => ({ messages: [{ id: "wamid.X" }] }) };
    }),
  );
  return calls;
}

afterEach(() => vi.unstubAllGlobals());

describe("document names", () => {
  it("sends an uploaded document's file name in a template header, not just its media id", async () => {
    const calls = captureFetch();
    await sendTemplateMessage("1", "t", "+919847000000", "admit_card", "en_US", ["Anjali"], {
      kind: "document",
      mediaId: "555",
      filename: "NID Admit Card.pdf",
    });
    const header = calls[0].template.components[0].parameters[0];
    expect(header).toEqual({ type: "document", document: { id: "555", filename: "NID Admit Card.pdf" } });
  });

  it("never puts a filename on an image header, which Meta rejects", async () => {
    const calls = captureFetch();
    await sendTemplateMessage("1", "t", "+919847000000", "promo", "en_US", [], { kind: "image", mediaId: "7", filename: "poster.png" });
    expect(calls[0].template.components[0].parameters[0]).toEqual({ type: "image", image: { id: "7" } });
  });

  it("names a link-based document header and a free-form document", async () => {
    const calls = captureFetch();
    await sendTemplateMessage("1", "t", "+919847000000", "admit_card", "en_US", [], {
      kind: "document",
      link: "https://example.com/a.pdf",
      filename: "Admit card - Anjali.pdf",
    });
    expect(calls[0].template.components[0].parameters[0].document).toEqual({
      link: "https://example.com/a.pdf",
      filename: "Admit card - Anjali.pdf",
    });
    await sendMediaMessage("1", "t", "+919847000000", { kind: "document", mediaId: "9", fileName: "Fee structure.pdf" });
    expect(calls[1].document).toEqual({ id: "9", filename: "Fee structure.pdf" });
  });

  it("falls back to the file's own name in a link when none is sent", () => {
    expect(filenameFromLink("https://example.com/files/Admit%20card%20Anjali.pdf?x=1")).toBe("Admit card Anjali.pdf");
    expect(filenameFromLink("https://drive.google.com/uc?export=download&id=1AbCdEf")).toBe("Document.pdf");
  });
});
