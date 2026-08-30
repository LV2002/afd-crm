"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/layout/form-message";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { WhatsAppThreadMessage } from "@/lib/whatsapp/get-thread";

import { sendWhatsAppMessage, sendWhatsAppTemplate, type WhatsAppSendState } from "./whatsapp-actions";

const STATUS_LABEL: Record<WhatsAppThreadMessage["status"], string> = {
  queued: "Sending…",
  sent: "Sent",
  delivered: "Delivered",
  read: "Read",
  failed: "Failed",
  received: "",
};

function MessageBubble({ message }: { message: WhatsAppThreadMessage }) {
  const isOutbound = message.direction === "outbound";
  return (
    <div className={cn("flex flex-col gap-0.5", isOutbound ? "items-end" : "items-start")}>
      <div
        className={cn(
          "max-w-[80%] rounded-lg px-3 py-2 text-sm",
          isOutbound ? "bg-primary text-primary-foreground" : "bg-muted",
        )}
      >
        {message.messageType === "media" ? (
          <span className="italic opacity-80">
            {message.mediaMimeType?.split("/")[0] ?? "Media"} attachment received — preview not yet available.
          </span>
        ) : message.messageType === "template" ? (
          <span>
            <span className="text-xs uppercase opacity-70">Template: {message.templateName}</span>
          </span>
        ) : (
          message.body
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        {new Date(message.occurredAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
        {isOutbound && STATUS_LABEL[message.status] && ` · ${STATUS_LABEL[message.status]}`}
        {message.status === "failed" && message.errorMessage && ` — ${message.errorMessage}`}
      </p>
    </div>
  );
}

export function WhatsAppPanel({
  leadId,
  toPhone,
  messages,
  canSend,
  withinWindow,
}: {
  leadId: string;
  toPhone: string;
  messages: WhatsAppThreadMessage[];
  canSend: boolean;
  withinWindow: boolean;
}) {
  const [body, setBody] = useState("");
  const [templateName, setTemplateName] = useState("");
  const [languageCode, setLanguageCode] = useState("en_US");
  const [bodyParam, setBodyParam] = useState("");
  const [state, setState] = useState<WhatsAppSendState>({});
  const [isPending, startTransition] = useTransition();

  if (messages.length === 0 && !canSend) return null;

  return (
    <div className="flex flex-col gap-3 rounded-lg border p-4">
      <h2 className="text-lg font-semibold">WhatsApp</h2>

      <div className="flex max-h-96 flex-col gap-3 overflow-y-auto">
        {messages.length === 0 ? (
          <p className="text-sm text-muted-foreground">No messages yet.</p>
        ) : (
          messages.map((m) => <MessageBubble key={m.id} message={m} />)
        )}
      </div>

      {canSend &&
        (withinWindow ? (
          <form
            className="flex flex-col gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              startTransition(async () => {
                const result = await sendWhatsAppMessage(leadId, toPhone, body);
                setState(result);
                if (!result.error) setBody("");
              });
            }}
          >
            <div className="flex gap-2">
              <Textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Type a message…"
                className="min-h-10 flex-1"
                rows={2}
              />
              <Button type="submit" disabled={isPending || !body.trim()} className="self-end">
                Send
              </Button>
            </div>
            <FormMessage error={state.error} success={state.success} />
          </form>
        ) : (
          <form
            className="flex flex-col gap-2 rounded-md bg-muted/50 p-3"
            onSubmit={(e) => {
              e.preventDefault();
              startTransition(async () => {
                const result = await sendWhatsAppTemplate(leadId, toPhone, templateName, languageCode, bodyParam);
                setState(result);
                if (!result.error) setTemplateName("");
              });
            }}
          >
            <p className="text-xs text-muted-foreground">
              This lead hasn&apos;t messaged in the last 24 hours — send an approved template to reopen the conversation.
            </p>
            <div className="flex flex-wrap gap-2">
              <Input
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                placeholder="Template name"
                className="w-40"
              />
              <Input
                value={languageCode}
                onChange={(e) => setLanguageCode(e.target.value)}
                placeholder="Language code"
                className="w-28"
              />
              <Input
                value={bodyParam}
                onChange={(e) => setBodyParam(e.target.value)}
                placeholder="{{1}} value (optional)"
                className="w-48"
              />
              <Button type="submit" disabled={isPending || !templateName.trim()}>
                Send template
              </Button>
            </div>
            <FormMessage error={state.error} success={state.success} />
          </form>
        ))}
    </div>
  );
}
