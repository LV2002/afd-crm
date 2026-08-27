import { and, eq, isNull } from "drizzle-orm";

import { applyAssignment } from "@/lib/assignment/apply-assignment";
import { db } from "@/lib/db/client";
import { enquiries, leadIdentifiers, leads, mergeReviewQueue, pipelineStages } from "@/lib/db/schema";

import { normalizeEmail } from "./normalize-email";
import { normalizePhone } from "./normalize-phone";

export interface ResolveLeadInput {
  studentName: string;
  primaryPhone: string;
  email?: string | null;

  // Enquiry attribution
  source: string;
  subSource?: string | null;
  campaignId?: string | null;
  adsetId?: string | null;
  adId?: string | null;
  utm?: Record<string, unknown> | null;
  gclid?: string | null;
  fbclid?: string | null;
  raw?: Record<string, unknown> | null;
  dedupeKey?: string | null;
  ingestBatchId?: string | null;
  receivedAt?: Date;

  // Carried onto a newly-created lead only — ignored when attaching to an
  // existing one, since a lead's profile fields belong to the person, not
  // to any one enquiry.
  fatherName?: string | null;
  city?: string | null;
  district?: string | null;
  state?: string | null;
  examYear?: string | null;
  interestedExams?: string[] | null;
  coursesInterested?: string[] | null;
  centerId?: string | null;
  assignedTo?: string | null;
}

export interface ResolveLeadResult {
  leadId: string;
  leadNumber: number;
  isNewLead: boolean;
  enquiryId: string;
  wasDuplicate: boolean;
  mergeReviewQueueId: string | null;
}

/**
 * The one entry point allowed to create a lead (CLAUDE.md non-negotiable
 * #8 — one ingestion path, then applyAssignment(), no exceptions). Never
 * rejects a duplicate (non-negotiable #2): a repeat phone number always
 * gets a new `enquiries` row on the existing `leads` row, never a dropped
 * submission and never a second lead.
 *
 * Not wired to a real ingestion path yet — webhooks are Phase 2 and will
 * call this under the service-role client (per CLAUDE.md non-negotiable
 * #3); manual/UI-triggered creation will call it under the caller's
 * RLS-bound session once that UI exists (Session 6+). Until there's a real
 * caller to decide that for, this runs against the direct db client, same
 * as the seed script. See docs/DECISIONS.md.
 */
