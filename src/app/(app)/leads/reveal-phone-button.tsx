"use client";

import { Eye, MessageCircle, Phone } from "lucide-react";
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
 * ## Why Call and WhatsApp appear only after revealing
 *
 * A counsellor on a phone revealed the number and then typed it into
 * their dialler by hand, digit by digit, dozens of times a day. There was
 * no `tel:` link anywhere in this CRM.
 *
 * The buttons cannot come first: a `tel:` link has to carry the real
 * number in its href, so rendering one unrevealed would put every number
 * on the page in plain HTML and make the masking decorative — exactly
 * what non-negotiable #6 exists to stop. Revealing is the audited moment,
 * and these sit on the other side of it.
 */
export function RevealPhoneButton({
  leadId,
  masked,
  canReveal,
}: {
  leadId: string;
  masked: string | null;
  canReveal: boolean;
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
    // `tel:` wants no spaces; `wa.me` wants no plus and no spaces.
    const dialable = revealed.value.replace(/[^\d+]/g, "");
    const whatsapp = dialable.replace(/\D/g, "");

    return (
      <span className="inline-flex flex-wrap items-center gap-1.5">
        <span className="font-mono text-sm">{revealed.value}</span>
        <a
          href={`tel:${dialable}`}
          className="inline-flex min-h-8 items-center gap-1 rounded-md border px-2 text-xs font-medium transition-colors hover:bg-accent"
        >
          <Phone className="size-3.5" /> Call
        </a>
        <a
          href={`https://wa.me/${whatsapp}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-8 items-center gap-1 rounded-md border px-2 text-xs font-medium transition-colors hover:bg-accent"
        >
          <MessageCircle className="size-3.5" /> WhatsApp
        </a>
      </span>
    );
  }

  if (!canReveal) {
    return <span className="font-mono text-sm text-muted-foreground">{maskPhone(masked)}</span>;
  }

  return (
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
  );
}
