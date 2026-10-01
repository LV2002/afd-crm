/**
 * Which file is the student's photograph on a printed profile sheet.
 *
 * The box printed empty for Leon's first real submission. Both print pages
 * tested `photo_url` for a string starting with "http" — correct when the
 * Photo question was a pasted link, and false for every uploaded file,
 * because the stored answer is the filename.
 *
 * The cases below are the ones that decide whether a photo reaches the
 * sheet: the right file among several, a PDF that must never go in an
 * <img>, and the old pasted link still working.
 */
import { describe, expect, it } from "vitest";

import { pickPhotoAttachment, PHOTO_FIELD_KEY } from "@/lib/print/profile-photo";
import type { AttachmentRow } from "@/lib/storage/shared";

function file(overrides: Partial<AttachmentRow> & { id: string }): AttachmentRow {
  return {
    storage_path: `lead/x/${overrides.id}-file`,
    file_name: "file.jpg",
    mime_type: "image/jpeg",
    size_bytes: 2048,
    label: null,
    kind: "document",
    field_key: null,
    created_at: "2026-01-01T00:00:00.000Z",
    uploaded_by: null,
    ...overrides,
  };
}

describe("pickPhotoAttachment", () => {
  it("finds the file the student attached to the Photo question", () => {
    const photo = file({ id: "photo", field_key: PHOTO_FIELD_KEY });
    const idProof = file({ id: "id", field_key: "id_proof" });
    expect(pickPhotoAttachment([idProof, photo])?.id).toBe("photo");
  });

  it("prefers the question it answers over a file merely labelled 'photo'", () => {
    // A counsellor's own upload called "Photo of marksheet" must not beat
    // the thing the student actually sent for the photo question.
    const answer = file({ id: "answer", field_key: PHOTO_FIELD_KEY, label: "Photo" });
    const guess = file({ id: "guess", label: "Photo of marksheet" });
    expect(pickPhotoAttachment([guess, answer])?.id).toBe("answer");
  });

  it("falls back to the label for a photo uploaded before the question existed", () => {
    // Counsellors uploaded passport photos by hand for months. Those are
    // still the student's photograph and should still print.
    const legacy = file({ id: "legacy", label: "Passport photo" });
    expect(pickPhotoAttachment([file({ id: "other", label: "Marksheet" }), legacy])?.id).toBe(
      "legacy",
    );
  });

  it("never picks a PDF, however it is labelled", () => {
    // A PDF is a valid answer to a photo question and useless in an <img>;
    // picking one would print a broken image instead of the empty box that
    // at least looks deliberate.
    const pdf = file({
      id: "pdf",
      field_key: PHOTO_FIELD_KEY,
      mime_type: "application/pdf",
      file_name: "photo.pdf",
    });
    expect(pickPhotoAttachment([pdf])).toBeNull();
  });

  it("takes the newest when a student sent two", () => {
    // The second was meant to replace the first, and nobody prints the one
    // that was rejected.
    const older = file({
      id: "older",
      field_key: PHOTO_FIELD_KEY,
      created_at: "2026-03-01T00:00:00.000Z",
    });
    const newer = file({
      id: "newer",
      field_key: PHOTO_FIELD_KEY,
      created_at: "2026-06-01T00:00:00.000Z",
    });
    expect(pickPhotoAttachment([older, newer])?.id).toBe("newer");
    expect(pickPhotoAttachment([newer, older])?.id).toBe("newer");
  });

  it("is null when there is nothing to print", () => {
    expect(pickPhotoAttachment([])).toBeNull();
    expect(pickPhotoAttachment([file({ id: "a", label: "Signed agreement" })])).toBeNull();
  });
});
