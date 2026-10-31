import { sql } from "drizzle-orm";

import { db } from "@/lib/db/client";

/**
 * Moves every lead an endpoint has delivered onto `source`, and returns how
 * many enquiries changed.
 *
 * Found by the delivery record — `webhook_events.external_id` is the
 * enquiry's `dedupe_key` — so it is exactly this endpoint's leads and never
 * a guess from a name. The enquiry always changes; the lead's first-touch
 * and latest-touch source change only where they held the old name, so a
 * lead that really did arrive somewhere else first keeps that.
 */
export async function relabelEndpointLeads(webhookId: string, source: string): Promise<number> {
  return db.transaction(async (tx) => {
    const found = await tx.execute<{ count: string }>(sql`
      select count(*)::text as count
      from enquiries e
      join webhook_events w
        on w.source = 'custom' and w.custom_webhook_id = ${webhookId} and w.external_id = e.dedupe_key
      where e.source <> ${source}
    `);
    const count = Number(found[0]?.count ?? 0);
    if (count === 0) return 0;

    await tx.execute(sql`
      with old as (
        select e.id as enquiry_id, e.lead_id, e.source as old_source
        from enquiries e
        join webhook_events w
          on w.source = 'custom' and w.custom_webhook_id = ${webhookId} and w.external_id = e.dedupe_key
        where e.source <> ${source}
      ),
      moved as (
        update enquiries e
           set source = ${source}, updated_at = now()
          from old
         where e.id = old.enquiry_id
        returning e.id
      )
      update leads l
         set first_touch_source = case when l.first_touch_source = o.old_source
                                       then ${source} else l.first_touch_source end,
             last_touch_source  = case when l.last_touch_source = o.old_source
                                       then ${source} else l.last_touch_source end,
             updated_at = now()
        from (select distinct on (lead_id) lead_id, old_source from old) o
       where l.id = o.lead_id
    `);
    return count;
  });
}
