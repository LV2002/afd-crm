-- Repeat of the 0114 repair for messages stored between that migration
-- running and the fixed webhook going live. Idempotent: it only touches rows
-- that are still empty.
update whatsapp_messages m
set deleted_at = now(), updated_at = now()
from webhook_events w
where w.source = 'whatsapp'
  and w.external_id = 'msg:' || m.wa_message_id
  and m.direction = 'inbound'
  and m.message_type = 'text'
  and m.body is null
  and m.deleted_at is null
  and w.raw ->> 'type' in ('reaction', 'unsupported');--> statement-breakpoint

update whatsapp_messages m
set body = '[' || (w.raw ->> 'type') || ' message]',
    updated_at = now()
from webhook_events w
where w.source = 'whatsapp'
  and w.external_id = 'msg:' || m.wa_message_id
  and m.direction = 'inbound'
  and m.message_type = 'text'
  and m.body is null
  and m.deleted_at is null
  and w.raw ->> 'type' is not null
  and w.raw ->> 'type' <> 'text';
