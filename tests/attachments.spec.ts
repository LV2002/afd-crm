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
  MAX_FILE_BYTES,
  buildStoragePath,
  sanitiseFileName,
  validateUpload,
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
