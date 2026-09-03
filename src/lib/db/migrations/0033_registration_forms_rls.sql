-- RLS for registration_forms.
--
-- Managing forms is an administrative act: creating one mints a public
-- capability to create leads, so it is gated on settings.manage at 'all'
-- scope, the same bar as the rest of Settings. There is no per-centre
-- authoring; a centre head who needs a form asks an admin.
--
-- Note what is NOT here: any policy granting the public read access. The
-- public form page and its submission never run as `authenticated` at all
-- — they resolve the token on the direct (service-role) connection, the
-- same trust boundary as the webhook handlers, because an anonymous
-- visitor has no session for a policy to bind to. RLS therefore protects
-- this table from signed-in users who shouldn't manage forms; the token
-- itself is what protects the public path, and it is a capability to
-- SUBMIT only — nothing about existing leads is reachable through it.

alter table registration_forms enable row level security;

create policy registration_forms_select on registration_forms for select
  to authenticated
  using (auth_scope('settings.manage') = 'all');

create policy registration_forms_insert on registration_forms for insert
  to authenticated
  with check (auth_scope('settings.manage') = 'all');

create policy registration_forms_update on registration_forms for update
  to authenticated
  using (auth_scope('settings.manage') = 'all')
  with check (auth_scope('settings.manage') = 'all');

-- No DELETE policy: retiring a form is `is_active = false` or a soft
-- delete, never a hard delete (CLAUDE.md § Non-negotiables 5). A form's
-- row is also what makes historic enquiries from it intelligible.
