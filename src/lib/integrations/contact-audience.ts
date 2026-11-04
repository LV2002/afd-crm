import { and, eq, inArray, sql } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { adAudienceContactMembers, contacts } from "@/lib/db/schema";

import { computeAudienceDiff } from "./audience-sync";

/**
 * Sending the contact database to Meta and Google as retargeting audiences.
 *
 * ## Who is eligible
 *
 * A contact, once, however many lists they are on, if ALL of these hold:
 *
 * - they have a phone number (both platforms are matched on phone);
 * - at least one list they are on is not archived and has "may be used for
 *   Meta and Google retargeting" ticked (Leon: ads are fine on these
 *   databases, WhatsApp is a separate switch);
 * - they are **not a lead**: not linked to one, and no phone or email of
 *   theirs belongs to any lead.
 *
 * The last rule does two jobs. It keeps the two audiences from overlapping,
 * which matters because removal is by what was sent: someone in both would be
 * taken out of Meta when either side dropped them, while still wanted by the
 * other. And it hands every person who has become a lead to the lead rules,
 * which already exclude anyone who has taken admission, so a seminar student
 * who joined stops seeing ads for the course without anyone doing anything.
 * The price, said plainly: once somebody is a lead, whether they are
 * advertised to is the lead rules' decision (consent recorded, recent), not
 * the list's.
 */
export interface ContactAudienceCandidate {
  id: string;
  phone: string | null;
}

/**
 * Pure, for the tests: the same rule as the query, written out.
 *
 * `onAdsList` is whether any list they are on allows ads and is not archived;
 * `isLead` is whether they are linked to, or match, a lead.
 */
export function isContactAudienceEligible(c: {
  deleted: boolean;
  phone: string | null;
  onAdsList: boolean;
  isLead: boolean;
}): boolean {
  return !c.deleted && Boolean(c.phone) && c.onAdsList && !c.isLead;
}

/** The contacts that should be in an audience right now. Direct db: a cron job has no session. */
export async function loadEligibleContacts(): Promise<ContactAudienceCandidate[]> {
  const rows = await db.execute<{ id: string; phone: string }>(sql`
    select c.id, c.phone
    from contacts c
    where c.deleted_at is null
      and c.phone is not null
      and c.lead_id is null
      and exists (
        select 1
        from contact_list_members m
        join contact_lists l on l.id = m.list_id
        where m.contact_id = c.id and l.use_for_ads and l.archived_at is null
      )
      and not exists (
        select 1
        from lead_identifiers li
        join leads ld on ld.id = li.lead_id
        where li.deleted_at is null
          and ld.deleted_at is null
          and (
            (li.kind = 'phone' and li.value_normalised = c.phone)
            or (c.email is not null and li.kind = 'email' and li.value_normalised = c.email)
          )
      )
  `);
  return [...rows].map((r) => ({ id: r.id, phone: r.phone }));
}

export interface PlatformSender {
  platform: "meta" | "google";
  /** Hashes and uploads. Phones are E.164 as stored. */
  add: (phones: string[]) => Promise<void>;
  remove: (phones: string[]) => Promise<void>;
}

export interface ContactSyncResult {
  eligible: number;
  added: number;
  removed: number;
}

/**
 * Brings one platform's audience in line with the contacts who should be in
 * it: adds the newly eligible, removes whoever no longer is, and records what
 * was sent. A real two-way diff against `ad_audience_contact_members`, the
 * same as the lead sync, because a platform cannot be asked who is in an
 * audience.
 */
export async function syncContactAudience(sender: PlatformSender): Promise<ContactSyncResult> {
  const eligible = await loadEligibleContacts();
  const synced = await db
    .select({ contactId: adAudienceContactMembers.contactId })
    .from(adAudienceContactMembers)
    .where(eq(adAudienceContactMembers.platform, sender.platform));

  const { toAdd, toRemove } = computeAudienceDiff(
    eligible.map((c) => c.id),
    synced.map((s) => s.contactId),
  );

  const phoneById = new Map(eligible.map((c) => [c.id, c.phone]));
  // Someone being removed is no longer eligible, so their phone has to be
  // read from the contact itself.
  for (let i = 0; i < toRemove.length; i += 500) {
    const chunk = await db
      .select({ id: contacts.id, phone: contacts.phone })
      .from(contacts)
      .where(inArray(contacts.id, toRemove.slice(i, i + 500)));
    for (const row of chunk) phoneById.set(row.id, row.phone);
  }
  const phones = (ids: string[]) =>
    ids.map((id) => phoneById.get(id)).filter((p): p is string => Boolean(p));

  if (toAdd.length > 0) await sender.add(phones(toAdd));
  if (toRemove.length > 0) await sender.remove(phones(toRemove));

  for (let i = 0; i < toAdd.length; i += 1000) {
    await db
      .insert(adAudienceContactMembers)
      .values(toAdd.slice(i, i + 1000).map((contactId) => ({ platform: sender.platform, contactId })))
      .onConflictDoNothing();
  }
  for (let i = 0; i < toRemove.length; i += 1000) {
    await db
      .delete(adAudienceContactMembers)
      .where(
        and(
          eq(adAudienceContactMembers.platform, sender.platform),
          inArray(adAudienceContactMembers.contactId, toRemove.slice(i, i + 1000)),
        ),
      );
  }

  return { eligible: eligible.length, added: toAdd.length, removed: toRemove.length };
}
