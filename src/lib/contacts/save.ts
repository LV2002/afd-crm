import { and, eq, isNull, sql } from "drizzle-orm";

import type { DbExecutor } from "@/lib/db/client";
import { contactListMembers, contacts } from "@/lib/db/schema";
import { normalizeEmail } from "@/lib/identity/normalize-email";
import { normalizePhone } from "@/lib/identity/normalize-phone";

import { isBlank } from "./fields";

export interface ContactInput {
  name: string;
  phone: string | null;
  email: string | null;
  /** Every other lead field, by key. */
  fields: Record<string, unknown>;
}

export interface SavedContact {
  contactId: string;
  /** True when no contact matched and a new one was made. */
  created: boolean;
  /** How many blank details on an existing contact this row filled in. */
  filled: number;
  /** Already on this list — the row added nothing. */
  alreadyOnList: boolean;
}

/**
 * Adds a person to the database and to a list, without ever making the same
 * person twice.
 *
 * Matched by phone, then email, exactly as leads are. A student who attended a
 * seminar and is also in a purchased exam database is ONE contact on TWO
 * lists: two rows would be retargeted twice and would show as two people. A
 * second appearance is never an error; it adds the list, and fills in
 * whatever the first appearance left blank. It never overwrites what is
 * already there, because the first source of a detail is as likely to be
 * right as the second.
 *
 * Phone and email are the identity, so one of them is required.
 */
export async function saveContact(
  tx: DbExecutor,
  input: ContactInput,
  context: { listId: string; userId: string | null },
): Promise<SavedContact> {
  const phone = normalizePhone(input.phone);
  const email = normalizeEmail(input.email);
  if (!phone && !email) throw new Error("A contact needs a phone number or an email address.");
  if (!input.name.trim()) throw new Error("A contact needs a name.");

  const existing = await findExisting(tx, phone, email);

  if (!existing) {
    try {
      // In a savepoint of its own: a unique violation aborts the enclosing
      // transaction in Postgres, and the recovery below still has to read.
      const row = await tx.transaction(async (savepoint) => {
        const [inserted] = await savepoint
          .insert(contacts)
          .values({
            name: input.name.trim(),
            phone,
            email,
            fields: stripBlank(input.fields),
            createdBy: context.userId,
          })
          .returning({ id: contacts.id });
        return inserted;
      });
      await addMember(tx, row.id, context);
      return { contactId: row.id, created: true, filled: 0, alreadyOnList: false };
    } catch (error) {
      // Two people importing overlapping files at once: the other insert won.
      if (!isUniqueViolation(error)) throw error;
      const raced = await findExisting(tx, phone, email);
      if (!raced) throw error;
      return mergeInto(tx, raced, input, phone, email, context);
    }
  }

  return mergeInto(tx, existing, input, phone, email, context);
}

type ExistingContact = typeof contacts.$inferSelect;

async function findExisting(
  tx: DbExecutor,
  phone: string | null,
  email: string | null,
): Promise<ExistingContact | null> {
  if (phone) {
    const [byPhone] = await tx
      .select()
      .from(contacts)
      .where(and(eq(contacts.phone, phone), isNull(contacts.deletedAt)));
    if (byPhone) return byPhone;
  }
  if (email) {
    const [byEmail] = await tx
      .select()
      .from(contacts)
      .where(and(eq(contacts.email, email), isNull(contacts.deletedAt)));
    if (byEmail) return byEmail;
  }
  return null;
}

async function mergeInto(
  tx: DbExecutor,
  existing: ExistingContact,
  input: ContactInput,
  phone: string | null,
  email: string | null,
  context: { listId: string; userId: string | null },
): Promise<SavedContact> {
  const merged: Record<string, unknown> = { ...existing.fields };
  let filled = 0;
  for (const [key, value] of Object.entries(input.fields)) {
    if (isBlank(value) || !isBlank(merged[key])) continue;
    merged[key] = value;
    filled++;
  }

  const patch: Partial<typeof contacts.$inferInsert> = {};
  if (filled > 0) patch.fields = merged;
  // A missing phone or email is filled in only when nobody else holds it: the
  // unique indexes would otherwise refuse, and the two people are not the
  // same one just because a second row happens to name both.
  if (!existing.phone && phone && !(await heldByAnother(tx, "phone", phone, existing.id))) {
    patch.phone = phone;
    filled++;
  }
  if (!existing.email && email && !(await heldByAnother(tx, "email", email, existing.id))) {
    patch.email = email;
    filled++;
  }
  if (Object.keys(patch).length > 0) {
    await tx
      .update(contacts)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(contacts.id, existing.id));
  }

  const added = await addMember(tx, existing.id, context);
  return { contactId: existing.id, created: false, filled, alreadyOnList: !added };
}

async function heldByAnother(
  tx: DbExecutor,
  column: "phone" | "email",
  value: string,
  selfId: string,
): Promise<boolean> {
  const [row] = await tx
    .select({ id: contacts.id })
    .from(contacts)
    .where(
      and(
        eq(column === "phone" ? contacts.phone : contacts.email, value),
        isNull(contacts.deletedAt),
        sql`${contacts.id} <> ${selfId}`,
      ),
    );
  return Boolean(row);
}

/** Returns true when the person was newly added to the list. */
async function addMember(
  tx: DbExecutor,
  contactId: string,
  context: { listId: string; userId: string | null },
): Promise<boolean> {
  const inserted = await tx
    .insert(contactListMembers)
    .values({ contactId, listId: context.listId, addedBy: context.userId })
    .onConflictDoNothing()
    .returning({ contactId: contactListMembers.contactId });
  return inserted.length > 0;
}

function stripBlank(fields: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(fields).filter(([, v]) => !isBlank(v)));
}

function isUniqueViolation(error: unknown): boolean {
  const code = (error as { code?: string; cause?: { code?: string } } | null);
  return code?.code === "23505" || code?.cause?.code === "23505";
}
