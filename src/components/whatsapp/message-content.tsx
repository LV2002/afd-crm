"use client";

import { InboundMedia } from "@/components/whatsapp/inbound-media";
import type { WhatsAppThreadMessage } from "@/lib/whatsapp/get-thread";
import { mediaLabel } from "@/lib/whatsapp/media-label";

/**
 * What goes inside a message bubble: a photo, voice note, video or file when
 * it carries one, the template that was sent, or the text.
 *
 * One component for both places a thread is drawn (a lead's conversation and
 * the inbox of somebody who is not a lead yet). They used to differ: the
 * unmatched inbox only knew about `body`, so every photo, voice note and
 * video there showed as an empty message.
 */
export function MessageContent({ message }: { message: WhatsAppThreadMessage }) {
  const isOutbound = message.direction === "outbound";

  if (message.messageType === "media") {
    return (
      <span className="flex flex-col gap-1.5">
        {message.mediaStoragePath ? (
          // The bytes are ours now: fetched from Meta into the private
          // bucket and shown through a short-lived signed URL.
          <InboundMedia
            messageId={message.id}
            mimeType={message.mediaMimeType}
            filename={message.mediaFilename}
          />
        ) : (
          <span className="text-xs opacity-70">
            {mediaLabel(message.mediaMimeType)}{" "}
            {isOutbound
              ? "sent"
              : message.mediaError
                ? "— couldn't be fetched"
                : "— on its way here (videos can take a few minutes)"}
          </span>
        )}
        {/* Said plainly rather than left as a blank space. Meta deletes
            inbound media after thirty days, and "we tried and it was
            already gone" is the answer somebody needs. */}
        {!message.mediaStoragePath && !isOutbound && message.mediaError && (
          <span className="text-xs opacity-70">{message.mediaError}</span>
        )}
        {message.body && <span>{message.body}</span>}
      </span>
    );
  }

  if (message.messageType === "template") {
    return (
      <span>
        <span className="text-xs uppercase opacity-70">Template: {message.templateName}</span>
      </span>
    );
  }

  return <>{message.body ?? <span className="italic opacity-80">(no text)</span>}</>;
}
