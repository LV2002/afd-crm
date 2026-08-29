"use client";

import Link from "next/link";
import { useState, useTransition } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";

import { confirmMerge, rejectMerge } from "./actions";

export interface MergeReviewLeadData {
  id: string;
  lead_number: number;
  student_name: string;
  email: string | null;
  district: string | null;
  first_touch_source: string | null;
  created_at: string;
}

function LeadCard({
  title,
  lead,
  maskedPhone,
}: {
  title: string;
  lead: MergeReviewLeadData;
  maskedPhone: string;
}) {
  return (
    <div className="flex flex-1 flex-col gap-1 rounded-lg border p-3">
      <p className="text-xs font-medium uppercase text-muted-foreground">{title}</p>
      <Link href={`/leads/${lead.id}`} className="font-medium hover:underline">
        {lead.student_name}
      </Link>
      <p className="font-mono text-sm text-muted-foreground">{maskedPhone}</p>
      <p className="text-sm text-muted-foreground">{lead.email ?? "—"}</p>
      <p className="text-xs text-muted-foreground">
        {[lead.district, lead.first_touch_source].filter(Boolean).join(" · ") || "—"}
      </p>
    </div>
  );
}

export function MergeReviewRow({
  queueId,
  lead,
  candidate,
  maskedLeadPhone,
  maskedCandidatePhone,
  createdAtLabel,
  score,
}: {
  queueId: string;
  lead: MergeReviewLeadData;
  candidate: MergeReviewLeadData;
  maskedLeadPhone: string;
  maskedCandidatePhone: string;
  createdAtLabel: string;
  score: string | null;
}) {
  const [reason, setReason] = useState("");
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">Flagged {createdAtLabel}</p>
        {score && <Badge variant="outline">match score {Number(score).toFixed(0)}</Badge>}
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-col gap-3 sm:flex-row">
          <LeadCard title="Kept (phone match)" lead={lead} maskedPhone={maskedLeadPhone} />
          <LeadCard title="Candidate (email match)" lead={candidate} maskedPhone={maskedCandidatePhone} />
        </div>

        <Textarea
          placeholder="Optional note — why you confirmed or rejected this"
          rows={2}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />

        {message && <p className="text-sm text-muted-foreground">{message}</p>}

        <div className="flex gap-2">
          <Button
            size="sm"
            disabled={isPending}
            onClick={() =>
              startTransition(async () => {
                const result = await confirmMerge(queueId, reason);
                setMessage(result.error ?? "Merged.");
              })
            }
          >
            Confirm — same person, merge
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={isPending}
            onClick={() =>
              startTransition(async () => {
                const result = await rejectMerge(queueId, reason);
                setMessage(result.error ?? "Rejected — kept as two separate leads.");
              })
            }
          >
            Reject — different people
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
