"use server";

import { randomBytes } from "node:crypto";

import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { writeAuditLog } from "@/lib/audit/log";
import { can, getCurrentUser, scopeFor } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { leads } from "@/lib/db/schema";
import { createClient } from "@/lib/supabase/server";

export interface ProfileFormState {
  error?: string;
  success?: string;
}

/**
 * 32 CSPRNG bytes. The token is the only thing protecting a form bound to
 * one real student's record, so it must be unguessable — never derived
 * from the lead id, which is in URLs the counsellor already has open.
 */
function mintToken(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * Creates (or returns) this lead's student profile form link.
 *
 * One token per lead, minted on demand rather than for every lead at
 * creation: the form only goes out once sales have confirmed the student
 * is joining, and a link that exists for every enquiry is a link that can
 * leak for people who never enrolled.
 *
 * Idempotent. Pressing the button twice returns the same link, because the
 * counsellor may already have sent the first one — regenerating would
 * silently break a link sitting in a student's WhatsApp.
 */
export async function createProfileFormLink(
  _prev: ProfileFormState,
  formData: FormData,
): Promise<ProfileFormState> {
  const user = await getCurrentUser();
  if (!user || !can(user, "lead.update")) {
    return { error: "You don't have permission to do that." };
  }

  const leadId = formData.get("leadId");
  if (typeof leadId !== "string") return { error: "Missing lead reference." };

  const [lead] = await db
    .select({
      id: leads.id,
      centerId: leads.centerId,
      assignedTo: leads.assignedTo,
      profileFormToken: leads.profileFormToken,
    })
    .from(leads)
    .where(and(eq(leads.id, leadId), isNull(leads.deletedAt)));
  if (!lead) return { error: "Lead not found." };

  // Direct db client bypasses RLS, so re-implement the scope check here.
  const scope = scopeFor(user, "lead.update");
  if (scope === "own" && lead.assignedTo !== user.id) {
    return { error: "That lead isn't assigned to you." };
  }
  if (scope === "center" && (!lead.centerId || !user.centerIds.includes(lead.centerId))) {
    return { error: "That lead isn't in your centre." };
  }

  if (lead.profileFormToken) {
    return { success: "Link ready." };
  }

  const token = mintToken();
  await db
    .update(leads)
    .set({ profileFormToken: token, profileFormSentAt: new Date(), updatedAt: new Date() })
    .where(eq(leads.id, leadId));

  const supabase = await createClient();
  await writeAuditLog(supabase, {
    actorId: user.id,
    action: "lead.profile_form_link_created",
    entityType: "leads",
    entityId: leadId,
  });

  revalidatePath(`/leads/${leadId}`);
  return { success: "Link created." };
}

/**
 * Cancels a profile form link that has not been used.
 *
 * "Fill it in within a week" is how the link goes out; when the week passes
 * and nothing has come back, the counsellor needs to be able to make that
 * link dead rather than leave it live in a WhatsApp thread forever. The token
 * is cleared, so the old address stops working at once (it reads "Form not
 * found"), and the panel offers "Create profile form link" again — which
 * mints a fresh, different token if the student does come back.
 *
 * Only for a form nobody has submitted. Once answers are in they are the
 * student's record, and there is no link left to cancel.
 */
export async function cancelProfileFormLink(
  _prev: ProfileFormState,
  formData: FormData,
): Promise<ProfileFormState> {
  const user = await getCurrentUser();
  if (!user || !can(user, "lead.update")) {
    return { error: "You don't have permission to do that." };
  }

  const leadId = formData.get("leadId");
  if (typeof leadId !== "string") return { error: "Missing lead reference." };

  const [lead] = await db
    .select({
      id: leads.id,
      centerId: leads.centerId,
      assignedTo: leads.assignedTo,
      profileFormToken: leads.profileFormToken,
      profileFormSubmittedAt: leads.profileFormSubmittedAt,
    })
    .from(leads)
    .where(and(eq(leads.id, leadId), isNull(leads.deletedAt)));
  if (!lead) return { error: "Lead not found." };

  const scope = scopeFor(user, "lead.update");
  if (scope === "own" && lead.assignedTo !== user.id) {
    return { error: "That lead isn't assigned to you." };
  }
  if (scope === "center" && (!lead.centerId || !user.centerIds.includes(lead.centerId))) {
    return { error: "That lead isn't in your centre." };
  }

  if (lead.profileFormSubmittedAt) {
    return { error: "This form has already been submitted, so there is no open link to cancel." };
  }
  if (!lead.profileFormToken) return { success: "There is no link to cancel." };

  await db
    .update(leads)
    .set({ profileFormToken: null, profileFormSentAt: null, updatedAt: new Date() })
    .where(eq(leads.id, leadId));

  const supabase = await createClient();
  await writeAuditLog(supabase, {
    actorId: user.id,
    action: "lead.profile_form_link_cancelled",
    entityType: "leads",
    entityId: leadId,
  });

  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/profile-forms");
  return { success: "Link cancelled. The old address no longer works." };
}
