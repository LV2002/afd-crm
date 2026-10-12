"use client";

import { Camera } from "lucide-react";
import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { shrinkImage } from "@/lib/files/shrink-image";

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
    const prepared = await shrinkImage(photo);
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
