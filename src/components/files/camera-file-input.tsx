"use client";

import { Camera } from "lucide-react";
import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/** Longest side of a photographed document. Plenty to read a signature or a marksheet. */
const MAX_SIDE_PX = 2400;
const JPEG_QUALITY = 0.85;

/**
 * Shrinks a phone photo before it is uploaded.
 *
 * A modern phone camera produces a 4–12 MB picture, and on a mobile
 * connection in a centre that is the difference between an upload that
 * finishes and one that quietly times out — and it eats the 20 MB limit
 * three photos at a time. Re-drawing it at a readable size on a canvas takes
 * a fraction of that. If anything about the picture cannot be decoded the
 * original goes through untouched: a large photo is better than no photo.
 */
async function shrink(file: File): Promise<File> {
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

/**
 * A file field with a camera button on a phone.
 *
 * Leon: counsellors should be able to photograph a document and upload it
 * from the mobile version. The ordinary file picker is kept — it is how a
 * PDF or a picture already in the gallery gets attached — and a **Take
 * photo** button sits beside it below the `md` breakpoint, where there is a
 * rear camera to open.
 *
 * ## How the photo reaches the form
 *
 * The visible input is the one the form submits, so the server action and
 * its validation are untouched. The camera is a second, hidden input with
 * `capture="environment"` (the rear camera, which is the one pointed at a
 * page); when it yields a picture it is shrunk and placed into the visible
 * input's file list. Nothing about how the upload is received changes, which
 * is why this is safe to put in front of every upload form.
 */
export function CameraFileInput({
  id,
  name = "file",
  accept,
  required,
}: {
  id: string;
  name?: string;
  accept: string;
  required?: boolean;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const [working, setWorking] = useState(false);
  const [taken, setTaken] = useState<string | null>(null);

  async function onPhoto(event: React.ChangeEvent<HTMLInputElement>) {
    const photo = event.target.files?.[0];
    if (!photo || !fileRef.current) return;
    setWorking(true);
    const prepared = await shrink(photo);
    const transfer = new DataTransfer();
    transfer.items.add(prepared);
    fileRef.current.files = transfer.files;
    setTaken(prepared.name);
    setWorking(false);
    // Clear the camera input so taking the same page again still fires.
    event.target.value = "";
  }

  return (
    <div className="flex flex-col gap-2">
      <Input
        ref={fileRef}
        id={id}
        name={name}
        type="file"
        accept={accept}
        required={required}
        onChange={() => setTaken(null)}
      />
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        tabIndex={-1}
        aria-hidden="true"
        onChange={onPhoto}
      />
      <div className="md:hidden">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={working}
          onClick={() => cameraRef.current?.click()}
        >
          <Camera className="size-4" />
          {working ? "Preparing photo…" : "Take photo"}
        </Button>
        {taken && (
          <p className="mt-1 text-xs text-muted-foreground" aria-live="polite">
            Photo ready: {taken}
          </p>
        )}
      </div>
    </div>
  );
}
