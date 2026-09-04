-- Dismissing a notification was impossible. Found by the first full run of
-- the database-backed suite against real Postgres.
--
-- `notifications_select` was `recipient_id = auth.uid() and deleted_at is
-- null`, and `notifications_update` correctly checked only
-- `recipient_id = auth.uid()` on the new row. The migration that wrote them
-- reasoned about the UPDATE policy alone and concluded a dismissal would
-- pass. It doesn't: an UPDATE whose WHERE clause reads the table is also
-- gated by the SELECT policy, and the row it produces — with `deleted_at`
-- now set — no longer satisfies it. Postgres rejects the statement with
--
--   new row violates row-level security policy for table "notifications"
--
-- so the one operation the update policy exists to allow was the one
-- operation it refused.
--
-- The fix is to stop encoding "dismissed" as an access boundary. RLS
-- decides WHOSE rows you may see; whether you have dismissed your own
-- notification is application state, and every read already filters
-- `deleted_at is null` (lib/notifications/get-notifications.ts,
-- lib/notifications/actions.ts). Nothing becomes visible to anybody else:
-- the recipient test is untouched, and there is still no INSERT policy.

drop policy notifications_select on notifications;--> statement-breakpoint

create policy notifications_select on notifications for select
  to authenticated
  using (recipient_id = auth.uid());
