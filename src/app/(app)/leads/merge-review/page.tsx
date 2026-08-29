import Link from "next/link";

import { AccessDenied } from "@/components/layout/access-denied";
import { can, getCurrentUser } from "@/lib/auth/session";
import { formatDateIST } from "@/lib/format/date";
import { maskPhone } from "@/lib/leads/mask-phone";
import { createClient } from "@/lib/supabase/server";

import { MergeReviewRow, type MergeReviewLeadData } from "./merge-review-row";

interface QueueRow {
  id: string;
  lead_id: string;
  candidate_lead_id: string;
  score: string | null;
  created_at: string;
}

/**
 * docs/02-BUILD-PHASES.md § Phase 2: "Merge review UI." `merge_review_queue`
 * has been populated since Session 4 by resolveOrCreateLead() whenever an
 * inbound enquiry's phone matches one lead but its email matches a
 * different one — never guessed automatically, always parked here for a
 * human. This is that human's screen.
 */
export default async function MergeReviewPage() {
  const user = await getCurrentUser();
  if (!user || !can(user, "lead.merge")) return <AccessDenied />;

  const supabase = await createClient();

  const { data: queueRows } = await supabase
    .from("merge_review_queue")
    .select("id, lead_id, candidate_lead_id, score, created_at")
    .eq("status", "pending")
    .order("created_at")
    .returns<QueueRow[]>();

  const leadIds = Array.from(
    new Set((queueRows ?? []).flatMap((r) => [r.lead_id, r.candidate_lead_id])),
  );

  const { data: leadRows } = await supabase
    .from("leads")
    .select(
      "id, lead_number, student_name, primary_phone, email, district, first_touch_source, created_at",
    )
    .in("id", leadIds.length > 0 ? leadIds : ["00000000-0000-0000-0000-000000000000"])
    .returns<Array<MergeReviewLeadData & { primary_phone: string }>>();

  const leadById = new Map((leadRows ?? []).map((row) => [row.id, row]));

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold">Merge review</h1>
        <p className="text-sm text-muted-foreground">
          An inbound enquiry&apos;s phone matched one lead while its email matched a different
          one — never merged automatically. Confirm if they&apos;re the same person, or reject
          if it&apos;s a coincidence (e.g. a shared family email).
        </p>
      </div>

      {(queueRows ?? []).length === 0 ? (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          Nothing waiting for review.
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          {(queueRows ?? []).map((row) => {
            const lead = leadById.get(row.lead_id);
            const candidate = leadById.get(row.candidate_lead_id);
            if (!lead || !candidate) return null;
            return (
              <MergeReviewRow
                key={row.id}
                queueId={row.id}
                lead={lead}
                candidate={candidate}
                maskedLeadPhone={maskPhone(lead.primary_phone)}
                maskedCandidatePhone={maskPhone(candidate.primary_phone)}
                createdAtLabel={formatDateIST(row.created_at, "d MMM yyyy, h:mm a")}
                score={row.score}
              />
            );
          })}
        </div>
      )}

      <Link href="/leads" className="text-sm text-muted-foreground hover:underline">
        ← Back to leads
      </Link>
    </div>
  );
}
