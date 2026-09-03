-- RLS for notifications and their configuration.
--
-- Two tables, two very different access rules.
--
-- `notification_settings` is configuration, so it follows the same shape as
-- org_settings and terminology: readable by any signed-in user (the copy is
-- not secret, and a nav badge may want to know an event is switched off),
-- writable only by an org-wide settings admin.
--
-- `notifications` is personal. A row names exactly one recipient, and the
-- policy says so: you read your own and nobody else's. There is deliberately
-- NO centre-scoped or all-scoped read path here, not even for an admin. A
-- notification is a message addressed to a person, and "the admin can read
-- everyone's messages" is a surveillance feature nobody asked for. What an
-- admin genuinely needs — what happened, and when — is already in audit_log.

alter table notification_settings enable row level security;
alter table notifications enable row level security;

create policy notification_settings_select on notification_settings for select
  to authenticated
  using (true);

create policy notification_settings_insert on notification_settings for insert
  to authenticated
  with check (auth_scope('settings.manage') = 'all');

create policy notification_settings_update on notification_settings for update
  to authenticated
  using (auth_scope('settings.manage') = 'all')
  with check (auth_scope('settings.manage') = 'all');

-- No delete policy: the event catalogue is fixed in code, so a settings row
-- is switched off (is_enabled = false), never removed.

create policy notifications_select on notifications for select
  to authenticated
  using (recipient_id = auth.uid() and deleted_at is null);

-- Marking your own as read, or dismissing it. The `with check` repeats the
-- recipient test so a caller cannot hand a row to somebody else on the way
-- past — Postgres applies the check to the NEW row, and without it an
-- UPDATE could rewrite recipient_id.
--
-- `deleted_at` is not required to stay null in the check: dismissing a
-- notification is an UPDATE that sets it, and requiring null would reject
-- the very operation this policy exists to allow. The SELECT policy hides
-- it afterwards, which is the intended effect.
create policy notifications_update on notifications for update
  to authenticated
  using (recipient_id = auth.uid())
  with check (recipient_id = auth.uid());

-- No insert policy at all, and that is deliberate. Notifications are
-- written by the system — the SLA cron, the assignment engine, a Server
-- Action completing a handoff — through the direct database connection that
-- bypasses RLS, exactly as audit_log and lead assignment already do. A
-- browser session must never be able to manufacture a notification for
-- somebody else, and the surest way to guarantee that is to give the
-- authenticated role no way in.
--
-- No delete policy either: nothing is hard-deleted (CLAUDE.md § 5).
