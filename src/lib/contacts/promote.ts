import { and, asc, eq, isNull } from "drizzle-orm";
import type { SupabaseClient } from "@supabase/supabase-js";

import { writeAuditLog } from "@/lib/audit/log";
import { scopeFor, type SessionUser } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { contactListMembers, contactLists, contacts } from "@/lib/db/schema";
import { fieldColumn } from "@/lib/fields/field-column";
import { getFieldSchema, type FieldSchemaEntry } from "@/lib/fields/get-field-schema";
import { resolveOrCreateLead, type ResolveLeadInput } from "@/lib/identity/resolve-or-create-lead";
import { writeExtraFields } from "@/lib/leads/write-extra-fields";

import { isBlank } from "./fields";

export type PromoteResult =
  | {
      ok: true;
      how: "moved" | "merged";
      leadId: string;
      leadNumber: number;
      /** Things that could not be carried across, in words for the person who pressed the button. */
      warnings: string[];
    }
  | { ok: false; error: string };

/** The source on a lead created from a contact whose list names none. */
const FALLBACK_SOURCE = "Contact database";

/**
 * Turns a contact into a lead, or merges it into the lead it already is.
 *
 * Both go through `resolveOrCreateLead()`, which is what makes "Move" and
 * "Merge" two faces of one operation rather than two code paths: if the phone
 * or email already belongs to a lead, the contact's details are attached to
 * that lead as one more enquiry (first-touch source untouched, nobody
 * reassigned, no duplicate made); if not, a new lead is created, assigned by
 * the same rules as every other lead. Non-negotiable #8: no source gets a
 * shortcut, and a database is a source.
 *
 * What happens to the contact afterwards is the point of the design: **it
 * stays**. It is linked to the lead (`lead_id`, `linked_how`) and the list
 * goes on showing it, marked as a lead, so a seminar list can still say how
 * many of its people responded.
 *
 * Merging fills the lead's BLANK details from the contact and never
 * overwrites one that is there: the lead's own details are what somebody
 * actually said to a counsellor.
 */
export async function promoteContact(
  contactId: string,
  actor: SessionUser,
  supabase: SupabaseClient,
): Promise<PromoteResult> {
  const [contact] = await db
    .select()
    .from(contacts)
    .where(and(eq(contacts.id, contactId), isNull(contacts.deletedAt)));
  if (!contact) return { ok: false, error: "That contact no longer exists." };
  if (contact.leadId) return { ok: false, error: "That contact has already been moved into the leads." };
  if (!contact.phone) {
    return {
      ok: false,
      error: "A lead needs a phone number, and this contact only has an email. Add a phone number first.",
    };
  }

  // The earliest list the person appeared on is where they first came from.
  const [origin] = await db
    .select({ name: contactLists.name, source: contactLists.source })
    .from(contactListMembers)
    .innerJoin(contactLists, eq(contactLists.id, contactListMembers.listId))
    .where(eq(contactListMembers.contactId, contactId))
    .orderBy(asc(contactListMembers.addedAt))
    .limit(1);

  const schema = await getFieldSchema(supabase, "lead", actor);
  const fieldByKey = new Map(schema.map((f) => [f.key, f]));

  const values: Record<string, unknown> = {
    ...contact.fields,
    student_name: contact.name,
    primary_phone: contact.phone,
    email: contact.email,
  };
  const text = (key: string) => (typeof values[key] === "string" && values[key] ? (values[key] as string) : null);
  const list = (key: string) => (Array.isArray(values[key]) ? (values[key] as string[]) : null);

  const input: ResolveLeadInput = {
    studentName: contact.name,
    primaryPhone: contact.phone,
    email: contact.email,
    fatherName: text("father_name"),
    city: text("city"),
    district: text("district"),
    state: text("state"),
    examYear: text("exam_year"),
    interestedExams: list("interested_exams"),
    coursesInterested: list("courses_interested"),
    centerId: text("center_id"),
    // A role that may only see its own leads gets the lead it creates.
    assignedTo: scopeFor(actor, "lead.create") === "own" ? actor.id : undefined,
    actorId: actor.id,
    source: origin?.source ?? FALLBACK_SOURCE,
    subSource: origin?.name ?? null,
    // The same contact cannot be turned into two enquiries.
    dedupeKey: `contact:${contact.id}`,
    raw: { contactId: contact.id, list: origin?.name ?? null },
  };

  let outcome;
  try {
    outcome = await resolveOrCreateLead(input);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not create the lead." };
  }

  const warnings: string[] = [];
  if (outcome.isNewLead) {
    warnings.push(...(await writeExtraFields(supabase, outcome.leadId, values, fieldByKey, new Map())));
  } else {
    warnings.push(...(await fillBlanks(supabase, outcome.leadId, values, fieldByKey)));
  }

  const how = outcome.isNewLead ? "moved" : "merged";
  await db
    .update(contacts)
    .set({ leadId: outcome.leadId, linkedAt: new Date(), linkedBy: actor.id, linkedHow: how, updatedAt: new Date() })
    .where(eq(contacts.id, contact.id));

  await writeAuditLog(supabase, {
    actorId: actor.id,
    action: how === "moved" ? "contact.move_to_lead" : "contact.merge_into_lead",
    entityType: "contacts",
    entityId: contact.id,
    after: { leadId: outcome.leadId, leadNumber: outcome.leadNumber, list: origin?.name ?? null },
  });

  return { ok: true, how, leadId: outcome.leadId, leadNumber: outcome.leadNumber, warnings };
}

