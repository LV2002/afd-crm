import { and, eq, isNull, sql } from "drizzle-orm";

import { applyAssignment } from "@/lib/assignment/apply-assignment";
import { db } from "@/lib/db/client";
import { centers, enquiries, leadIdentifiers, leads, mergeReviewQueue, pipelineStages, profiles } from "@/lib/db/schema";
import { notify } from "@/lib/notifications/notify";
import { startFlows } from "@/lib/whatsapp/flow-runner";

import { normalizeEmail } from "./normalize-email";
import { consentOnEntry, consentOnRepeatEnquiry } from "@/lib/consent/consent";

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
  /**
   * The existing lead who sent them. Carried only onto a NEW lead: a
   * second enquiry from somebody already in the system does not get to
   * rewrite who introduced them, for the same reason first-touch source
   * is never overwritten.
   */
  referredByLeadId?: string | null;

  /**
   * Whoever is doing this, when a person is. Used only so a counsellor
   * creating a lead for themselves isn't told they have a new lead —
   * ingestion from a webhook or a cron has no actor and passes nothing.
   */
  actorId?: string | null;

  /**
   * Suppresses the per-lead "New lead arrived" notification.
   *
   * Set by the CSV import and nothing else. A two-hundred-row import
   * firing two hundred notifications at a centre head is not visibility,
   * it is a denial-of-service on the one person meant to be watching
   * intake — and the next real lead arrives underneath them. The import
   * sends one `lead.imported` summary instead, after the run.
   *
   * `lead.assigned` is NOT suppressed: that one goes to the counsellor
   * who now owns a specific person and has to ring them, which is worth
   * knowing however the lead got there.
   */
  suppressArrivalNotice?: boolean;
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
  const result = await resolveOrCreateLeadInTransaction(input);

  // Notified AFTER the transaction commits, never inside it. `db`'s pool is
  // max: 1 (see lib/db/client.ts), so a second connection opened while the
  // transaction still holds the first would deadlock — and a notification
  // about a lead that then fails to commit would be a lie besides.
  if (result.isNewLead) {
    await notifyLeadArrived(
      result.leadId,
      input.source,
      input.actorId ?? null,
      input.suppressArrivalNotice === true,
    );
    await startFlows("lead_created", { leadId: result.leadId });
  }

  return result;
}

/**
 * A lead just entered the system. Two different pieces of news.
 *
 * `lead.created` goes to whoever runs the place: intake is visible
 * whether or not a rule matched. `lead.assigned` goes to the counsellor
 * it landed on, and only exists when it landed on somebody.
 *
 * That split replaces a single early-return that said an unassigned lead
 * "has nobody to tell". The orphan queue does surface those, but only to
 * somebody who thinks to open it — so the highest-value lead of the week,
 * arriving at 9pm from a source no rule covers, was announced to nobody
 * at all. It is announced now, saying plainly that it is unassigned.
 *
 * Reads the committed row rather than threading the assignment back out
 * through two return branches: one small query on the create path, and it
 * cannot disagree with what was actually stored.
 */
async function notifyLeadArrived(
  leadId: string,
  source: string,
  actorId: string | null,
  suppressArrivalNotice: boolean,
): Promise<void> {
  const [row] = await db
    .select({
      assignedTo: leads.assignedTo,
      centerId: leads.centerId,
      studentName: leads.studentName,
      leadNumber: leads.leadNumber,
      centerName: centers.name,
      ownerName: profiles.fullName,
    })
    .from(leads)
    .leftJoin(centers, eq(centers.id, leads.centerId))
    .leftJoin(profiles, eq(profiles.id, leads.assignedTo))
    .where(eq(leads.id, leadId));

  if (!row) return;

  if (!suppressArrivalNotice) {
    await notify({
      eventKey: "lead.created",
      context: {
        lead_name: row.studentName,
        lead_number: row.leadNumber,
        source,
        // Said out loud rather than left blank. "Assigned to nobody yet"
        // is the whole reason a centre head would act on this one.
        owner_name: row.ownerName ?? "nobody yet",
        center_name: row.centerName,
      },
      href: `/leads/${leadId}`,
      entityType: "leads",
      entityId: leadId,
      centerId: row.centerId,
      ownerId: row.assignedTo,
      actorId,
    });
  }

  if (!row.assignedTo) return;

  await notify({
    eventKey: "lead.assigned",
    context: {
      lead_name: row.studentName,
      lead_number: row.leadNumber,
      source,
      center_name: row.centerName,
    },
    href: `/leads/${leadId}`,
    entityType: "leads",
    entityId: leadId,
    centerId: row.centerId,
    ownerId: row.assignedTo,
    actorId,
  });
}

/**
 * Every lead entering the system passes through here (CLAUDE.md
 * § Non-negotiables 8: one ingestion path), so this is the only place a
 * `lead_created` automation flow needs to be started from — webhook,
 * CSV import, manual entry and public form all arrive at the same line.
 *
 * `startFlows` swallows its own failures on purpose: an automation must
 * never be the reason a lead fails to be created.
 */

