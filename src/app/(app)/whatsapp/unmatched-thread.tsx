"use client";

import { useActionState, useState, useTransition } from "react";

import { FormMessage } from "@/components/layout/form-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { WhatsAppThreadMessage } from "@/lib/whatsapp/get-thread";
import { sendWhatsAppMessage, type WhatsAppSendState } from "@/lib/whatsapp/send-actions";

import { convertWhatsAppThreadToLead, type WhatsAppConvertState } from "./actions";

/**
 * A conversation with somebody the CRM has never heard of.
 *
 * This used to be read-only on purpose: a reply had to be recorded
 * against a lead, and the system does not invent leads from campaign
 * replies. The result on screen was a person asking a question and no box
 * to answer them in — the rule was right and the consequence was not.
 *
 * So it now works the way the Instagram inbox has worked since
 * DECISIONS 2026-10-04. Answer first. Decide whether it is an enquiry
 * afterwards, when you know. Migration 0090 is what lets the reply be
 * stored with no lead on it.
 *
 * **Text only, deliberately.** No attachments and no templates. A
 * template send is billed and counts against the number's quality rating,
 * which is why it is gated on `whatsapp.campaign` with a lead to record
 * it against; and an unmatched thread exists at all because somebody just
 * wrote to us, so the 24-hour window is open and free-form is allowed.
 * When it closes, the honest answer is the same one the rest of the CRM
 * gives: use the WhatsApp Business app on your phone.
 */

const initialConvert: WhatsAppConvertState = {};

export function UnmatchedThread({
  phone,
  messages,
  canSend,
  canCreateLead,
  withinWindow,
}: {
  phone: string;
  messages: WhatsAppThreadMessage[];
  canSend: boolean;
  canCreateLead: boolean;
  withinWindow: boolean;
}) {
  const [body, setBody] = useState("");
  const [sendState, setSendState] = useState<WhatsAppSendState>({});
  const [isSending, startSending] = useTransition();
  const [showConvert, setShowConvert] = useState(false);
  const [convertState, convertAction, converting] = useActionState(
    convertWhatsAppThreadToLead,
    initialConvert,
  );

  return (
    <div className="flex flex-col gap-4 rounded-lg border p-4">
      <div className="rounded-md border border-dashed p-3">
        <p className="text-sm font-medium">{phone} isn&apos;t in the CRM.</p>
        <p className="mt-1 text-sm text-muted-foreground">
          You can answer them from here. Make them a lead once it turns into a real enquiry —
          until then nobody is assigned and this conversation belongs to whoever is reading it.
        </p>
        {canCreateLead && !showConvert && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={() => setShowConvert(true)}
          >
            Convert to lead
          </Button>
        )}
      </div>

      {canCreateLead && showConvert && (
        <form action={convertAction} className="flex flex-col gap-3 rounded-md border p-3">
          <input type="hidden" name="phone" value={phone} />
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="studentName">Name</Label>
            <Input id="studentName" name="studentName" required autoFocus />
            <p className="text-xs text-muted-foreground">
              {phone} is carried over, and so is everything said above — the messages move onto
              the lead rather than staying here. If this number is already somebody in the CRM,
              they are linked rather than duplicated, and your assignment rules pick the
              counsellor.
            </p>
          </div>
          <FormMessage error={convertState.error} success={convertState.success} />
          <div className="flex gap-2">
            <Button type="submit" disabled={converting} className="w-fit">
              {converting ? "Creating…" : "Create the lead"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="w-fit"
              onClick={() => setShowConvert(false)}
            >
              Cancel
            </Button>
          </div>
        </form>
      )}

      <div className="flex max-h-96 flex-col gap-3 overflow-y-auto">
        {messages.map((message) => (
          <div
            key={message.id}
            className={cn(
              "flex flex-col gap-0.5",
              message.direction === "outbound" ? "items-end" : "items-start",
            )}
          >
            <div
              className={cn(
                "max-w-[80%] rounded-lg px-3 py-2 text-sm",
                message.direction === "outbound"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted",
              )}
            >
              {message.body ?? <span className="italic opacity-80">(no text)</span>}
            </div>
            <p className="text-xs text-muted-foreground">
              {new Date(message.occurredAt).toLocaleString("en-IN", {
                dateStyle: "medium",
                timeStyle: "short",
              })}
              {message.status === "failed" && message.errorMessage
                ? ` — ${message.errorMessage}`
                : ""}
            </p>
          </div>
        ))}
      </div>

      {canSend &&
        (withinWindow ? (
          <form
            className="flex flex-col gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              startSending(async () => {
                const result = await sendWhatsAppMessage(null, phone, body);
                setSendState(result);
                if (!result.error) setBody("");
              });
            }}
          >
            <div className="flex gap-2">
              <Textarea
                value={body}
                onChange={(event) => setBody(event.target.value)}
                placeholder="Type a message…"
                className="min-h-10 flex-1"
                rows={2}
              />
              <Button type="submit" disabled={isSending || !body.trim()} className="self-end">
                Send
              </Button>
            </div>
            <FormMessage error={sendState.error} success={sendState.success} />
          </form>
        ) : (
          <p className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
            They haven&apos;t messaged in the last 24 hours, so WhatsApp won&apos;t accept a
            reply from here. Message them from the WhatsApp Business app on your phone — the
            window reopens the moment they write back.
          </p>
        ))}
    </div>
  );
}
