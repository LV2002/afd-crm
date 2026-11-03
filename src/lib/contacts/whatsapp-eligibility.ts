import { sql } from "drizzle-orm";

import { db } from "@/lib/db/client";

/**
 * Which of these contacts may still be sent a WhatsApp broadcast right now.
 *
 * Asked again at send time, not only when the broadcast was composed: a
 * broadcast can wait for a scheduled hour or take days to drain, and in that
 * time a contact may have become a lead (and so belongs to the leads
 * audience), been removed, or been on a list somebody has since un-ticked as
 * having agreed to WhatsApp. "We had already decided to message them" is not
 * a reason to send.
 *
 * Eligible means: not removed, not linked to a lead, no phone or email of
 * theirs belongs to any lead, and on at least one un-archived list marked as
 * having agreed to WhatsApp. Direct client: a cron job has no session.
 */
export async function messageableContactIds(ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const list = sql.join(
    ids.map((id) => sql`${id}::uuid`),
    sql`, `,
  );
  const rows = await db.execute<{ id: string }>(sql`
    select c.id
    from contacts c
    where c.id in (${list})
      and c.deleted_at is null
      and c.lead_id is null
      and exists (
        select 1
        from contact_list_members m
        join contact_lists l on l.id = m.list_id
        where m.contact_id = c.id and l.use_for_whatsapp and l.archived_at is null
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
  return new Set([...rows].map((r) => r.id));
}
