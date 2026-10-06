"use client";

import { Eye, MessageCircle, Phone } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";

import { maskPhone } from "@/lib/leads/mask-phone";

import { revealLeadPhone } from "./actions";

/**
 * Masked by default; clicking reveals the real number via an audited
 * server action. `canReveal` comes from the server component's own
 * session check (lead.reveal_phone) — a user without it gets a plain
 * masked span with no click affordance at all, not a button that would
 * just deny the action.
 *
 * ## Call waits for the reveal; Chat does not
 *
 * A counsellor on a phone revealed the number and then typed it into
 * their dialler by hand, digit by digit, dozens of times a day. There was
 * no `tel:` link anywhere in this CRM.
 *
 * `tel:` has to carry the real number in its href, so rendering one
 * unrevealed would put every number on the page in plain HTML and make
 * the masking decorative — exactly what non-negotiable #6 exists to stop.
 * Revealing is the audited moment and Call sits on the other side of it.
 *
 * **Chat does not, because it carries no number at all.** It used to:
 * a `wa.me` link, which needed the digits, opened WhatsApp Web in a new
 * tab and took the counsellor out of the CRM — so whatever they said next
 * happened somewhere this system has no record of, on the institute's
 * highest-volume channel. It now points at the conversation inside Chats,
 * which is a lead id in a URL and nothing more. That makes it both safer
 * and available straight away, which is the rare case where those two
 * pull the same way.
 */
export function RevealPhoneButton({
  leadId,
  masked,
  canReveal,
  /**
   * Whether to offer the Chats link. False where it would be noise — the
   * same lead rendered twice on one screen does not need two of them.
   */
  canChat = true,
}: {
  leadId: string;
  masked: string | null;
  canReveal: boolean;
  canChat?: boolean;
}) {
  /*
    `real` matters: a refused reveal falls back to the masked string, and
    a dial link built from "+91 98••••3456" is a call to a number that
    does not exist. Only a genuine number gets the buttons.
  */
  const [revealed, setRevealed] = useState<{ value: string; real: boolean } | null>(null);
  const [isPending, startTransition] = useTransition();

  if (revealed !== null && !revealed.real) {
    return <span className="font-mono text-sm text-muted-foreground">{revealed.value}</span>;
  }

  if (revealed !== null) {
    const dialable = revealed.value.replace(/[^\d+]/g, ""); // `tel:` wants no spaces.

    return (
      <span className="inline-flex flex-wrap items-center gap-1.5">
        <span className="font-mono text-sm">{revealed.value}</span>
        <a
          href={`tel:${dialable}`}
          className="inline-flex min-h-8 items-center gap-1 rounded-md border px-2 text-xs font-medium transition-colors hover:bg-accent"
        >
          <Phone className="size-3.5" /> Call
        </a>
        <ChatLink leadId={leadId} />
      </span>
    );
  }

  if (!canReveal) {
    return (
      <span className="inline-flex flex-wrap items-center gap-1.5">
        <span className="font-mono text-sm text-muted-foreground">{maskPhone(masked)}</span>
        {canChat && <ChatLink leadId={leadId} />}
      </span>
    );
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
    <button
      type="button"
      className="inline-flex min-h-8 items-center gap-1 font-mono text-sm text-muted-foreground hover:text-foreground"
      disabled={isPending}
      onClick={() =>
        startTransition(async () => {
          const result = await revealLeadPhone(leadId);
          setRevealed(
            result.primaryPhone
              ? { value: result.primaryPhone, real: true }
              : { value: maskPhone(masked), real: false },
          );
        })
      }
    >
      {maskPhone(masked)}
      <Eye className="size-3.5" />
    </button>
      {canChat && <ChatLink leadId={leadId} />}
    </span>
  );
}

/**
 * The conversation, inside this CRM.
 *
 * `lead:<id>` is the thread key the inbox builds for a matched
 * conversation (`get-threads.ts`), so this lands on the right thread
 * without the caller knowing anything about phone numbers.
 */
function ChatLink({ leadId }: { leadId: string }) {
  return (
    <Link
      href={`/whatsapp?thread=${encodeURIComponent(`lead:${leadId}`)}`}
      className="inline-flex min-h-8 items-center gap-1 rounded-md border px-2 text-xs font-medium transition-colors hover:bg-accent"
    >
      <MessageCircle className="size-3.5" /> Chat
    </Link>
  );
}
