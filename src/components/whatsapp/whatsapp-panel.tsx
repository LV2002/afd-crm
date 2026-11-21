"use client";

import { Sparkles, StickyNote } from "lucide-react";
import { useMemo, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/layout/form-message";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { WhatsAppThreadMessage } from "@/lib/whatsapp/get-thread";
import type { InboxLabel, InboxNote, SavedReply } from "@/lib/whatsapp/inbox-tools";
import { matchSavedReplies, type SendableTemplate } from "@/lib/whatsapp/template-preview";

import { suggestWhatsAppReply } from "@/app/(app)/whatsapp/ai-actions";
import { addConversationNote } from "@/app/(app)/whatsapp/inbox-actions";
import { ConversationBar } from "@/components/whatsapp/conversation-bar";
import { MessageContent } from "@/components/whatsapp/message-content";
import { InteractiveComposer } from "@/components/whatsapp/interactive-composer";
import { MediaPicker } from "@/components/whatsapp/media-picker";
import { TemplateSender } from "@/components/whatsapp/template-sender";
import {
  sendWhatsAppMedia,
  sendWhatsAppMessage,
  type ReplyChannel,
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
        <MessageContent message={message} />
      </div>
      <p className="text-xs text-muted-foreground">
        {new Date(message.occurredAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
        {isOutbound && STATUS_LABEL[message.status] && ` · ${STATUS_LABEL[message.status]}`}
        {message.status === "failed" && message.errorMessage && ` — ${message.errorMessage}`}
      </p>
    </div>
  );
}

function NoteBubble({ note }: { note: InboxNote }) {
  return (
    <div className="flex flex-col gap-0.5 self-center">
      <div className="max-w-md rounded-lg border border-dashed border-amber-400 bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:bg-amber-950/30 dark:text-amber-100">
        <p className="mb-0.5 flex items-center gap-1 text-xs font-medium"><StickyNote className="size-3" /> Private note · only staff see this</p>
        <p className="whitespace-pre-wrap">{note.body}</p>
      </div>
      <p className="text-center text-xs text-muted-foreground">
        {note.authorName ?? "Staff"} · {new Date(note.createdAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
      </p>
    </div>
  );
}

/**
 * One conversation: what was said, private notes between the lines, and the
 * box to answer in. Typing a slash opens the saved replies; when the 24-hour
 * window has closed the box becomes the template picker.
 */
export function WhatsAppPanel({
  leadId,
  leadName = "",
  toPhone,
  messages,
  canSend,
  withinWindow,
  channel = "own",
  windowClosesAt = null,
  savedReplies = [],
  templates = [],
  canSendTemplates = false,
  labels = [],
  labelIds = [],
  resolved = false,
  notes = [],
  aiEnabled = false,
}: {
  leadId: string;
  leadName?: string;
  toPhone: string;
  messages: WhatsAppThreadMessage[];
  canSend: boolean;
  withinWindow: boolean;
  /** Which number a reply leaves from: the sender's own, or the institute's API number. */
  channel?: ReplyChannel;
  windowClosesAt?: string | null;
  savedReplies?: SavedReply[];
  templates?: SendableTemplate[];
  canSendTemplates?: boolean;
  labels?: InboxLabel[];
  labelIds?: string[];
  resolved?: boolean;
  notes?: InboxNote[];
  /** AI-drafted replies are on (admin switch + API key). */
  aiEnabled?: boolean;
}) {
  const [mode, setMode] = useState<"reply" | "buttons" | "note">("reply");
  const [body, setBody] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [state, setState] = useState<WhatsAppSendState>({});
  const [isPending, startTransition] = useTransition();

  const firstName = leadName.trim().split(/\s+/)[0] ?? "";
  // The slash menu is open while the box holds only "/something".
  const slash = mode === "reply" && /^\/\S*$/.test(body) ? body : null;
  const suggestions = useMemo(() => (slash === null ? [] : matchSavedReplies(savedReplies, slash).slice(0, 6)), [slash, savedReplies]);

  // Messages and notes in the order they happened.
  const timeline = useMemo(
    () => [
      ...messages.map((m) => ({ at: m.occurredAt, kind: "message" as const, m })),
      ...notes.map((n) => ({ at: n.createdAt, kind: "note" as const, n })),
    ].sort((a, b) => a.at.localeCompare(b.at)),
    [messages, notes],
  );

  if (messages.length === 0 && !canSend) return null;

  const insertReply = (reply: SavedReply) => {
    setBody(reply.body.replace(/\{\{\s*name\s*\}\}/gi, firstName || "there"));
  };

  return (
    <div className="flex flex-col gap-3 rounded-lg border p-4">
      <ConversationBar phone={toPhone} labels={labels} labelIds={labelIds} resolved={resolved} windowClosesAt={windowClosesAt} canEdit={canSend} />

      <div className="flex max-h-[28rem] flex-col gap-3 overflow-y-auto">
        {timeline.length === 0 ? (
          <p className="text-sm text-muted-foreground">No messages yet.</p>
        ) : (
          timeline.map((t) => (t.kind === "message" ? <MessageBubble key={t.m.id} message={t.m} /> : <NoteBubble key={t.n.id} note={t.n} />))
        )}
      </div>

      {canSend && (
        <>
          <div className="flex gap-1 text-sm" role="tablist">
            <button type="button" role="tab" aria-selected={mode === "reply"} onClick={() => setMode("reply")} className={cn("rounded-md px-3 py-1", mode === "reply" ? "bg-accent font-medium" : "text-muted-foreground hover:bg-accent/50")}>
              Reply
            </button>
            {withinWindow && (
              <button type="button" role="tab" aria-selected={mode === "buttons"} onClick={() => setMode("buttons")} className={cn("rounded-md px-3 py-1", mode === "buttons" ? "bg-accent font-medium" : "text-muted-foreground hover:bg-accent/50")}>
                Buttons &amp; lists
              </button>
            )}
            <button type="button" role="tab" aria-selected={mode === "note"} onClick={() => setMode("note")} className={cn("rounded-md px-3 py-1", mode === "note" ? "bg-amber-100 font-medium text-amber-950 dark:bg-amber-900/40 dark:text-amber-100" : "text-muted-foreground hover:bg-accent/50")}>
              Private note
            </button>
          </div>

          {mode === "note" ? (
            <form
              className="flex flex-col gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                startTransition(async () => {
                  const result = await addConversationNote(toPhone, leadId || null, body);
                  setState(result);
                  if (!result.error) setBody("");
                });
              }}
            >
              <Textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Write a note for your team. They won't see it on WhatsApp." rows={2} />
              <FormMessage error={state.error} success={state.success} />
              <Button type="submit" disabled={isPending || !body.trim()} className="w-fit" variant="outline">Save note</Button>
            </form>
          ) : mode === "buttons" && withinWindow ? (
            <InteractiveComposer leadId={leadId || null} toPhone={toPhone} channel={channel} />
          ) : withinWindow ? (
            <form
              className="flex flex-col gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                // The file was checked as it was chosen (MediaPicker), with the
                // same rule the Server Action applies.
                startTransition(async () => {
                  let result: WhatsAppSendState;
                  if (file) {
                    const formData = new FormData();
                    formData.append("file", file);
                    formData.append("caption", body);
                    result = await sendWhatsAppMedia(leadId, toPhone, formData, channel);
                  } else {
                    result = await sendWhatsAppMessage(leadId, toPhone, body, channel);
                  }
                  setState(result);
                  if (!result.error) {
                    setBody("");
                    setFile(null);
                  }
                });
              }}
            >
              {suggestions.length > 0 && (
                <ul className="max-h-48 overflow-y-auto rounded-md border bg-popover text-sm shadow-sm" role="listbox" aria-label="Saved replies">
                  {suggestions.map((r) => (
                    <li key={r.id}>
                      <button type="button" onClick={() => insertReply(r)} className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left hover:bg-accent">
                        <span className="font-medium">{r.title}{r.shortcut ? <span className="ml-2 font-normal text-muted-foreground">/{r.shortcut}</span> : null}</span>
                        <span className="line-clamp-1 text-xs text-muted-foreground">{r.body}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <div className="flex gap-2">
                <Textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder={file ? "Add a caption (optional)…" : savedReplies.length ? "Type a message, or / for saved replies…" : "Type a message…"}
                  className="min-h-10 flex-1"
                  rows={2}
                />
                <div className="flex flex-col gap-1 self-end">
                  {aiEnabled && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={isPending}
                      onClick={() =>
                        startTransition(async () => {
                          const result = await suggestWhatsAppReply(leadId || null, toPhone, firstName);
                          if (result.text) { setBody(result.text); setState({}); }
                          else setState({ error: result.error });
                        })
                      }
                    >
                      <Sparkles className="size-4" /> Suggest
                    </Button>
                  )}
                  <MediaPicker file={file} onChange={setFile} onError={(message) => setState(message ? { error: message } : {})} disabled={isPending} />
                  <Button type="submit" disabled={isPending || (!body.trim() && !file) || suggestions.length > 0}>
                    Send
                  </Button>
                </div>
              </div>
              <FormMessage error={state.error} success={state.success} />
            </form>
          ) : (
            <TemplateSender leadId={leadId} toPhone={toPhone} leadFirstName={firstName} templates={templates} allowed={canSendTemplates} />
          )}
        </>
      )}
    </div>
  );
}
