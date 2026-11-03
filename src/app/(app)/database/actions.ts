"use server";

import { and, eq, inArray, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { writeAuditLog } from "@/lib/audit/log";
import { can, getCurrentUser } from "@/lib/auth/session";
import { contactFields, splitContactValues } from "@/lib/contacts/fields";
import { parseContactForm } from "@/lib/contacts/form";
import { leadStateFor } from "@/lib/contacts/lead-matches";
import { promoteContact, type PromoteResult } from "@/lib/contacts/promote";
import { saveContact } from "@/lib/contacts/save";
import { db } from "@/lib/db/client";
import { contactLists, contacts } from "@/lib/db/schema";
import { getFieldSchema, type FieldSchemaEntry } from "@/lib/fields/get-field-schema";
import { OPTION_BEARING_TYPES, resolveFieldOptions, type FieldOption } from "@/lib/fields/resolve-field-options";
import { normalizeEmail } from "@/lib/identity/normalize-email";
import { normalizePhone } from "@/lib/identity/normalize-phone";
import { coerceImportValue } from "@/lib/leads/coerce-import-value";
import { createClient } from "@/lib/supabase/server";

export interface DatabaseFormState {
  error?: string;
  success?: string;
  /** Set after adding a contact, so the form can point at it. */
  contactId?: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** One request's worth. The wizard sends a larger file as several of these. */
const MAX_ROWS_PER_CALL = 1000;
const MAX_PROMOTE_PER_CALL = 100;

async function optionsFor(
  supabase: Awaited<ReturnType<typeof createClient>>,
  fields: FieldSchemaEntry[],
): Promise<Record<string, FieldOption[]>> {
  const entries = await Promise.all(
    fields
      .filter((f) => OPTION_BEARING_TYPES.has(f.type))
      .map(async (f) => [f.key, await resolveFieldOptions(supabase, f)] as const),
  );
  return Object.fromEntries(entries);
}

function revalidate(): void {
  revalidatePath("/database");
  revalidatePath("/database/lists");
}

// ── Lists ──────────────────────────────────────────────────────────────────

function readList(formData: FormData) {
  return {
    name: String(formData.get("name") ?? "").trim(),
    source: String(formData.get("source") ?? "").trim() || null,
    description: String(formData.get("description") ?? "").trim() || null,
    centerId: String(formData.get("centerId") ?? "").trim() || null,
    useForAds: formData.get("useForAds") === "on",
    useForWhatsapp: formData.get("useForWhatsapp") === "on",
  };
}

export async function createList(_prev: DatabaseFormState, formData: FormData): Promise<DatabaseFormState> {
  const user = await getCurrentUser();
  if (!user || !can(user, "contact.manage")) return { error: "You don't have permission to do that." };

  const list = readList(formData);
  if (!list.name) return { error: "Give the list a name." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("contact_lists")
    .insert({
      name: list.name,
      source: list.source,
      description: list.description,
      center_id: list.centerId,
      use_for_ads: list.useForAds,
      use_for_whatsapp: list.useForWhatsapp,
      created_by: user.id,
    })
    .select("id")
    .single<{ id: string }>();
  if (error) {
    return { error: error.code === "23505" ? "A list with that name already exists." : "Could not create the list." };
  }

  await writeAuditLog(supabase, {
    actorId: user.id,
    action: "contact_list.create",
    entityType: "contact_lists",
    entityId: data.id,
    after: list,
  });
  revalidate();
  return { success: `Created “${list.name}”.` };
}

export async function updateList(_prev: DatabaseFormState, formData: FormData): Promise<DatabaseFormState> {
  const user = await getCurrentUser();
  if (!user || !can(user, "contact.manage")) return { error: "You don't have permission to do that." };

  const id = String(formData.get("id") ?? "");
  if (!UUID.test(id)) return { error: "Missing list." };
  const list = readList(formData);
  if (!list.name) return { error: "Give the list a name." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("contact_lists")
    .update({
      name: list.name,
      source: list.source,
      description: list.description,
      center_id: list.centerId,
      use_for_ads: list.useForAds,
      use_for_whatsapp: list.useForWhatsapp,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) {
    return { error: error.code === "23505" ? "A list with that name already exists." : "Could not save the list." };
  }

  await writeAuditLog(supabase, {
    actorId: user.id,
    action: "contact_list.update",
    entityType: "contact_lists",
    entityId: id,
    after: list,
  });
  revalidate();
  return { success: "Saved." };
}

/**
 * Archiving hides a list from the pickers and stops it feeding audiences. Its
 * people stay in the database and on any other list they are on: archiving is
 * not deleting anyone.
 */
export async function archiveList(listId: string): Promise<DatabaseFormState> {
  const user = await getCurrentUser();
  if (!user || !can(user, "contact.manage")) return { error: "You don't have permission to do that." };
  if (!UUID.test(listId)) return { error: "Missing list." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("contact_lists")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", listId);
  if (error) return { error: "Could not archive the list." };

  await writeAuditLog(supabase, {
    actorId: user.id,
    action: "contact_list.archive",
    entityType: "contact_lists",
    entityId: listId,
  });
  revalidate();
  return { success: "Archived." };
}

// ── One contact ────────────────────────────────────────────────────────────

export async function addContact(_prev: DatabaseFormState, formData: FormData): Promise<DatabaseFormState> {
  const user = await getCurrentUser();
  if (!user || !can(user, "contact.manage")) return { error: "You don't have permission to do that." };

  const listId = String(formData.get("listId") ?? "");
  if (!UUID.test(listId)) return { error: "Choose which list this person belongs to." };

  const supabase = await createClient();
  const fields = contactFields(await getFieldSchema(supabase, "lead", user));
  const parsed = parseContactForm(formData, fields, await optionsFor(supabase, fields));
  if (!parsed.ok) return { error: parsed.message };

  const [list] = await db
    .select({ id: contactLists.id, name: contactLists.name })
    .from(contactLists)
    .where(and(eq(contactLists.id, listId), isNull(contactLists.archivedAt)));
  if (!list) return { error: "That list no longer exists." };

  let saved;
  try {
    saved = await db.transaction((tx) => saveContact(tx, parsed.input, { listId, userId: user.id }));
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not save the contact." };
  }

  await writeAuditLog(supabase, {
    actorId: user.id,
    action: "contact.add",
    entityType: "contacts",
    entityId: saved.contactId,
    after: { list: list.name, created: saved.created },
  });
  revalidate();

  if (saved.created) return { success: `Added to “${list.name}”.`, contactId: saved.contactId };
  const filled = saved.filled ? ` and ${saved.filled} blank detail${saved.filled === 1 ? "" : "s"} filled in` : "";
  return {
    success: saved.alreadyOnList
      ? "They were already on this list, so nothing was added."
      : `They were already in the database, so they have been added to “${list.name}”${filled}.`,
    contactId: saved.contactId,
  };
}

export async function updateContact(_prev: DatabaseFormState, formData: FormData): Promise<DatabaseFormState> {
  const user = await getCurrentUser();
  if (!user || !can(user, "contact.manage")) return { error: "You don't have permission to do that." };

  const id = String(formData.get("id") ?? "");
  if (!UUID.test(id)) return { error: "Missing contact." };

  const supabase = await createClient();
  const fields = contactFields(await getFieldSchema(supabase, "lead", user));
  const parsed = parseContactForm(formData, fields, await optionsFor(supabase, fields));
  if (!parsed.ok) return { error: parsed.message };

  // Unlike adding, this REPLACES what is stored: the person editing is
  // correcting this contact, not merging a second source into it.
  try {
    await db
      .update(contacts)
      .set({
        name: parsed.input.name,
        phone: normalizePhone(parsed.input.phone),
        email: normalizeEmail(parsed.input.email),
        fields: parsed.input.fields,
        updatedAt: new Date(),
      })
      .where(and(eq(contacts.id, id), isNull(contacts.deletedAt)));
  } catch (error) {
    const e = error as { code?: string; cause?: { code?: string } };
    if ((e.code ?? e.cause?.code) === "23505") {
      return { error: "Another contact already has that phone number or email. Open that one instead." };
    }
    throw error;
  }

  await writeAuditLog(supabase, { actorId: user.id, action: "contact.update", entityType: "contacts", entityId: id });
  revalidate();
  revalidatePath(`/database/${id}`);
  return { success: "Saved." };
}

/** Removes a contact from the database. Soft: the row is kept with `deleted_at`. */
export async function removeContact(contactId: string): Promise<DatabaseFormState> {
  const user = await getCurrentUser();
  if (!user || !can(user, "contact.manage")) return { error: "You don't have permission to do that." };
  if (!UUID.test(contactId)) return { error: "Missing contact." };

  await db
    .update(contacts)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(contacts.id, contactId), isNull(contacts.deletedAt)));

  const supabase = await createClient();
  await writeAuditLog(supabase, { actorId: user.id, action: "contact.remove", entityType: "contacts", entityId: contactId });
  revalidate();
  return { success: "Removed." };
}

/**
 * CLAUDE.md non-negotiable #6: a full number reaches the browser only through
 * an audited reveal. The list always shows the masked form.
 */
export async function revealContactPhone(contactId: string): Promise<{ phone?: string; error?: string }> {
  const user = await getCurrentUser();
  if (!user || !can(user, "contact.read") || !can(user, "lead.reveal_phone")) {
    return { error: "Not permitted" };
  }
  const supabase = await createClient();
  const { data } = await supabase
    .from("contacts")
    .select("id, phone")
    .eq("id", contactId)
    .maybeSingle<{ id: string; phone: string | null }>();
  if (!data?.phone) return { error: "No number to show." };

  await writeAuditLog(supabase, { actorId: user.id, action: "contact.reveal_phone", entityType: "contacts", entityId: contactId });
  return { phone: data.phone };
}

// ── Moving and merging ─────────────────────────────────────────────────────

export interface PromoteRowResult {
  contactId: string;
  result: PromoteResult;
}

export async function moveContactsToLeads(
  contactIds: string[],
): Promise<{ error?: string; results?: PromoteRowResult[] }> {
  const user = await getCurrentUser();
  if (!user || !can(user, "contact.promote") || !can(user, "lead.create")) {
    return { error: "You don't have permission to move contacts into the leads." };
  }
  const ids = contactIds.filter((id) => UUID.test(id));
  if (ids.length === 0) return { error: "Choose at least one contact." };
  if (ids.length > MAX_PROMOTE_PER_CALL) return { error: `Move at most ${MAX_PROMOTE_PER_CALL} at a time.` };

  const supabase = await createClient();
  const results: PromoteRowResult[] = [];
  for (const contactId of ids) {
    results.push({ contactId, result: await promoteContact(contactId, user, supabase) });
  }

  revalidate();
  revalidatePath("/leads");
  return { results };
}

// ── Import ─────────────────────────────────────────────────────────────────

export type ImportRow = Record<string, string>;
export type ImportMapping = Record<string, string>;

export interface ContactImportResult {
  error?: string;
  total: number;
  created: number;
  /** Already in the database: added to this list, details filled where blank. */
  existing: number;
  /** Already on this very list, so nothing changed. */
  alreadyOnList: number;
  skipped: number;
  /** Of the people in this chunk, how many are already leads. */
  alreadyLeads: number;
  problems: Array<{ rowIndex: number; message: string }>;
}

/**
 * Loads one chunk of a spreadsheet into a list.
 *
 * Never rejects a duplicate (non-negotiable #2): a person already in the
 * database is added to this list and has their blanks filled; the same person
 * twice in one file is one contact. The file is read in the browser and sent
 * as rows, a thousand at a time, so a large purchased database is several
 * calls rather than one request nobody can see progress on.
 */
export async function importContacts(
  rows: ImportRow[],
  mapping: ImportMapping,
  listId: string,
  rowOffset: number,
): Promise<ContactImportResult> {
  const empty: ContactImportResult = {
    total: 0,
    created: 0,
    existing: 0,
    alreadyOnList: 0,
    skipped: 0,
    alreadyLeads: 0,
    problems: [],
  };
  const user = await getCurrentUser();
  if (!user || !can(user, "contact.manage")) return { ...empty, error: "You don't have permission to import contacts." };
  if (!UUID.test(listId)) return { ...empty, error: "Choose the list these contacts belong to." };
  if (rows.length === 0) return { ...empty, error: "The file has no data rows." };
  if (rows.length > MAX_ROWS_PER_CALL) return { ...empty, error: `Send at most ${MAX_ROWS_PER_CALL} rows at a time.` };

  const [list] = await db
    .select({ id: contactLists.id })
    .from(contactLists)
    .where(and(eq(contactLists.id, listId), isNull(contactLists.archivedAt)));
  if (!list) return { ...empty, error: "That list no longer exists." };

  const supabase = await createClient();
  const fields = contactFields(await getFieldSchema(supabase, "lead", user));
  const fieldByKey = new Map(fields.map((f) => [f.key, f]));
  const headerToKey = Object.entries(mapping).filter(([, key]) => key !== "" && fieldByKey.has(key));
  const mappedKeys = new Set(headerToKey.map(([, key]) => key));
  if (!mappedKeys.has("student_name")) return { ...empty, error: "Map the Name column before importing." };
  if (!mappedKeys.has("primary_phone") && !mappedKeys.has("email")) {
    return { ...empty, error: "Map a Phone or an Email column, so people can be recognised." };
  }

  const optionsByKey = await optionsFor(supabase, fields.filter((f) => mappedKeys.has(f.key)));
  const result: ContactImportResult = { ...empty, total: rows.length };
  const contactIds = new Set<string>();

  for (const [index, row] of rows.entries()) {
    const rowIndex = rowOffset + index + 2; // the header is row 1
    const values: Record<string, unknown> = {};
    for (const [header, key] of headerToKey) {
      const field = fieldByKey.get(key);
      if (!field) continue;
      const { value } = coerceImportValue(field, row[header], optionsByKey[key] ?? []);
      if (value !== undefined) values[key] = value;
    }
    const input = splitContactValues(values);

    if (!input.name) {
      result.skipped++;
      result.problems.push({ rowIndex, message: "Missing name" });
      continue;
    }
    if (!input.phone && !input.email) {
      result.skipped++;
      result.problems.push({ rowIndex, message: "No usable phone number or email" });
      continue;
    }

    try {
      const saved = await db.transaction((tx) => saveContact(tx, input, { listId, userId: user.id }));
      contactIds.add(saved.contactId);
      if (saved.created) result.created++;
      else if (saved.alreadyOnList) result.alreadyOnList++;
      else result.existing++;
    } catch (error) {
      result.skipped++;
      result.problems.push({ rowIndex, message: error instanceof Error ? error.message : "Could not save this row" });
    }
  }

  // How many of these people are already leads: worth knowing straight away,
  // since those are the ones that will show "Merge" rather than "Move".
  const ids = [...contactIds];
  for (let i = 0; i < ids.length; i += 500) {
    const chunk = await db
      .select({ id: contacts.id, phone: contacts.phone, email: contacts.email, leadId: contacts.leadId })
      .from(contacts)
      .where(and(isNull(contacts.deletedAt), inArray(contacts.id, ids.slice(i, i + 500))));
    for (const state of (await leadStateFor(chunk)).values()) {
      if (state.linked || state.match) result.alreadyLeads++;
    }
  }

  await writeAuditLog(supabase, {
    actorId: user.id,
    action: "contact.import",
    entityType: "contact_lists",
    entityId: listId,
    after: {
      total: result.total,
      created: result.created,
      existing: result.existing,
      alreadyOnList: result.alreadyOnList,
      skipped: result.skipped,
    },
  });
  revalidate();
  return result;
}
