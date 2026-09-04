/**
 * Pure helpers behind file upload. No database needed.
 *
 * `buildStoragePath` matters more than its size suggests: migration 0031's
 * Storage policies parse the object key's first two segments to find the
 * owning lead or student and authorise the object. A name that could inject
 * a separator, or a shape that stopped matching, would break access control
 * rather than merely look untidy — so the shape is pinned here.
 */
import { describe, expect, it } from "vitest";

import {
  ALLOWED_MIME_TYPES,
  ATTACHMENT_KINDS,
  MAX_FILE_BYTES,
  buildStoragePath,
  currentSignedAgreement,
  isAttachmentKind,
  otherDocuments,
  sanitiseFileName,
  validateUpload,
  type AttachmentRow,
} from "../src/lib/storage/shared";

const UUID_PREFIX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-/;

describe("sanitiseFileName", () => {
  it("keeps an ordinary name intact", () => {
    expect(sanitiseFileName("Marksheet 2024.pdf")).toBe("Marksheet 2024.pdf");
  });

  it("strips directory components rather than escaping them", () => {
    expect(sanitiseFileName("../../etc/passwd")).toBe("passwd");
    expect(sanitiseFileName("C:\\Users\\leon\\photo.jpg")).toBe("photo.jpg");
    expect(sanitiseFileName("nested/path/report.pdf")).toBe("report.pdf");
  });

  it("collapses traversal dots and removes leading dots", () => {
    // A leading dot would make a hidden file; runs of dots are how traversal
    // is smuggled past naive checks.
    expect(sanitiseFileName("..hidden.pdf")).toBe("hidden.pdf");
    expect(sanitiseFileName("a....b.pdf")).toBe("a.b.pdf");
  });

  it("replaces characters that could change how a path is read", () => {
    expect(sanitiseFileName("re;port?name=x.pdf")).toBe("re_port_name_x.pdf");
  });

  it("never returns an empty string", () => {
    // An empty segment would produce a key ending in '-', which is still a
    // valid object but impossible for a person to identify.
    expect(sanitiseFileName("")).toBe("file");
    expect(sanitiseFileName("...")).toBe("file");
    expect(sanitiseFileName("/")).toBe("file");
  });

  it("bounds the length", () => {
    expect(sanitiseFileName("a".repeat(500)).length).toBeLessThanOrEqual(120);
  });
});

describe("buildStoragePath", () => {
  const leadId = "11111111-2222-3333-4444-555555555555";

  it("puts the parent kind and id in the first two segments", () => {
    // These two segments ARE the access-control input for storage.objects.
    const path = buildStoragePath({ kind: "lead", id: leadId }, "agreement.pdf");
    const segments = path.split("/");
    expect(segments[0]).toBe("lead");
    expect(segments[1]).toBe(leadId);
    expect(segments).toHaveLength(3);
  });

  it("uses 'student' for a student parent", () => {
    expect(buildStoragePath({ kind: "student", id: leadId }, "photo.jpg").startsWith(`student/${leadId}/`)).toBe(true);
  });

  it("prefixes a uuid so two uploads of the same filename never collide", () => {
    const a = buildStoragePath({ kind: "lead", id: leadId }, "photo.jpg");
    const b = buildStoragePath({ kind: "lead", id: leadId }, "photo.jpg");
    expect(a).not.toBe(b);
    expect(a.split("/")[2]).toMatch(UUID_PREFIX);
  });

  it("a hostile filename cannot add segments or escape the parent folder", () => {
    const path = buildStoragePath({ kind: "lead", id: leadId }, "../../../other-lead/steal.pdf");
    expect(path.split("/")).toHaveLength(3);
    expect(path.startsWith(`lead/${leadId}/`)).toBe(true);
    expect(path).not.toContain("..");
  });
});

