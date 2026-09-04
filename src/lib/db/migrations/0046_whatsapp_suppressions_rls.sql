-- RLS for whatsapp_suppressions. Same shape as whatsapp_broadcasts: gated
-- on the whatsapp.campaign primitive, which is org-wide by nature — a
-- suppression is a person saying "stop messaging me", and it must hold
-- across every centre, so there is no per-centre concept to scope to.
--
-- Rows are written two ways. The webhook writes them on the direct
-- connection when somebody sends STOP, which no policy gates because
-- nobody is signed in; a human recording one by hand goes through these.
--
-- No DELETE policy anywhere. Lifting a suppression sets `released_at` —
-- "we stopped messaging them on the 3rd, they asked back on the 9th" is
-- the answer to a complaint, and a deleted row cannot answer anything.

alter table whatsapp_suppressions enable row level security;

create trigger set_updated_at before update on whatsapp_suppressions
  for each row execute function set_updated_at();

create policy whatsapp_suppressions_select on whatsapp_suppressions for select
  to authenticated
  using (auth_scope('whatsapp.campaign') = 'all');

create policy whatsapp_suppressions_insert on whatsapp_suppressions for insert
  to authenticated
  with check (auth_scope('whatsapp.campaign') = 'all');

create policy whatsapp_suppressions_update on whatsapp_suppressions for update
  to authenticated
  using (auth_scope('whatsapp.campaign') = 'all')
  with check (auth_scope('whatsapp.campaign') = 'all');
