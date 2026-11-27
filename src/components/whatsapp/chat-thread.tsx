"use client";

import { AlertCircle, Check, CheckCheck, Clock, StickyNote } from "lucide-react";
import * as React from "react";

import { MessageContent } from "@/components/whatsapp/message-content";
import { formatDateIST } from "@/lib/format/date";
import type { WhatsAppThreadMessage } from "@/lib/whatsapp/get-thread";
import type { InboxNote } from "@/lib/whatsapp/inbox-tools";
import { cn } from "@/lib/utils";

/**
 * A conversation drawn the way WhatsApp draws it, so the team already knows
 * how to read it: a patterned background, green bubbles for what we sent and
 * white ones for what they sent, the time and delivery ticks inside each
 * bubble, a day header between days, and WhatsApp's own notices (somebody
 * changed their number) as small centred labels.
 */
function Ticks({ status }: { status: WhatsAppThreadMessage["status"] }) {
  if (status === "queued") return <Clock className="size-3" aria-label="Sending" />;
  if (status === "failed") return <AlertCircle className="size-3.5 text-red-500" aria-label="Failed" />;
  if (status === "sent") return <Check className="size-3.5" aria-label="Sent" />;
  if (status === "delivered") return <CheckCheck className="size-3.5" aria-label="Delivered" />;
  if (status === "read") return <CheckCheck className="size-3.5 text-[#53bdeb]" aria-label="Read" />;
  return null;
}

function dayLabel(iso: string, now: Date): string {
  const key = formatDateIST(iso, "yyyy-MM-dd");
  if (key === formatDateIST(now, "yyyy-MM-dd")) return "Today";
  if (key === formatDateIST(new Date(now.getTime() - 86_400_000), "yyyy-MM-dd")) return "Yesterday";
  return formatDateIST(iso, "d MMMM yyyy");
}

function Pill({ children, tone = "day" }: { children: React.ReactNode; tone?: "day" | "notice" }) {
  return (
    <div className="my-1 flex justify-center">
      <span
        className={cn(
          "max-w-[85%] rounded-lg px-3 py-1 text-center text-xs shadow-sm",
          tone === "day"
            ? "bg-white/90 text-[#54656f] dark:bg-[#182229] dark:text-[#8696a0]"
            : "bg-[#fff5c4] text-[#54656f] dark:bg-[#182229] dark:text-[#ffd279]",
        )}
      >
        {children}
      </span>
    </div>
  );
}

function Bubble({ message }: { message: WhatsAppThreadMessage }) {
  const out = message.direction === "outbound";
  return (
    <div className={cn("flex", out ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "relative max-w-[82%] rounded-lg px-2.5 pb-1 pt-1.5 text-[0.9375rem] leading-snug shadow-[0_1px_0.5px_rgba(11,20,26,0.13)]",
          out
            ? "rounded-tr-none bg-[#d9fdd3] text-[#111b21] dark:bg-[#005c4b] dark:text-[#e9edef]"
            : "rounded-tl-none bg-white text-[#111b21] dark:bg-[#202c33] dark:text-[#e9edef]",
        )}
      >
        <MessageContent message={message} />
        <span className="float-right ml-3 mt-1 flex items-center gap-1 text-[0.6875rem] leading-none text-[#667781] dark:text-[#8696a0]">
          {formatDateIST(message.occurredAt, "h:mm a")}
          {out && <Ticks status={message.status} />}
        </span>
        {message.status === "failed" && message.errorMessage && (
          <p className="clear-both pt-1 text-xs text-red-600 dark:text-red-400">{message.errorMessage}</p>
        )}
      </div>
    </div>
  );
}

function NoteBubble({ note }: { note: InboxNote }) {
  return (
    <div className="my-1 flex justify-center">
      <div className="max-w-md rounded-lg border border-dashed border-amber-400 bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:bg-amber-950/40 dark:text-amber-100">
        <p className="mb-0.5 flex items-center gap-1 text-xs font-medium">
          <StickyNote className="size-3" /> Private note · only staff see this
        </p>
        <p className="whitespace-pre-wrap">{note.body}</p>
        <p className="mt-1 text-[0.6875rem] opacity-70">
          {note.authorName ?? "Staff"} · {formatDateIST(note.createdAt, "d MMM, h:mm a")}
        </p>
      </div>
    </div>
  );
}

export function ChatThread({
  messages,
  notes = [],
  className,
}: {
  messages: WhatsAppThreadMessage[];
  notes?: InboxNote[];
  className?: string;
}) {
  const scroller = React.useRef<HTMLDivElement>(null);
  const now = React.useMemo(() => new Date(), []);

  const items = React.useMemo(
    () =>
      [
        ...messages.map((m) => ({ at: m.occurredAt, kind: "message" as const, m })),
        ...notes.map((n) => ({ at: n.createdAt, kind: "note" as const, n })),
      ].sort((a, b) => a.at.localeCompare(b.at)),
    [messages, notes],
  );

  // Opens at the newest message, like WhatsApp.
  React.useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [items.length]);

  let lastDay = "";
  return (
    <div
      ref={scroller}
      className={cn(
        "flex max-h-[34rem] min-h-72 flex-col gap-1 overflow-y-auto rounded-lg bg-[#efeae2] p-3 dark:bg-[#0b141a]",
        // A faint pattern, so the chat reads as a chat and not a plain grey box.
        "bg-[radial-gradient(rgba(11,20,26,0.04)_1px,transparent_1px)] [background-size:18px_18px] dark:bg-[radial-gradient(rgba(255,255,255,0.03)_1px,transparent_1px)]",
        className,
      )}
    >
      {items.length === 0 && <Pill>No messages yet</Pill>}
      {items.map((item) => {
        const day = formatDateIST(item.at, "yyyy-MM-dd");
        const header = day !== lastDay ? <Pill key={`day-${day}`}>{dayLabel(item.at, now)}</Pill> : null;
        lastDay = day;
        if (item.kind === "note") {
          return (
            <React.Fragment key={`n-${item.n.id}`}>
              {header}
              <NoteBubble note={item.n} />
            </React.Fragment>
          );
        }
        const m = item.m;
        return (
          <React.Fragment key={m.id}>
            {header}
            {m.messageType === "system" ? <Pill tone="notice">{m.body ?? "WhatsApp system notice"}</Pill> : <Bubble message={m} />}
          </React.Fragment>
        );
      })}
    </div>
  );
}