async function resolveOrCreateLeadInTransaction(
  input: ResolveLeadInput,
): Promise<ResolveLeadResult> {
  const normalizedPhone = normalizePhone(input.primaryPhone);
  if (!normalizedPhone) {
    throw new Error(`resolveOrCreateLead: could not normalise primary phone "${input.primaryPhone}"`);
  }
  const normalizedEmail = normalizeEmail(input.email);
  const receivedAt = input.receivedAt ?? new Date();

  return db.transaction(async (tx) => {
    /*
      Joined to `leads`, not read from `lead_identifiers` alone.

      Deleting a lead soft-deletes the lead and leaves its identifiers
      behind, so the dedup index went on pointing at a dead row. Entering
      that number again attached the new enquiry to the deleted lead and
      returned its id — and the caller redirected to a page that filters
      `deleted_at is null`, so creating a lead answered with a 404 and the
      enquiry was filed against a record no screen will ever show.

      A deleted lead is deleted. Somebody enquiring again gets a new lead,
      which is the only honest reading of both soft deletion and
      non-negotiable #2.
    */
    const phoneMatch = await tx
      .select({ leadId: leadIdentifiers.leadId })
      .from(leadIdentifiers)
      .innerJoin(leads, eq(leads.id, leadIdentifiers.leadId))
      .where(
        and(
          eq(leadIdentifiers.kind, "phone"),
          eq(leadIdentifiers.valueNormalised, normalizedPhone),
          isNull(leadIdentifiers.deletedAt),
          isNull(leads.deletedAt),
        ),
      )
      .limit(1);

    const emailMatch = normalizedEmail
      ? await tx
          .select({ leadId: leadIdentifiers.leadId })
          .from(leadIdentifiers)
          .innerJoin(leads, eq(leads.id, leadIdentifiers.leadId))
          .where(
            and(
              eq(leadIdentifiers.kind, "email"),
              eq(leadIdentifiers.valueNormalised, normalizedEmail),
              isNull(leadIdentifiers.deletedAt),
              isNull(leads.deletedAt),
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
      //
      // A fresh enquiry settles consent for anybody who never had it
      // recorded — a lead from before consent was captured, say. It
      // deliberately does NOT resurrect a withdrawn one: somebody who
      // said STOP and later asks for a prospectus has not re-subscribed
      // to marketing, and coming back in is not the moment to decide they
      // have. See lib/consent/consent.ts.
      const [existingConsent] = await tx
        .select({ consentStatus: leads.consentStatus })
        .from(leads)
        .where(eq(leads.id, resolvedLeadId));

      const consentUpdate = consentOnRepeatEnquiry(
        existingConsent?.consentStatus ?? null,
        input.source,
        receivedAt,
      );

      await tx
        .update(leads)
        .set({
          lastTouchSource: input.source,
          lastTouchSubSource: input.subSource ?? null,
          lastTouchCampaign: input.campaignId ?? null,
          lastActivityAt: receivedAt,
          ...(consentUpdate ?? {}),
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
        referredByLeadId: input.referredByLeadId ?? null,
        stageId: newStage?.id,
        firstTouchSource: input.source,
        firstTouchSubSource: input.subSource,
        firstTouchCampaign: input.campaignId,
        lastTouchSource: input.source,
        lastTouchSubSource: input.subSource,
        lastTouchCampaign: input.campaignId,
        lastActivityAt: receivedAt,
        // Entering the CRM IS the opt-in: everybody here enquired about a
        // course, and that enquiry is the consent. Recorded per lead with
        // a date and the source it came from, so "on what basis did we
        // message this person?" has an answer. See lib/consent/consent.ts.
        ...consentOnEntry(input.source, receivedAt),
      })
      .returning({ id: leads.id, leadNumber: leads.leadNumber });

    /*
      Release any identifier still held by a deleted lead before claiming
      it.

      The delete action does this itself, and migration 0091 caught up the
      rows that predate it. This is the backstop for every other way a
      lead can end up soft-deleted — a restore from archive, a merge, a
      hand-written fix — because the symptom is so bad: the match above
      correctly skips the deleted lead, and then the insert fails on
      `lead_identifiers_kind_value_uq` and takes the whole transaction
      with it. The number would be unusable for ever and the error would
      name an index rather than the problem.

      Scoped to identifiers whose lead is deleted. A value a live lead
      holds is never touched here — that is a genuine duplicate, and it
      was already resolved above.
    */
    await tx.execute(sql`
      update lead_identifiers i
         set deleted_at = now(), updated_at = now()
        from leads l
       where l.id = i.lead_id
         and l.deleted_at is not null
         and i.deleted_at is null
         and (
           (i.kind = 'phone' and i.value_normalised = ${normalizedPhone})
           ${normalizedEmail ? sql`or (i.kind = 'email' and i.value_normalised = ${normalizedEmail})` : sql``}
         )
    `);

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
