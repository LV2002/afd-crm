"use client";

import { MessageCircle, Phone } from "lucide-react";
import Link from "next/link";

import { Input } from "@/components/ui/input";

/**
 * A phone number on the lead's own page: a text box, with the number in it.
 *
 * ## Why there is no longer a reveal step here
 *
 * There used to be one, and it was theatre. This page is a server
 * component that passes every field's value to the form, so the real
 * number was already in the page's HTML — the masking happened in the
 * browser, on a value the browser had been given. Anybody who could open
 * the lead could read the number out of the page source, and the button
 * only made the honest route slower.
 *
 * CLAUDE.md non-negotiable #6 says the same thing in its own words:
 * *masked in list view, **full on the detail page***. The list is where
 * bulk exposure lives and where the audited reveal belongs; a counsellor
 * looking at one lead they are working is not the threat that rule exists
 * for.
 *
 * So the number is simply here, in a box, editable. What changed with it
 * is that the masking for somebody **without** `lead.reveal_phone` is now
 * done on the server, before the value is sent — which is the first time
 * it has actually been masking anything.
 *
 * ## The two buttons
 *
 * **Call** is a `tel:` link, so it needs the real digits and only appears
 * for somebody who has them. **Chat** goes to the conversation inside the
 * CRM and carries no number at all, so it appears either way.
 */
export function PhoneField({
  leadId,
  name,
  value,
  canEdit,
  /** True when `value` is the real number rather than a masked stand-in. */
  isReal,
  /** Only on the fields where a conversation makes sense — the primary and WhatsApp numbers. */
  showChat,
}: {
  leadId: string;
  name: string;
  value: string | null;
  canEdit: boolean;
  isReal: boolean;
  showChat?: boolean;
}) {
  const chat = showChat ? (
    <Link
      href={`/whatsapp/personal?thread=${encodeURIComponent(`lead:${leadId}`)}`}
      className="inline-flex min-h-8 items-center gap-1 rounded-md border px-2 text-xs font-medium transition-colors hover:bg-accent"
    >
      <MessageCircle className="size-3.5" /> Chat
    </Link>
  ) : null;

  // No number at all. An empty box to put one in, or nothing to say.
  if (!value) {
    return canEdit ? (
      <Input name={name} defaultValue="" inputMode="tel" autoComplete="off" placeholder="+91…" />
    ) : (
      <span className="text-sm text-muted-foreground">—</span>
    );
  }

  // `tel:` wants no spaces. Built from the real value only — a dial link
  // made from "+91 98••••3456" rings a number that does not exist.
  const dialable = isReal ? value.replace(/[^\d+]/g, "") : null;

  return (
    <div className="flex flex-col gap-1.5">
      {canEdit && isReal ? (
        <Input name={name} defaultValue={value} inputMode="tel" autoComplete="off" />
      ) : (
        <span className="font-mono text-sm text-muted-foreground">{value}</span>
      )}

      {(dialable || chat) && (
        <span className="inline-flex flex-wrap items-center gap-1.5">
          {dialable && (
            <a
              href={`tel:${dialable}`}
              className="inline-flex min-h-8 items-center gap-1 rounded-md border px-2 text-xs font-medium transition-colors hover:bg-accent"
            >
              <Phone className="size-3.5" /> Call
            </a>
          )}
          {chat}
        </span>
      )}
    </div>
  );
}
