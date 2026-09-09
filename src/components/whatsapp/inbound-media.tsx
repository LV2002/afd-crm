"use client";

import { Download, ImageIcon } from "lucide-react";
import * as React from "react";

import { Button } from "@/components/ui/button";

import { getWhatsAppMediaUrl } from "./media-actions";

/**
 * A picture, video or document somebody sent us.
 *
 * The bytes live in a private bucket, so they can only be shown through a
 * short-lived signed URL fetched on demand — the same rule every other
 * file in this system follows, and the reason this is not simply an
 * `<img src>`.
 *
 * Images load themselves as soon as the thread renders, because a photo
 * a student sent is the message. Anything else waits for a click: a
 * counsellor scrolling a year of conversation should not pull down four
 * videos to get past them.
 */
export function InboundMedia({
  messageId,
  mimeType,
  filename,
}: {
  messageId: string;
  mimeType: string | null;
  filename: string | null;
}) {
  const [url, setUrl] = React.useState<string | null>(null);
  const [state, setState] = React.useState<"idle" | "loading" | "failed">("idle");
  const isImage = (mimeType ?? "").startsWith("image/");

  const load = React.useCallback(async () => {
    setState("loading");
    const result = await getWhatsAppMediaUrl(messageId);
    if (result.url) {
      setUrl(result.url);
      setState("idle");
    } else {
      setState("failed");
    }
  }, [messageId]);

  React.useEffect(() => {
    if (isImage) void load();
  }, [isImage, load]);

  if (isImage) {
    if (url) {
      return (
        <a href={url} target="_blank" rel="noopener noreferrer">
          {/* A signed URL from a private bucket, valid for five minutes.
              next/image would cache it and then re-fetch it after it had
              expired, which is a broken image rather than an optimised one. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={url}
            alt={filename ?? "Image received on WhatsApp"}
            className="max-h-64 w-auto max-w-full rounded-md border"
          />
        </a>
      );
    }
    return (
      <span className="flex items-center gap-2 text-sm opacity-80">
        <ImageIcon className="size-4" />
        {state === "failed" ? "Could not load the image." : "Loading the image…"}
      </span>
    );
  }

  return (
    <span className="flex flex-col gap-1.5">
      <span className="text-sm opacity-80">{filename ?? mimeType ?? "A file"}</span>
      {url ? (
        <Button asChild size="sm" variant="secondary">
          <a href={url} target="_blank" rel="noopener noreferrer">
            <Download className="size-4" /> Open
          </a>
        </Button>
      ) : (
        <Button size="sm" variant="secondary" onClick={load} disabled={state === "loading"}>
          <Download className="size-4" />
          {state === "loading" ? "Getting it…" : state === "failed" ? "Try again" : "Open"}
        </Button>
      )}
    </span>
  );
}
