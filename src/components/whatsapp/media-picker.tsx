"use client";

import { Camera, Paperclip, X } from "lucide-react";
import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { shrinkImage } from "@/lib/files/shrink-image";
import { WHATSAPP_MEDIA_EXTENSIONS, validateWhatsAppMedia } from "@/lib/whatsapp/media";

/**
 * Attach a file to a WhatsApp message: pick one, or on a phone take a photo.
 *
 * Shared by the lead's WhatsApp panel and the reply box for a conversation that
 * is not a lead yet, so both accept the same things the same way.
 *
 * ## Photos are shrunk on the way in
 *
 * A phone photo is 4–12 MB and a file sent through the CRM has to fit under
 * 4 MB, so an image is redrawn at a readable size before anything is checked.
 * Without that, taking a photo and sending it would fail on its size for
 * nearly every phone. Anything that is not an image goes through untouched.
 *
 * The file is checked here, as it is chosen, with the same rule the server
 * applies — the counsellor hears "too big" before typing a caption, not after.
 */
export function MediaPicker({
  file,
  onChange,
  onError,
  disabled,
}: {
  file: File | null;
  onChange: (file: File | null) => void;
  onError: (message: string | null) => void;
  disabled?: boolean;
}) {
  const pickRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const [preparing, setPreparing] = useState(false);

  async function accept(chosen: File | undefined) {
    if (!chosen) return;
    onError(null);
    setPreparing(true);
    const prepared = chosen.type.startsWith("image/") ? await shrinkImage(chosen) : chosen;
    setPreparing(false);
    const invalid = validateWhatsAppMedia(prepared);
    if (invalid) {
      onError(invalid);
      onChange(null);
      return;
    }
    onChange(prepared);
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex gap-1">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled || preparing}
          onClick={() => pickRef.current?.click()}
          aria-label="Attach a photo, video, audio or document"
        >
          <Paperclip className="size-4" />
        </Button>
        {/* The camera only exists on a phone. */}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="md:hidden"
          disabled={disabled || preparing}
          onClick={() => cameraRef.current?.click()}
          aria-label="Take a photo to send"
        >
          <Camera className="size-4" />
        </Button>
      </div>

      <input
        ref={pickRef}
        type="file"
        accept={WHATSAPP_MEDIA_EXTENSIONS}
        className="hidden"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(event) => {
          void accept(event.target.files?.[0]);
          event.target.value = "";
        }}
      />
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(event) => {
          void accept(event.target.files?.[0]);
          event.target.value = "";
        }}
      />

      {(file || preparing) && (
        <p className="flex items-center gap-2 text-xs text-muted-foreground" aria-live="polite">
          <Paperclip className="size-3" />
          {preparing ? "Preparing…" : file?.name}
          {file && !preparing && (
            <button
              type="button"
              className="flex items-center underline"
              onClick={() => {
                onChange(null);
                onError(null);
              }}
            >
              <X className="mr-0.5 size-3" aria-hidden="true" />
              remove
            </button>
          )}
        </p>
      )}
    </div>
  );
}