/**
 * Fills the details an existing lead is missing, and only those.
 *
 * Through the caller's own RLS-bound client, so a counsellor who may not see
 * another counsellor's lead cannot write into it by way of a merge; they get
 * a note instead, and the contact is still linked.
 */
async function fillBlanks(
  supabase: SupabaseClient,
  leadId: string,
  values: Record<string, unknown>,
  fieldByKey: Map<string, FieldSchemaEntry>,
): Promise<string[]> {
  const { data: lead } = await supabase.from("leads").select("*").eq("id", leadId).is("deleted_at", null).maybeSingle();
  if (!lead) {
    return ["Linked, but the lead belongs to another counsellor, so its details were not changed."];
  }

  const patch = blankFillPatch(lead, values, fieldByKey);
  if (Object.keys(patch).length === 0) return [];
  const { error } = await supabase.from("leads").update(patch).eq("id", leadId);
  return error ? [`Some details could not be added to the lead: ${error.message}`] : [];
}

/**
 * What an existing lead is missing that a contact can supply.
 *
 * Identity and source are never part of it: name and phone are what the lead
 * was created with, and attribution belongs to ingestion, so a merge cannot
 * rewrite who somebody is or where they came from. Pure, so it is tested
 * without a database.
 */
export function blankFillPatch(
  lead: Record<string, unknown>,
  values: Record<string, unknown>,
  fieldByKey: Map<string, Pick<FieldSchemaEntry, "key" | "isCore">>,
): Record<string, unknown> {
  const core: Record<string, unknown> = {};
  const custom: Record<string, unknown> = { ...((lead.custom as Record<string, unknown> | null) ?? {}) };
  let customChanged = false;
  const SKIP = new Set(["student_name", "primary_phone", "lead_source", "sub_source"]);

  for (const [key, value] of Object.entries(values)) {
    if (SKIP.has(key) || isBlank(value)) continue;
    const field = fieldByKey.get(key);
    if (!field) continue;
    if (field.isCore) {
      const column = fieldColumn(key);
      if (isBlank(lead[column])) core[column] = value;
    } else if (isBlank(custom[key])) {
      custom[key] = value;
      customChanged = true;
    }
  }
  return customChanged ? { ...core, custom } : core;
}
