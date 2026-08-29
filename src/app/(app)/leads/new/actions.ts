"use server";

import { redirect } from "next/navigation";

import { can, getCurrentUser, scopeFor } from "@/lib/auth/session";
import { resolveOrCreateLead } from "@/lib/identity/resolve-or-create-lead";

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

  const studentName = formData.get("studentName");
  const primaryPhone = formData.get("primaryPhone");
  if (typeof studentName !== "string" || !studentName.trim()) {
    return { error: "Student name is required." };
  }
  if (typeof primaryPhone !== "string" || !primaryPhone.trim()) {
    return { error: "Primary phone is required." };
  }

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

  const interestedExams = formData.getAll("interestedExams").map(String).filter(Boolean);
  const coursesInterested = formData.getAll("coursesInterested").map(String).filter(Boolean);

  const result = await resolveOrCreateLead({
    studentName: studentName.trim(),
    primaryPhone: primaryPhone.trim(),
    email: (formData.get("email") as string) || null,
    fatherName: (formData.get("fatherName") as string) || null,
    city: (formData.get("city") as string) || null,
    district: (formData.get("district") as string) || null,
    state: (formData.get("state") as string) || null,
    examYear: (formData.get("examYear") as string) || null,
    interestedExams: interestedExams.length > 0 ? interestedExams : null,
    coursesInterested: coursesInterested.length > 0 ? coursesInterested : null,
    centerId,
    assignedTo,
    source: "Manual",
  }).catch((error: unknown) => ({ error: error instanceof Error ? error.message : "Could not create lead." }));

  if ("error" in result) {
    return { error: result.error };
  }

  redirect(`/leads/${result.leadId}`);
}
