"use client";

import { Paperclip } from "lucide-react";
import { useRef, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/layout/form-message";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { WhatsAppThreadMessage } from "@/lib/whatsapp/get-thread";

import { WHATSAPP_MEDIA_EXTENSIONS, validateWhatsAppMedia } from "@/lib/whatsapp/media";
import {
  sendWhatsAppMedia,
  sendWhatsAppMessage,
  sendWhatsAppTemplate,
  type WhatsAppSendState,
} from "@/lib/whatsapp/send-actions";

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
          <span className="flex flex-col gap-1">
            <span className="text-xs uppercase opacity-70">
              {/*
                Inbound media still has no preview — the bytes sit on
                Meta's servers behind the access token and downloading
                them is separate work. Outbound media we sent ourselves,
                so saying so is honest and useful; the caption is the
                part worth showing either way.
              */}
              {message.mediaMimeType?.split("/")[0] ?? "Media"}{" "}
              {isOutbound ? "sent" : "received — preview not yet available"}
            </span>
            {message.body && <span>{message.body}</span>}
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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
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
              const file = fileInputRef.current?.files?.[0] ?? null;

              // The same check the Server Action runs, so a 40 MB video is
              // refused here rather than after uploading it twice.
              if (file) {
                const invalid = validateWhatsAppMedia(file);
                if (invalid) {
                  setState({ error: invalid });
                  return;
                }
              }

              startTransition(async () => {
                let result: WhatsAppSendState;
                if (file) {
                  const formData = new FormData();
                  formData.append("file", file);
                  formData.append("caption", body);
                  result = await sendWhatsAppMedia(leadId, toPhone, formData);
                } else {
                  result = await sendWhatsAppMessage(leadId, toPhone, body);
                }
                setState(result);
                if (!result.error) {
                  setBody("");
                  setFileName(null);
                  if (fileInputRef.current) fileInputRef.current.value = "";
                }
              });
            }}
          >
            <div className="flex gap-2">
              <Textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder={fileName ? "Add a caption (optional)…" : "Type a message…"}
                className="min-h-10 flex-1"
                rows={2}
              />
              <div className="flex flex-col gap-1 self-end">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  aria-label="Attach a photo, video or PDF"
                >
                  <Paperclip className="size-4" />
                </Button>
                <Button type="submit" disabled={isPending || (!body.trim() && !fileName)}>
                  Send
                </Button>
              </div>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept={WHATSAPP_MEDIA_EXTENSIONS}
              className="hidden"
              onChange={(e) => {
                setState({});
                setFileName(e.target.files?.[0]?.name ?? null);
              }}
            />
            {fileName && (
              <p className="flex items-center gap-2 text-xs text-muted-foreground">
                <Paperclip className="size-3" />
                {fileName}
                <button
                  type="button"
                  className="underline"
                  onClick={() => {
                    setFileName(null);
                    if (fileInputRef.current) fileInputRef.current.value = "";
                  }}
                >
                  remove
                </button>
              </p>
            )}
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
