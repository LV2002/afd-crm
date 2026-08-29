"use client";

import Link from "next/link";
import { useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { RevealPhoneButton } from "../reveal-phone-button";
import { assignOrphanLead } from "./actions";

export interface OrphanLeadData {
  id: string;
  student_name: string;
  primary_phone: string;
  first_touch_source: string | null;
  center_id: string | null;
  created_at: string;
}

export function OrphanRow({
  lead,
  maskedPhone,
  canRevealPhone,
  centerName,
  createdAtLabel,
  assignableUsers,
  currentUserId,
}: {
  lead: OrphanLeadData;
  maskedPhone: string;
  canRevealPhone: boolean;
  centerName?: string;
  createdAtLabel: string;
  assignableUsers: Array<{ id: string; fullName: string }>;
  /** Only set (and the "Claim" button only shown) when the viewer themselves is one of assignableUsers — claiming only makes sense for someone who can actually work this centre's leads. */
  currentUserId: string | null;
}) {
  const [isPending, startTransition] = useTransition();

  function assign(userId: string) {
    startTransition(async () => {
      await assignOrphanLead(lead.id, userId);
    });
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 p-4">
      <div className="flex flex-col gap-1">
        <Link href={`/leads/${lead.id}`} className="font-medium hover:underline">
          {lead.student_name}
        </Link>
        <p className="text-xs text-muted-foreground">
          {[centerName, lead.first_touch_source, createdAtLabel].filter(Boolean).join(" · ") || "—"}
        </p>
      </div>
      <div className="flex items-center gap-3">
        <RevealPhoneButton leadId={lead.id} masked={maskedPhone} canReveal={canRevealPhone} />
        {assignableUsers.length === 0 ? (
          <p className="text-xs text-muted-foreground">No counsellors at this centre yet.</p>
        ) : (
          <Select disabled={isPending} onValueChange={assign}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Assign to…" />
            </SelectTrigger>
            <SelectContent>
              {assignableUsers.map((u) => (
                <SelectItem key={u.id} value={u.id}>
                  {u.fullName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {currentUserId && (
          <Button size="sm" variant="outline" disabled={isPending} onClick={() => assign(currentUserId)}>
            Claim
          </Button>
        )}
      </div>
    </div>
  );
}
