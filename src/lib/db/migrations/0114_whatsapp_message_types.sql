-- Inbound WhatsApp messages that showed as "(empty message)".
--
-- The mapper only knew text, buttons and files. Anything else (a reaction, a
-- shared location or contact, a disappearing or view-once message) was stored
-- with no body and no explanation. New messages are now handled as they
-- arrive (lib/integrations/whatsapp/map-inbound.ts); this repairs the ones
-- already stored, from the raw delivery that webhook_events kept.
--
-- Nothing is deleted. Reactions and unreadable (view-once / disappearing)
-- messages are hidden with `deleted_at`, the same soft delete everything else
-- uses; the raw delivery is untouched.

-- Not messages: an emoji on an earlier message, and a message WhatsApp does
-- not let a business read.
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

-- A pin on a map.
update whatsapp_messages m
set body = '📍 Location'
      || coalesce(
           ': ' || nullif(concat_ws(', ', w.raw -> 'location' ->> 'name', w.raw -> 'location' ->> 'address'), ''),
           ''
         )
      || coalesce(
           ' (' || (w.raw -> 'location' ->> 'latitude') || ', ' || (w.raw -> 'location' ->> 'longitude') || ')',
           ''
         ),
    updated_at = now()
from webhook_events w
where w.source = 'whatsapp'
  and w.external_id = 'msg:' || m.wa_message_id
  and m.direction = 'inbound'
  and m.message_type = 'text'
  and m.body is null
  and m.deleted_at is null
  and w.raw ->> 'type' = 'location';--> statement-breakpoint

-- Contact cards.
update whatsapp_messages m
set body = '👤 Shared contact',
    updated_at = now()
from webhook_events w
where w.source = 'whatsapp'
  and w.external_id = 'msg:' || m.wa_message_id
  and m.direction = 'inbound'
  and m.message_type = 'text'
  and m.body is null
  and m.deleted_at is null
  and w.raw ->> 'type' = 'contacts';--> statement-breakpoint

-- Any other type, said plainly instead of left blank.
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
  and w.raw ->> 'type' <> 'text';--> statement-breakpoint

-- The caption somebody typed under a photo, video or document was never kept.
update whatsapp_messages m
set body = nullif(trim(coalesce(
      w.raw -> 'image' ->> 'caption',
      w.raw -> 'video' ->> 'caption',
      w.raw -> 'document' ->> 'caption'
    )), ''),
    updated_at = now()
from webhook_events w
where w.source = 'whatsapp'
  and w.external_id = 'msg:' || m.wa_message_id
  and m.direction = 'inbound'
  and m.message_type = 'media'
  and m.body is null
  and m.deleted_at is null;
