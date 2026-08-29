-- RLS for whatsapp_broadcasts/whatsapp_broadcast_recipients. Gated on the
-- dedicated whatsapp.campaign primitive (seeded only onto admin/co-admin
-- at 'all' scope — see seed.ts), same auth_scope(...) = 'all' shape as
-- other org-wide admin tables (tags, fee_structures) that have no
-- per-center concept of their own to check against.
--
-- No UPDATE policy for authenticated roles: status/count fields
-- (sent_count, failed_count, status transitions, per-recipient
-- status/wa_message_id) are written by the cron sweep only, which runs on
-- the direct db client — same trust boundary as webhook_events and the
-- retargeting sync's own bookkeeping tables. An admin composes a
-- broadcast; they don't hand-edit its send progress.

alter table whatsapp_broadcasts enable row level security;
alter table whatsapp_broadcast_recipients enable row level security;

create policy whatsapp_broadcasts_select on whatsapp_broadcasts for select
  to authenticated
  using (auth_scope('whatsapp.campaign') = 'all');

create policy whatsapp_broadcasts_insert on whatsapp_broadcasts for insert
  to authenticated
  with check (auth_scope('whatsapp.campaign') = 'all');

create policy whatsapp_broadcast_recipients_select on whatsapp_broadcast_recipients for select
  to authenticated
  using (auth_scope('whatsapp.campaign') = 'all');

-- Insert only, same as whatsapp_broadcasts: the create-broadcast action
-- snapshots the whole recipient list in the same request that creates the
-- broadcast row itself. Status/wa_message_id updates as the cron sweep
-- actually sends each one run on the direct db client instead.
create policy whatsapp_broadcast_recipients_insert on whatsapp_broadcast_recipients for insert
  to authenticated
  with check (auth_scope('whatsapp.campaign') = 'all');
