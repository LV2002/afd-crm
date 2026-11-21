-- The inbox badge, per source: which of our numbers a thread is on, whether somebody has
-- marked it resolved, and the number to match that against. Columns are appended, so the
-- view keeps working for everything that already reads it.
create or replace view whatsapp_thread_latest
with (security_invoker = true) as
select distinct on (coalesce('lead:' || m.lead_id::text, 'phone:' || m.from_phone))
  coalesce('lead:' || m.lead_id::text, 'phone:' || m.from_phone) as thread_key,
  m.lead_id,
  m.from_phone,
  m.direction as last_direction,
  m.occurred_at as last_message_at,
  m.number_id,
  -- Resolved only until they write again: the latest message is what decides it.
  exists (
    select 1 from whatsapp_conversations c
    where c.status = 'resolved'
      and c.phone = coalesce(l.primary_phone, m.from_phone)
      and c.resolved_at >= m.occurred_at
  ) as resolved
from whatsapp_messages m
left join leads l on l.id = m.lead_id and l.deleted_at is null
where m.deleted_at is null
order by
  coalesce('lead:' || m.lead_id::text, 'phone:' || m.from_phone),
  m.occurred_at desc;
