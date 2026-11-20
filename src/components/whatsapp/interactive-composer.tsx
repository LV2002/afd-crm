"use client";

import { Plus, X } from "lucide-react";
import { useState, useTransition } from "react";

import { FormMessage } from "@/components/layout/form-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { LIMITS } from "@/lib/whatsapp/interactive";
import {
  sendWhatsAppInteractive,
  type ReplyChannel,
  type WhatsAppSendState,
} from "@/lib/whatsapp/send-actions";

/**
 * Compose a message with tappable buttons (up to 3) or a list (up to 10).
 * The limits are Meta's; the server checks them again.
 */
export function InteractiveComposer({
  leadId,
  toPhone,
  channel,
}: {
  leadId: string | null;
  toPhone: string;
  channel: ReplyChannel;
}) {
  const [kind, setKind] = useState<"buttons" | "list">("buttons");
  const [body, setBody] = useState("");
  const [options, setOptions] = useState<string[]>(["", ""]);
  const [buttonText, setButtonText] = useState("Choose");
  const [state, setState] = useState<WhatsAppSendState>({});
  const [pending, startTransition] = useTransition();

  const max = kind === "buttons" ? LIMITS.maxButtons : LIMITS.maxListRows;
  const titleMax = kind === "buttons" ? LIMITS.buttonTitleChars : LIMITS.rowTitleChars;

  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          const filled = options.map((o) => o.trim()).filter(Boolean);
          const result = await sendWhatsAppInteractive(
            leadId,
            toPhone,
            kind === "buttons"
              ? { kind, body, buttons: filled }
              : { kind, body, buttonText, rows: filled.map((title) => ({ title })) },
            channel,
          );
          setState(result);
          if (!result.error) {
            setBody("");
            setOptions(["", ""]);
          }
        });
      }}
    >
      <div className="flex gap-1 text-xs">
        {(["buttons", "list"] as const).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => {
              setKind(k);
              setOptions((o) => o.slice(0, k === "buttons" ? LIMITS.maxButtons : LIMITS.maxListRows));
            }}
            className={`rounded-md border px-2 py-1 ${kind === k ? "bg-accent font-medium" : "text-muted-foreground"}`}
          >
            {k === "buttons" ? "Up to 3 buttons" : "A list of choices"}
          </button>
        ))}
      </div>
      <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={2} maxLength={LIMITS.bodyChars} placeholder="Which course are you interested in?" />
      {kind === "list" && (
        <Input value={buttonText} maxLength={LIMITS.listButtonChars} onChange={(e) => setButtonText(e.target.value)} className="h-9 w-48" aria-label="Text on the button that opens the list" />
      )}
      {options.map((option, index) => (
        <div key={index} className="flex gap-1">
          <Input
            value={option}
            maxLength={titleMax}
            className="h-9 w-64"
            placeholder={kind === "buttons" ? `Button ${index + 1}` : `Choice ${index + 1}`}
            onChange={(e) => setOptions((o) => o.map((v, i) => (i === index ? e.target.value : v)))}
          />
          {options.length > 1 && (
            <Button type="button" variant="ghost" size="sm" onClick={() => setOptions((o) => o.filter((_, i) => i !== index))} aria-label="Remove">
              <X className="size-4" />
            </Button>
          )}
        </div>
      ))}
      <div className="flex items-center gap-2">
        {options.length < max && (
          <Button type="button" variant="outline" size="sm" onClick={() => setOptions((o) => [...o, ""])}>
            <Plus className="size-4" /> Add
          </Button>
        )}
        <Button type="submit" disabled={pending || !body.trim() || options.every((o) => !o.trim())}>
          Send
        </Button>
      </div>
      <FormMessage error={state.error} success={state.success} />
    </form>
  );
}
