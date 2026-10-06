"use client";

import { Eye, MessageCircle, Phone } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";

import { Input } from "@/components/ui/input";
import { maskPhone } from "@/lib/leads/mask-phone";

import { revealLeadPhone } from "../actions";

/**
 * A phone number on the lead edit form: masked, then revealed, then
 * editable.
 *
 * Until now every field of type `phone` rendered as a reveal button and
 * nothing else, and `updateLead` skipped them on save — so no number on a
 * lead could be corrected. A counsellor who took down one digit wrong had
 * to delete the lead and enter it again, and an alternate or parent
 * number could be captured at intake and never afterwards.
 *
 * ## Why editing waits for the reveal
 *
 * The number starts masked (non-negotiable #6). Rendering an input
 * straight away would mean either putting the real number in the HTML of
 * every lead page — which makes the masking decorative — or offering a
 * box that overwrites a value its user cannot see. Revealing is the
 * audited moment, and editing lives on the other side of it, which is the
 * same shape the list's reveal button already has.
 *
 * ## Why an unrevealed field submits nothing
 *
 * No input is rendered until the reveal, so the field is absent from the
 * form data, and `parseFieldValue` returns `NOT_PROVIDED` for an absent
 * field — which `updateLead` skips. Saving a form without touching the
 * numbers therefore leaves them exactly as they were. That is the whole
 * safety property, and it comes from the absence rather than from a
 * sentinel value somebody has to remember to handle.
 */
export function PhoneField({
  leadId,
  name,
  masked,
  canReveal,
  canEdit,
  /** The lead's own id, for the Chats link. Omitted on fields that are not a WhatsApp number. */
  chatHref,
}: {
  leadId: string;
  name: string;
  masked: string | null;
  canReveal: boolean;
  canEdit: boolean;
  chatHref?: string;
}) {
  const [revealed, setRevealed] = useState<{ value: string; real: boolean } | null>(null);
  const [isPending, startTransition] = useTransition();

  const actions = chatHref ? (
    <Link
      href={chatHref}
      className="inline-flex min-h-8 items-center gap-1 rounded-md border px-2 text-xs font-medium transition-colors hover:bg-accent"
    >
      <MessageCircle className="size-3.5" /> Chat
    </Link>
  ) : null;

  if (revealed?.real) {
    const dialable = revealed.value.replace(/[^\d+]/g, "");
    return (
      <div className="flex flex-col gap-1.5">
        {canEdit ? (
          <Input name={name} defaultValue={revealed.value} inputMode="tel" autoComplete="off" />
        ) : (
          <span className="font-mono text-sm">{revealed.value}</span>
        )}
        <span className="inline-flex flex-wrap items-center gap-1.5">
          <a
            href={`tel:${dialable}`}
            className="inline-flex min-h-8 items-center gap-1 rounded-md border px-2 text-xs font-medium transition-colors hover:bg-accent"
          >
            <Phone className="size-3.5" /> Call
          </a>
          {actions}
        </span>
      </div>
    );
  }

  // A refused reveal falls back to the masked string. No dial link is
  // built from it — "+91 98••••3456" is a call to a number that does not
  // exist — and no input either, for the same reason.
  if (revealed && !revealed.real) {
    return <span className="font-mono text-sm text-muted-foreground">{revealed.value}</span>;
  }

  return (
    <div className="flex flex-col gap-1.5">
      {canReveal ? (
        <button
          type="button"
          className="inline-flex min-h-8 w-fit items-center gap-1 font-mono text-sm text-muted-foreground hover:text-foreground"
          disabled={isPending}
          onClick={() =>
            startTransition(async () => {
              const result = await revealLeadPhone(leadId);
              const value = phoneFor(name, result as unknown as Record<string, unknown>);
              setRevealed(
                value ? { value, real: true } : { value: maskPhone(masked), real: false },
              );
            })
          }
        >
          {maskPhone(masked)}
          <Eye className="size-3.5" />
          {canEdit && <span className="text-xs">reveal to edit</span>}
        </button>
      ) : (
        <span className="font-mono text-sm text-muted-foreground">{maskPhone(masked)}</span>
      )}
      {/* Needs no number of its own: it goes to the thread inside this CRM. */}
      {actions && <span className="inline-flex items-center gap-1.5">{actions}</span>}
    </div>
  );
}

/**
 * Which number the reveal came back with.
 *
 * `revealLeadPhone` returns the lead's numbers together — one audited
 * read rather than one per field — so each field picks out its own.
 * An unknown key returns null and the field falls back to masked, which
 * is the right answer for a custom phone field the action does not know
 * about.
 */
function phoneFor(name: string, result: Record<string, unknown>): string | null {
  const value = result[camel(name)] ?? result[name];
  return typeof value === "string" && value ? value : null;
}

function camel(key: string): string {
  return key.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
}
