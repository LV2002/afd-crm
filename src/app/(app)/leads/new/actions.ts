"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { can, getCurrentUser, scopeFor } from "@/lib/auth/session";
import {
  leadIsVisibleToCaller,
  SCOPE_VIOLATION_MESSAGE,
} from "@/lib/identity/assert-lead-visible";
import { resolveOrCreateLead } from "@/lib/identity/resolve-or-create-lead";
import { createClient } from "@/lib/supabase/server";

const optionalText = z.string().trim().max(200).optional().or(z.literal(""));

/**
 * What a person walking in or ringing up actually gives you. Everything
 * else about a lead is set later, from the edit page.
 */
const newLeadSchema = z.object({
  studentName: z.string().trim().min(1, "Student name is required.").max(200),
  primaryPhone: z.string().trim().min(1, "Primary phone is required.").max(32),
  // Not `.email()`: a counsellor typing what a caller spells out should not
  // be blocked at the door over a typo they can fix later. Length-capped
  // only; the edit form validates it properly.
  email: optionalText,
  fatherName: optionalText,
  city: optionalText,
  district: optionalText,
  state: optionalText,
  examYear: z
    .string()
    .trim()
    .regex(/^\d{4}$/, "Exam year should be a four-digit year, like 2027.")
    .optional()
    .or(z.literal("")),
});

export interface FormState {
  error?: string;
}

/**
 * The one place manual lead creation is allowed to happen (CLAUDE.md
 * non-negotiable #8: manual entry is one of the named ingestion paths,
 * and every path goes through resolveOrCreateLead()). That function runs
 * on the direct db client and bypasses RLS by design — see
 * docs/DECISIONS.md, Session 4 — so unlike every other mutation in this
 * app, RLS is NOT the backstop here. This action is the enforcement point
 * instead: it re-implements the same own/center/all scope semantics
 * `can_access_center()` would apply, before ever calling resolveOrCreateLead().
 */
export async function createLeadManually(_prevState: FormState, formData: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  if (!user) return { error: "Not signed in." };

  const scope = scopeFor(user, "lead.create");
  if (!can(user, "lead.create") || !scope) {
    return { error: "You don't have permission to create leads." };
  }

  // Zod at the boundary, per CLAUDE.md's conventions — this action used to
  // check two fields by hand and let everything else through as any string
  // (security audit 2026-09-15, finding #6). The caps are deliberately
  // generous: they exist to stop a megabyte of text reaching the database,
  // not to second-guess a Malayalam name or a long school title.
  const parsed = newLeadSchema.safeParse({
    studentName: formData.get("studentName"),
    primaryPhone: formData.get("primaryPhone"),
    email: formData.get("email"),
    fatherName: formData.get("fatherName"),
    city: formData.get("city"),
    district: formData.get("district"),
    state: formData.get("state"),
    examYear: formData.get("examYear"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const { studentName, primaryPhone } = parsed.data;

  // 'center' scope always shows the picker (lead-create-form.tsx) so a
  // centerId is required; 'own' scope hides it entirely (ownership already
  // comes from assignedTo below) so a centerId is optional there — but if
  // one is present anyway (e.g. a tampered request), it must still be one
  // of the caller's own centres, same check importLeads() applies per row.
  const centerId = (formData.get("centerId") as string) || null;
  if (scope === "center" && (!centerId || !user.centerIds.includes(centerId))) {
    return { error: "Choose one of your own centres." };
  }
  if (scope === "own" && centerId && !user.centerIds.includes(centerId)) {
    return { error: "Choose one of your own centres." };
  }

  // 'own' scope means "only leads assigned to me": force self-assignment
  // rather than trusting a hidden field, and skip the assignment engine
  // entirely (an explicit assignedTo is never overridden by a rule — see
  // resolveOrCreateLead). 'center'/'all' leave assignedTo unset so the
  // rules engine actually runs, same as every other ingestion path.
  const assignedTo = scope === "own" ? user.id : undefined;

  // Who sent them, when they say so at the door. A referral is worth
  // recording at the moment it is mentioned — asked for later, on the
  // edit page, nobody remembers. The picker only ever offers leads the
  // counsellor can already see, and the value is a uuid, so a bad one
  // simply fails the foreign key rather than corrupting anything.
  const referredByLeadIdRaw = formData.get("referredByLeadId");
  const referredByLeadId =
    typeof referredByLeadIdRaw === "string" && referredByLeadIdRaw.trim()
      ? referredByLeadIdRaw.trim()
      : null;

  const interestedExams = formData.getAll("interestedExams").map(String).filter(Boolean);
  const coursesInterested = formData.getAll("coursesInterested").map(String).filter(Boolean);

  const result = await resolveOrCreateLead({
    studentName,
    primaryPhone,
    email: parsed.data.email || null,
    fatherName: parsed.data.fatherName || null,
    city: parsed.data.city || null,
    district: parsed.data.district || null,
    state: parsed.data.state || null,
    examYear: parsed.data.examYear || null,
    interestedExams: interestedExams.length > 0 ? interestedExams : null,
    coursesInterested: coursesInterested.length > 0 ? coursesInterested : null,
    centerId,
    assignedTo,
    referredByLeadId,
    source: "Manual",
  }).catch((error: unknown) => ({ error: error instanceof Error ? error.message : "Could not create lead." }));

  if ("error" in result) {
    return { error: result.error };
  }

  // The seatbelt. resolveOrCreateLead wrote through the RLS-bypassing
  // client (it has to — see assert-lead-visible.ts), so the scope checks
  // above were the only thing enforcing centre boundaries. Read the lead
  // back as this user: if RLS will not show it to them, those checks
  // failed and somebody needs to know.
  const supabase = await createClient();
  const visible = await leadIsVisibleToCaller(supabase, {
    leadId: result.leadId,
    actorId: user.id,
    source: "createLeadManually",
    context: { scope, centerId },
  });
  if (!visible) return { error: SCOPE_VIOLATION_MESSAGE };

  redirect(`/leads/${result.leadId}`);
}
