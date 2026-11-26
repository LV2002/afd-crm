import { and, eq, inArray, isNull, sql } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { adListAudienceMembers, contactListAudiences, contactLists, contacts } from "@/lib/db/schema";

import { computeAudienceDiff } from "./audience-sync";

/**
 * Each database (contact list) is its own audience on Meta and on Google,
 * separate from the leads audience.
 *
 * ## What goes in a list's audience
 *
 * The people on that list who have a phone number, are not deleted, and are
 * not leads — the same eligibility as before (`contact-audience.ts`): once
 * somebody is a lead their advertising is governed by the lead rules (which
 * exclude anyone who has taken admission), so a registrant who enrols stops
 * seeing ads for the course.
 *
 * ## Which lists get an audience
 *
 * Every list that is not archived and has "may be used for retargeting"
 * ticked. A new database therefore gets its audience on the next sync with
 * nothing to set up; unticking or archiving a list empties its audience (the
 * people are removed, the empty audience is left in the ad account).
 *
 * ## Why the diff is recorded
 *
 * The platforms cannot be asked who is in an audience, so what was sent is
 * stored per (list, platform) and compared to who should be there now, the
 * same two-way sync the leads audience uses.
 */
export interface ListAudienceSender {
  platform: "meta" | "google";
  /** Creates this list's audience on the platform and returns its id. */
  create: (name: string) => Promise<string>;
  /** Phones are E.164 as stored; hashing is the sender's job. */
  add: (audienceId: string, phones: string[]) => Promise<void>;
  remove: (audienceId: string, phones: string[]) => Promise<void>;
}

export interface ListAudienceResult {
  lists: number;
  created: number;
  added: number;
  removed: number;
  failed: number;
}

export function audienceNameFor(listName: string): string {
  return `AFD India CRM — Database: ${listName}`.slice(0, 120);
}

async function eligibleByList(listIds: string[]): Promise<Map<string, Map<string, string>>> {
  const out = new Map<string, Map<string, string>>();
  if (listIds.length === 0) return out;
  const rows = await db.execute<{ list_id: string; id: string; phone: string }>(sql`
    select m.list_id, c.id, c.phone
    from contact_list_members m
    join contacts c on c.id = m.contact_id
    where m.list_id in (${sql.join(listIds.map((id) => sql`${id}::uuid`), sql`, `)})
      and c.deleted_at is null
      and c.phone is not null
      and c.lead_id is null
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
  for (const row of rows) {
    const list = out.get(row.list_id) ?? new Map<string, string>();
    list.set(row.id, row.phone);
    out.set(row.list_id, list);
  }
  return out;
}

export async function syncListAudiences(sender: ListAudienceSender): Promise<ListAudienceResult> {
  const result: ListAudienceResult = { lists: 0, created: 0, added: 0, removed: 0, failed: 0 };

  const live = await db
    .select({ id: contactLists.id, name: contactLists.name })
    .from(contactLists)
    .where(and(isNull(contactLists.archivedAt), eq(contactLists.useForAds, true)));
  const liveIds = new Set(live.map((l) => l.id));

  const existing = await db
    .select()
    .from(contactListAudiences)
    .where(eq(contactListAudiences.platform, sender.platform));
  const audienceByList = new Map(existing.map((a) => [a.listId, a]));

  // Lists that had an audience and no longer should: emptied below.
  const retiring = existing.filter((a) => !liveIds.has(a.listId));

  const eligible = await eligibleByList(live.map((l) => l.id));

  const syncOne = async (list: { id: string; name: string }, shouldBe: Map<string, string>) => {
    let audience = audienceByList.get(list.id);
    if (!audience) {
      const name = audienceNameFor(list.name);
      const externalId = await sender.create(name);
      const [created] = await db
        .insert(contactListAudiences)
        .values({ listId: list.id, platform: sender.platform, externalId, name })
        .returning();
      audience = created;
      result.created += 1;
    }

    const synced = await db
      .select({ contactId: adListAudienceMembers.contactId })
      .from(adListAudienceMembers)
      .where(and(eq(adListAudienceMembers.listId, list.id), eq(adListAudienceMembers.platform, sender.platform)));

    const { toAdd, toRemove } = computeAudienceDiff([...shouldBe.keys()], synced.map((s) => s.contactId));

    const phoneById = new Map(shouldBe);
    for (let i = 0; i < toRemove.length; i += 500) {
      const chunk = await db
        .select({ id: contacts.id, phone: contacts.phone })
        .from(contacts)
        .where(inArray(contacts.id, toRemove.slice(i, i + 500)));
      for (const row of chunk) if (row.phone) phoneById.set(row.id, row.phone);
    }
    const phones = (ids: string[]) => ids.map((id) => phoneById.get(id)).filter((p): p is string => Boolean(p));

    if (toAdd.length > 0) await sender.add(audience.externalId, phones(toAdd));
    if (toRemove.length > 0) await sender.remove(audience.externalId, phones(toRemove));

    for (let i = 0; i < toAdd.length; i += 1000) {
      await db
        .insert(adListAudienceMembers)
        .values(toAdd.slice(i, i + 1000).map((contactId) => ({ listId: list.id, platform: sender.platform, contactId })))
        .onConflictDoNothing();
    }
    for (let i = 0; i < toRemove.length; i += 1000) {
      await db
        .delete(adListAudienceMembers)
        .where(
          and(
            eq(adListAudienceMembers.listId, list.id),
            eq(adListAudienceMembers.platform, sender.platform),
            inArray(adListAudienceMembers.contactId, toRemove.slice(i, i + 1000)),
          ),
        );
    }
    result.added += toAdd.length;
    result.removed += toRemove.length;
    await db
      .update(contactListAudiences)
      .set({ lastSyncedAt: new Date(), lastError: null })
      .where(eq(contactListAudiences.id, audience.id));
  };

  // One list failing must not stop the others; the error is kept on its row.
  const attempt = async (listId: string, name: string, run: () => Promise<void>) => {
    try {
      await run();
    } catch (error) {
      result.failed += 1;
      const message = error instanceof Error ? error.message : String(error);
      await db
        .update(contactListAudiences)
        .set({ lastError: message.slice(0, 500) })
        .where(and(eq(contactListAudiences.listId, listId), eq(contactListAudiences.platform, sender.platform)));
      console.error(`list audience sync failed for "${name}" (${sender.platform})`, error);
    }
  };

  for (const list of live) {
    result.lists += 1;
    await attempt(list.id, list.name, () => syncOne(list, eligible.get(list.id) ?? new Map()));
  }
  for (const audience of retiring) {
    await attempt(audience.listId, audience.name, () =>
      syncOne({ id: audience.listId, name: audience.name }, new Map()),
    );
  }
  return result;
}
