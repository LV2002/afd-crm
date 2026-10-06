-- Replying to somebody who is not a lead yet, and Coexistence threads
-- belonging to the counsellor whose phone they are on.
--
-- Migration 0042 made an unmatched inbound row *visible* to whoever runs
-- campaigns and stopped there, because the only action anybody could take
-- on one was to add the sender as a lead by hand. That left the inbox
-- showing a conversation with no way to answer it: a person messages the
-- institute, the message arrives, and the screen offers a dead end.
-- Leon's instruction is the Instagram model, which has worked since 0081
-- — answer first, decide whether it is an enquiry afterwards.
--
-- Two changes here, and the second one matters more than it looks.
--
-- SELECT also lets through a row the caller owns (`counsellor_id`).
-- Coexistence runs a counsellor's own number, and from this migration on
-- their conversation with somebody who is not in the CRM is stored rather
-- than dropped. Those rows are that counsellor's own chats on their own
-- phone; gating them on `whatsapp.campaign` would mean a counsellor could
-- not see their own messages while the marketing lead could see all of
-- them. `counsellor_id` is set by the webhook from the number's owner, not
-- by anything a browser sends.
--
-- INSERT and UPDATE accept a null `lead_id` under exactly the test that
-- SELECT uses, plus `whatsapp.send`. The rule is: whoever can read the
-- thread can answer it, and nobody gains sight of a thread by being
-- allowed to write to it.
--
-- `private.`-qualified throughout (migration 0077): PostgREST exposes
-- `public`, and an unqualified helper in a NEW policy fails at migration
-- time with "function does not exist".
--
-- `(select auth.uid())`, not a bare `auth.uid()`. Written bare, Postgres
-- re-evaluates it once per row scanned; wrapped in a scalar subquery it
-- becomes an InitPlan evaluated once for the statement. On a table that
-- will hold every message the institute ever sends, that is the
-- difference between an index scan and a per-row function call. The
-- Supabase linter fails the build over it (`npm run db:audit`, rule
-- 0003_auth_rls_initplan), which is how it was caught here.

drop policy whatsapp_messages_select on whatsapp_messages;--> statement-breakpoint

create policy whatsapp_messages_select on whatsapp_messages for select
  to authenticated
  using (
    (
      whatsapp_messages.lead_id is not null
      and exists (
        select 1 from leads l
        where l.id = whatsapp_messages.lead_id
          and private.can_access_center('whatsapp.read', l.center_id, l.assigned_to)
      )
    )
    or (
      whatsapp_messages.lead_id is null
      and (
        private.auth_scope('whatsapp.campaign') is not null
        or whatsapp_messages.counsellor_id = (select auth.uid())
      )
    )
  );--> statement-breakpoint

drop policy whatsapp_messages_insert on whatsapp_messages;--> statement-breakpoint

create policy whatsapp_messages_insert on whatsapp_messages for insert
  to authenticated
  with check (
    (
      whatsapp_messages.lead_id is not null
      and exists (
        select 1 from leads l
        where l.id = whatsapp_messages.lead_id
          and private.can_access_center('whatsapp.send', l.center_id, l.assigned_to)
      )
    )
    or (
      whatsapp_messages.lead_id is null
      and private.auth_scope('whatsapp.send') is not null
      and (
        private.auth_scope('whatsapp.campaign') is not null
        or whatsapp_messages.counsellor_id = (select auth.uid())
      )
    )
  );--> statement-breakpoint

-- UPDATE stays in step with INSERT because a send is two writes: the
-- queued row goes in, the Cloud API is called, and the same row is
-- updated with its real id and final status. An INSERT the policy allows
-- and an UPDATE it refuses would leave every unmatched reply stuck at
-- "queued" for ever, which is worse than refusing the send outright.
drop policy whatsapp_messages_update on whatsapp_messages;--> statement-breakpoint

create policy whatsapp_messages_update on whatsapp_messages for update
  to authenticated
  using (
    (
      whatsapp_messages.lead_id is not null
      and exists (
        select 1 from leads l
        where l.id = whatsapp_messages.lead_id
          and private.can_access_center('whatsapp.send', l.center_id, l.assigned_to)
      )
    )
    or (
      whatsapp_messages.lead_id is null
      and private.auth_scope('whatsapp.send') is not null
      and (
        private.auth_scope('whatsapp.campaign') is not null
        or whatsapp_messages.counsellor_id = (select auth.uid())
      )
    )
  )
  with check (
    (
      whatsapp_messages.lead_id is not null
      and exists (
        select 1 from leads l
        where l.id = whatsapp_messages.lead_id
          and private.can_access_center('whatsapp.send', l.center_id, l.assigned_to)
      )
    )
    or (
      whatsapp_messages.lead_id is null
      and private.auth_scope('whatsapp.send') is not null
      and (
        private.auth_scope('whatsapp.campaign') is not null
        or whatsapp_messages.counsellor_id = (select auth.uid())
      )
    )
  );--> statement-breakpoint

-- Converting a thread backfills `lead_id` onto the messages already in
-- it, so the history survives. Without this index that is a sequential
-- scan of the whole table per conversion, and it is the only query in the
-- system that looks messages up by the contact's number alone.
create index if not exists whatsapp_messages_unmatched_phone_idx
  on whatsapp_messages (from_phone, occurred_at)
  where lead_id is null;