export async function resolveOrCreateLead(input: ResolveLeadInput): Promise<ResolveLeadResult> {
  const normalizedPhone = normalizePhone(input.primaryPhone);
  if (!normalizedPhone) {
    throw new Error(`resolveOrCreateLead: could not normalise primary phone "${input.primaryPhone}"`);
  }
  const normalizedEmail = normalizeEmail(input.email);
  const receivedAt = input.receivedAt ?? new Date();

  return db.transaction(async (tx) => {
    const phoneMatch = await tx
      .select({ leadId: leadIdentifiers.leadId })
      .from(leadIdentifiers)
      .where(
        and(
          eq(leadIdentifiers.kind, "phone"),
          eq(leadIdentifiers.valueNormalised, normalizedPhone),
          isNull(leadIdentifiers.deletedAt),
        ),
      )
      .limit(1);

    const emailMatch = normalizedEmail
      ? await tx
          .select({ leadId: leadIdentifiers.leadId })
          .from(leadIdentifiers)
          .where(
            and(
              eq(leadIdentifiers.kind, "email"),
              eq(leadIdentifiers.valueNormalised, normalizedEmail),
              isNull(leadIdentifiers.deletedAt),
            ),
          )
          .limit(1)
      : [];

    const phoneLeadId = phoneMatch[0]?.leadId ?? null;
    const emailLeadId = emailMatch[0]?.leadId ?? null;

    let mergeReviewQueueId: string | null = null;

    // Phone matches one lead, email matches a *different* one — don't
    // guess which is right. Attach to the phone match (the identifier
    // every lead is guaranteed to have) and flag the pair for review.
    if (phoneLeadId && emailLeadId && phoneLeadId !== emailLeadId) {
      const existingReview = await tx
        .select({ id: mergeReviewQueue.id })
        .from(mergeReviewQueue)
        .where(
          and(
            eq(mergeReviewQueue.leadId, phoneLeadId),
            eq(mergeReviewQueue.candidateLeadId, emailLeadId),
            eq(mergeReviewQueue.status, "pending"),
          ),
        )
        .limit(1);

      if (existingReview[0]) {
        mergeReviewQueueId = existingReview[0].id;
      } else {
        const [review] = await tx
          .insert(mergeReviewQueue)
          .values({
            leadId: phoneLeadId,
            candidateLeadId: emailLeadId,
            score: "50.00",
          })
          .returning({ id: mergeReviewQueue.id });
        mergeReviewQueueId = review.id;
      }
    }

    const resolvedLeadId = phoneLeadId ?? emailLeadId;

    if (resolvedLeadId) {
      // Existing lead: attach a new enquiry, update last-touch, never
      // touch first-touch.
      await tx
        .update(leads)
        .set({
          lastTouchSource: input.source,
          lastTouchSubSource: input.subSource ?? null,
          lastTouchCampaign: input.campaignId ?? null,
          lastActivityAt: receivedAt,
        })
        .where(eq(leads.id, resolvedLeadId));

      // Progressively enrich identifiers: register whichever of
      // phone/email wasn't already the match key, as long as it isn't
      // already claimed by a *different* lead (that case was already
      // routed to merge_review_queue above).
      if (!phoneLeadId) {
        await tx
          .insert(leadIdentifiers)
          .values({ leadId: resolvedLeadId, kind: "phone", valueNormalised: normalizedPhone })
          .onConflictDoNothing();
      }
      if (normalizedEmail && !emailLeadId) {
        await tx
          .insert(leadIdentifiers)
          .values({ leadId: resolvedLeadId, kind: "email", valueNormalised: normalizedEmail })
          .onConflictDoNothing();
      }

      const [enquiry] = await tx
        .insert(enquiries)
        .values({
          leadId: resolvedLeadId,
          source: input.source,
          subSource: input.subSource,
          campaignId: input.campaignId,
          adsetId: input.adsetId,
          adId: input.adId,
          utm: input.utm,
          gclid: input.gclid,
          fbclid: input.fbclid,
          receivedAt,
          raw: input.raw,
          dedupeKey: input.dedupeKey,
          wasDuplicate: true,
          ingestBatchId: input.ingestBatchId,
        })
        .returning({ id: enquiries.id });

      const [leadRow] = await tx
        .select({ leadNumber: leads.leadNumber })
        .from(leads)
        .where(eq(leads.id, resolvedLeadId));

      return {
        leadId: resolvedLeadId,
        leadNumber: leadRow.leadNumber,
        isNewLead: false,
        enquiryId: enquiry.id,
        wasDuplicate: true,
        mergeReviewQueueId,
      };
    }

    // No match anywhere — a genuinely new person. Default to the pipeline's
    // stage_type='new' stage so it lands somewhere real in the funnel.
    const [newStage] = await tx
      .select({ id: pipelineStages.id })
      .from(pipelineStages)
      .where(and(eq(pipelineStages.stageType, "new"), eq(pipelineStages.isActive, true)))
      .orderBy(pipelineStages.sortOrder)
      .limit(1);

    const [lead] = await tx
      .insert(leads)
      .values({
        studentName: input.studentName,
        fatherName: input.fatherName,
        primaryPhone: normalizedPhone,
        email: normalizedEmail,
        city: input.city,
        district: input.district,
        state: input.state,
        examYear: input.examYear,
        interestedExams: input.interestedExams,
        coursesInterested: input.coursesInterested,
        centerId: input.centerId,
        assignedTo: input.assignedTo,
        stageId: newStage?.id,
        firstTouchSource: input.source,
        firstTouchSubSource: input.subSource,
        firstTouchCampaign: input.campaignId,
        lastTouchSource: input.source,
        lastTouchSubSource: input.subSource,
        lastTouchCampaign: input.campaignId,
        lastActivityAt: receivedAt,
      })
      .returning({ id: leads.id, leadNumber: leads.leadNumber });

    await tx
      .insert(leadIdentifiers)
      .values({ leadId: lead.id, kind: "phone", valueNormalised: normalizedPhone, isPrimary: true });

    if (normalizedEmail) {
      await tx
        .insert(leadIdentifiers)
        .values({ leadId: lead.id, kind: "email", valueNormalised: normalizedEmail });
    }

    // Non-negotiable #8: every lead goes through resolveOrCreateLead() then
    // applyAssignment() — no source gets a shortcut. Skipped only when the
    // caller already made an explicit assignment (e.g. a counsellor
    // manually creating a lead for themselves); that choice is respected,
    // not overridden by a rule.
    if (!input.assignedTo) {
      await applyAssignment(tx, lead.id, { trigger: "create" });
    }

    const [enquiry] = await tx
      .insert(enquiries)
      .values({
        leadId: lead.id,
        source: input.source,
        subSource: input.subSource,
        campaignId: input.campaignId,
        adsetId: input.adsetId,
        adId: input.adId,
        utm: input.utm,
        gclid: input.gclid,
        fbclid: input.fbclid,
        receivedAt,
        raw: input.raw,
        dedupeKey: input.dedupeKey,
        wasDuplicate: false,
        ingestBatchId: input.ingestBatchId,
      })
      .returning({ id: enquiries.id });

    return {
      leadId: lead.id,
      leadNumber: lead.leadNumber,
      isNewLead: true,
      enquiryId: enquiry.id,
      wasDuplicate: false,
      mergeReviewQueueId: null,
    };
  });
}
