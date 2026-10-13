// Browser-only: uses canvas and createImageBitmap. Import from client components.

/** Longest side of a photographed document. Plenty to read a signature or a marksheet. */
const MAX_SIDE_PX = 2400;
const JPEG_QUALITY = 0.85;

/**
 * Shrinks a phone photo before it is uploaded.
 *
 * A modern phone camera produces a 4–12 MB picture, and on a mobile
 * connection in a centre that is the difference between an upload that
 * finishes and one that quietly times out — and it blows through the upload size limit
 * three photos at a time. Re-drawing it at a readable size on a canvas takes
 * a fraction of that. If anything about the picture cannot be decoded the
 * original goes through untouched: a large photo is better than no photo.
 */
export async function shrinkImage(file: File): Promise<File> {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, MAX_SIDE_PX / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const context = canvas.getContext("2d");
    if (!context) return file;
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY),
    );
    if (!blob || blob.size >= file.size) return file;
    const name = `photo-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.jpg`;
    return new File([blob], name, { type: "image/jpeg" });
  } catch {
    return file;
  }
}
