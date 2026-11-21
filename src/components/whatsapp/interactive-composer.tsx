"use client";

import { Plus, X } from "lucide-react";
import { useState, useTransition } from "react";

import { FormMessage } from "@/components/layout/form-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { listCourseChoices } from "@/app/(app)/whatsapp/inbox-actions";
import { LIMITS } from "@/lib/whatsapp/interactive";
import {
  sendWhatsAppForm,
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
  forms = [],
}: {
  leadId: string | null;
  toPhone: string;
  channel: ReplyChannel;
  /** Published native forms that can be sent. */
  forms?: Array<{ id: string; name: string }>;
}) {
  const [kind, setKind] = useState<"buttons" | "list">("buttons");
  const [body, setBody] = useState("");
  const [options, setOptions] = useState<string[]>(["", ""]);
  const [buttonText, setButtonText] = useState("Choose");
  const [state, setState] = useState<WhatsAppSendState>({});
  const [pending, startTransition] = useTransition();
  const [formId, setFormId] = useState("");

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
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-fit"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await listCourseChoices();
            if (result.error) return setState({ error: result.error });
            setKind("list");
            setButtonText("Our courses");
            setBody((b) => b.trim() || "Which course would you like to know about?");
            setOptions(result.titles);
            setState({});
          })
        }
      >
        Fill with our courses
      </Button>
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
      {forms.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-t pt-2">
          <select value={formId} onChange={(e) => setFormId(e.target.value)} className="h-9 rounded-md border bg-background px-2 text-sm" aria-label="Form to send">
            <option value="">Send a form instead…</option>
            {forms.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={pending || !formId}
            onClick={() => startTransition(async () => { setState(await sendWhatsAppForm(leadId, toPhone, formId, channel)); setFormId(""); })}
          >
            Send form
          </Button>
        </div>
      )}
      <FormMessage error={state.error} success={state.success} />
    </form>
  );
}
