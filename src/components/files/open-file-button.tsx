"use client";

import { Download, Loader2 } from "lucide-react";
import { useState, useTransition } from "react";

import { FormMessage } from "@/components/layout/form-message";
import { Button } from "@/components/ui/button";
import { getAttachmentUrl } from "@/lib/storage/actions";

/**
 * Opens one stored file.
 *
 * The signed URL is fetched on click rather than rendered into the page.
 * It is a bearer token with a short life; putting one in the markup would
 * hand a working link to the document to anyone who views source, and
 * leave it valid in browser history. Extracted so the lead page, the
 * student page and the accounts screen all open files the same way — and,
 * more to the point, all pay the same audit cost for doing it.
 */
export function OpenFileButton({
  attachmentId,
  label = "Open",
  variant = "ghost",
  size = "sm",
}: {
  attachmentId: string;
  label?: string;
  variant?: "ghost" | "outline" | "secondary" | "default";
  size?: "sm" | "default";
}) {
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function open() {
    setError(null);
    setOpening(true);
    startTransition(async () => {
      const result = await getAttachmentUrl(attachmentId);
      setOpening(false);
      if (result.url) {
        window.open(result.url, "_blank", "noopener,noreferrer");
      } else {
        setError(result.error ?? "Could not open that file.");
      }
    });
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <Button type="button" variant={variant} size={size} onClick={open} disabled={opening}>
        {opening ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
        {label}
      </Button>
      {error && <FormMessage error={error} />}
    </div>
  );
}
