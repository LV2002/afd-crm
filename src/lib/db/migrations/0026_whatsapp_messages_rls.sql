-- RLS for whatsapp_messages. Uses the dedicated whatsapp.read/whatsapp.send
-- primitives (reserved since Phase 1's permission list, seeded onto
-- counsellor/center_head at own/center scope respectively — see
-- src/lib/auth/permissions.ts and src/lib/db/seed.ts) rather than
-- interaction.read/create: a role can hold interaction.read (see call/note
-- history) without whatsapp.read, or vice versa, and that distinction only
-- means something if the two are enforced separately. Same
-- can_access_center() shape as interactions_select/insert in migration
-- 0010 otherwise — a counsellor sees their own leads' threads, a center
-- head sees their center's, admin/co-admin see everything.
--
-- UPDATE is allowed (unlike interactions, which is genuinely append-only)
-- because a real human-initiated send is a two-step write under this same
-- RLS boundary: insert a 'queued' row, call the Cloud API, then update
-- that row with the real wa_message_id and 'sent'/'failed'. The inbound
-- webhook's status-callback updates (delivered/read, for a message this
-- CRM sent) run on the direct db client instead, same trust boundary as
-- webhook_events itself — a webhook delivery has no user session to bind
-- an RLS policy to. No DELETE policy for anyone: nothing here is ever
-- hard-deleted.

alter table whatsapp_messages enable row level security;

create policy whatsapp_messages_select on whatsapp_messages for select
  to authenticated
  using (exists (
    select 1 from leads l
    where l.id = whatsapp_messages.lead_id
      and can_access_center('whatsapp.read', l.center_id, l.assigned_to)
  ));

create policy whatsapp_messages_insert on whatsapp_messages for insert
  to authenticated
  with check (exists (
    select 1 from leads l
    where l.id = whatsapp_messages.lead_id
      and can_access_center('whatsapp.send', l.center_id, l.assigned_to)
  ));

create policy whatsapp_messages_update on whatsapp_messages for update
  to authenticated
  using (exists (
    select 1 from leads l
    where l.id = whatsapp_messages.lead_id
      and can_access_center('whatsapp.send', l.center_id, l.assigned_to)
  ))
  with check (exists (
    select 1 from leads l
    where l.id = whatsapp_messages.lead_id
      and can_access_center('whatsapp.send', l.center_id, l.assigned_to)
  ));
