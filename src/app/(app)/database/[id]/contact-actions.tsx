"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import { moveContactsToLeads, removeContact } from "../actions";

export function ContactActions({
  contactId,
  hasPhone,
  linked,
  match,
  canPromote,
  canManage,
}: {
  contactId: string;
  hasPhone: boolean;
  linked: { leadId: string; leadNumber: number; how: string | null } | null;
  match: { leadId: string; leadNumber: number; counsellor: string | null } | null;
  canPromote: boolean;
  canManage: boolean;
}) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function promote() {
    startTransition(async () => {
      const out = await moveContactsToLeads([contactId]);
      const result = out.results?.[0]?.result;
      if (out.error) setMessage(out.error);
      else if (result && !result.ok) setMessage(result.error);
      else if (result?.ok) setMessage(result.warnings.join(" ") || (result.how === "moved" ? "Moved into the leads." : "Merged with the existing lead."));
      router.refresh();
    });
  }

  function remove() {
    if (!window.confirm("Remove this person from the database? They stay a lead if they already are one.")) return;
    startTransition(async () => {
      const out = await removeContact(contactId);
      if (out.error) setMessage(out.error);
      else router.push("/database");
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border p-4">
      {linked ? (
        <>
          <Badge variant="secondary">{linked.how === "merged" ? "Merged" : "Moved"} into Lead #{linked.leadNumber}</Badge>
          <Link href={`/leads/${linked.leadId}`} className="text-sm underline">
            Open the lead
          </Link>
          <span className="text-sm text-muted-foreground">They stay in the database too.</span>
        </>
      ) : match ? (
        <>
          <Badge variant="outline">Already a lead · #{match.leadNumber}</Badge>
          <span className="text-sm text-muted-foreground">
            {match.counsellor ? `With ${match.counsellor}. ` : "Unassigned. "}Merging adds this contact&apos;s details to that
            lead&apos;s blanks and links the two. Nothing the lead already has is overwritten.
          </span>
          {canPromote && hasPhone && (
            <Button size="sm" disabled={pending} onClick={promote}>
              Merge with the lead
            </Button>
          )}
        </>
      ) : (
        <>
          <span className="text-sm text-muted-foreground">Not a lead.</span>
          {canPromote && (
            <Button size="sm" disabled={pending || !hasPhone} onClick={promote}>
              Move to leads
            </Button>
          )}
          {!hasPhone && <span className="text-sm text-muted-foreground">Add a phone number first — a lead needs one.</span>}
        </>
      )}
      {canManage && (
        <Button size="sm" variant="ghost" className="ml-auto" disabled={pending} onClick={remove}>
          Remove from the database
        </Button>
      )}
      {message && <p className="basis-full text-sm text-muted-foreground">{message}</p>}
    </div>
  );
}
