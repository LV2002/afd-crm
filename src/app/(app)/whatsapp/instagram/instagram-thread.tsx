"use client";

import { useActionState, useEffect, useRef } from "react";

import { FormMessage } from "@/components/layout/form-message";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { formatDateIST } from "@/lib/format/date";
import type { InstagramMessageRow } from "@/lib/instagram/get-conversations";
import { cn } from "@/lib/utils";

import {
  markInstagramConversationRead,
  sendInstagramReply,
  type InstagramActionState,
} from "./actions";

const initialState: InstagramActionState = {};

/**
 * One DM thread, with the reply box.
 *
 * A client component for three reasons and no more: the reply form needs
 * `useActionState`, the thread should scroll to the newest message, and
 * opening it clears the unread count — a mutation that does not belong in
 * a Server Component's render.
 */
export function InstagramThread({
  conversationId,
  messages,
  canSend,
  withinWindow,
  lastInboundAt,
}: {
  conversationId: string;
  messages: InstagramMessageRow[];
  canSend: boolean;
  withinWindow: boolean;
  lastInboundAt: string | null;
}) {
  const [state, formAction, pending] = useActionState(sendInstagramReply, initialState);
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [messages.length, state.success]);

  useEffect(() => {
    // Deliberately unawaited and unhandled: an unread badge that stays is
    // cosmetic, and nothing about reading a message should produce an
    // error on screen.
    void markInstagramConversationRead(conversationId);
  }, [conversationId]);

  return (
    <div className="flex flex-col gap-3 rounded-lg border p-4">
      <div className="flex max-h-[55vh] flex-col gap-3 overflow-y-auto">
        {messages.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No messages yet.</p>
        ) : (
          messages.map((message) => (
            <div
              key={message.id}
              className={cn(
                "flex flex-col gap-0.5",
                message.direction === "outbound" ? "items-end" : "items-start",
              )}
            >
              {message.replyToStory && (
                <p className="text-xs italic text-muted-foreground">Replying to your story</p>
              )}
              <div
                className={cn(
                  "max-w-[80%] rounded-lg px-3 py-2 text-sm",
                  message.direction === "outbound"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted",
                  message.status === "failed" && "border border-destructive",
                )}
              >
                {message.body ?? <span className="italic opacity-80">(no text)</span>}
                {message.attachmentType && (
                  <p className="mt-1 text-xs opacity-80">
                    {/*
                      Meta's attachment URLs expire, so this is a link
                      that may well be dead rather than a stored file —
                      said here instead of rendering a broken image. The
                      raw delivery is in webhook_events either way.
                    */}
                    Attachment ({message.attachmentType}){" "}
                    {message.attachmentUrl && (
                      <a href={message.attachmentUrl} target="_blank" rel="noreferrer" className="underline">
                        open — may have expired
                      </a>
                    )}
                  </p>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                {formatDateIST(message.sentAt, "d MMM, h:mm a")}
                {message.sentByName ? ` · ${message.sentByName}` : ""}
                {message.status === "queued" && " · sending…"}
                {message.status === "failed" && ` · not sent: ${message.errorMessage ?? "unknown error"}`}
              </p>
            </div>
          ))
        )}
        <div ref={bottom} />
      </div>

      {canSend ? (
        withinWindow ? (
          <form action={formAction} className="flex flex-col gap-2">
            <input type="hidden" name="conversationId" value={conversationId} />
            <Textarea name="body" rows={2} placeholder="Write a reply…" maxLength={1000} required />
            <FormMessage error={state.error} success={state.success} />
            <Button type="submit" disabled={pending} className="w-fit">
              {pending ? "Sending…" : "Send"}
            </Button>
          </form>
        ) : (
          <div className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
            <strong className="text-foreground">The 24-hour reply window has closed.</strong>{" "}
            Instagram only allows a free-form reply within 24 hours of the person&apos;s last
            message
            {lastInboundAt ? `, and theirs was ${formatDateIST(lastInboundAt, "d MMM, h:mm a")}` : ""}
            . Reply from the Instagram app instead — that is Meta&apos;s rule, not a limit of this
            CRM.
          </div>
        )
      ) : (
        <p className="text-sm text-muted-foreground">
          You can read this conversation but not reply to it.
        </p>
      )}
    </div>
  );
}
