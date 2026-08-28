"use client";

import { Eye } from "lucide-react";
import { useState, useTransition } from "react";

import { maskPhone } from "@/lib/leads/mask-phone";

import { revealLeadPhone } from "./actions";

/**
 * Masked by default; clicking reveals the real number via an audited
 * server action. `canReveal` comes from the server component's own
 * session check (lead.reveal_phone) — a user without it gets a plain
 * masked span with no click affordance at all, not a button that would
 * just deny the action.
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
  const [revealed, setRevealed] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (revealed !== null) {
    return <span className="font-mono text-sm">{revealed}</span>;
  }

  if (!canReveal) {
    return <span className="font-mono text-sm text-muted-foreground">{maskPhone(masked)}</span>;
  }

  return (
    <button
      type="button"
      className="inline-flex items-center gap-1 font-mono text-sm text-muted-foreground hover:text-foreground"
      disabled={isPending}
      onClick={() =>
        startTransition(async () => {
          const result = await revealLeadPhone(leadId);
          setRevealed(result.primaryPhone ? result.primaryPhone : maskPhone(masked));
        })
      }
    >
      {maskPhone(masked)}
      <Eye className="size-3.5" />
    </button>
  );
}