describe("validateUpload", () => {
  const ok = { size: 1024, type: "application/pdf", name: "a.pdf" };

  it("accepts an allowed type within the size limit", () => {
    expect(validateUpload(ok)).toBeNull();
    for (const type of ALLOWED_MIME_TYPES) {
      expect(validateUpload({ ...ok, type })).toBeNull();
    }
  });

  it("rejects an empty file", () => {
    expect(validateUpload({ ...ok, size: 0 })).toMatch(/empty/i);
  });

  it("rejects a file over the size limit, and reports the actual size", () => {
    const message = validateUpload({ ...ok, size: MAX_FILE_BYTES + 1 });
    expect(message).toMatch(/limit is 20 MB/);
  });

  it("accepts a file exactly at the limit", () => {
    expect(validateUpload({ ...ok, size: MAX_FILE_BYTES })).toBeNull();
  });

  it("rejects types that could be served back as active content", () => {
    // The bucket is private, but a signed URL opened directly would still
    // render these in the browser's origin.
    expect(validateUpload({ ...ok, type: "text/html" })).toMatch(/Only images/);
    expect(validateUpload({ ...ok, type: "image/svg+xml" })).toMatch(/Only images/);
    expect(validateUpload({ ...ok, type: "application/x-msdownload" })).toMatch(/Only images/);
    expect(validateUpload({ ...ok, type: "" })).toMatch(/Only images/);
  });
});

/**
 * Which file is "the signed agreement".
 *
 * This used to be answered by searching the free-text label for the word
 * "instalment", so a counsellor who typed "Signed agreement" produced a
 * lead the system believed was unsigned. Two screens now read the answer —
 * the counsellor's and the accountant's — so they have to agree.
 */
function row(overrides: Partial<AttachmentRow> & { id: string }): AttachmentRow {
  return {
    storage_path: `lead/x/${overrides.id}-file.pdf`,
    file_name: "file.pdf",
    mime_type: "application/pdf",
    size_bytes: 1024,
    label: null,
    kind: "document",
    created_at: "2026-01-01T00:00:00.000Z",
    uploaded_by: null,
    ...overrides,
  };
}

describe("isAttachmentKind", () => {
  it("accepts exactly the kinds the code knows how to act on", () => {
    for (const kind of ATTACHMENT_KINDS) expect(isAttachmentKind(kind)).toBe(true);
  });

  it("rejects anything else, so a posted form cannot invent a kind", () => {
    // uploadAttachment falls back to "document" on a false here. A kind the
    // code does not branch on would be a file nobody's screen looks for.
    expect(isAttachmentKind("agreement")).toBe(false);
    expect(isAttachmentKind("SIGNED_AGREEMENT")).toBe(false);
    expect(isAttachmentKind("")).toBe(false);
    expect(isAttachmentKind(null)).toBe(false);
    expect(isAttachmentKind(undefined)).toBe(false);
    expect(isAttachmentKind(7)).toBe(false);
  });
});

describe("currentSignedAgreement", () => {
  it("finds the agreement among ordinary documents", () => {
    const rows = [
      row({ id: "a" }),
      row({ id: "b", kind: "signed_agreement" }),
      row({ id: "c" }),
    ];
    expect(currentSignedAgreement(rows)?.id).toBe("b");
  });

  it("returns the newest when the agreement has been re-uploaded", () => {
    // Replacing a badly-scanned page must not leave accounts looking at the
    // old one, and the old row is deliberately kept rather than deleted.
    const rows = [
      row({ id: "old", kind: "signed_agreement", created_at: "2026-01-01T00:00:00.000Z" }),
      row({ id: "new", kind: "signed_agreement", created_at: "2026-03-04T09:30:00.000Z" }),
    ];
    expect(currentSignedAgreement(rows)?.id).toBe("new");
  });

  it("is null when nothing has been signed yet", () => {
    expect(currentSignedAgreement([row({ id: "a" })])).toBeNull();
    expect(currentSignedAgreement([])).toBeNull();
  });

  it("does not treat a document merely labelled like one as the agreement", () => {
    // The exact failure the kind column exists to prevent, in reverse: a
    // note about the agreement is not the agreement.
    const rows = [row({ id: "a", label: "Draft instalment agreement (unsigned)" })];
    expect(currentSignedAgreement(rows)).toBeNull();
  });
});

describe("otherDocuments", () => {
  it("is everything that is not an agreement", () => {
    const rows = [
      row({ id: "a" }),
      row({ id: "b", kind: "signed_agreement" }),
      row({ id: "c" }),
    ];
    expect(otherDocuments(rows).map((r) => r.id)).toEqual(["a", "c"]);
  });

  it("keeps files uploaded before the general uploader was removed", () => {
    // Narrowing what a counsellor may upload must not take away access to
    // what they already uploaded.
    const rows = [row({ id: "old-id-proof", label: "ID proof" })];
    expect(otherDocuments(rows)).toHaveLength(1);
  });
});
