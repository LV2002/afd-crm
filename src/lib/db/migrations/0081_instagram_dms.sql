-- Instagram DMs, as conversations rather than leads.
--
-- Decided on Leon's instruction and written up in docs/DECISIONS.md
-- (2026-10-04): a DM does NOT create a lead. Most Instagram messages are a
-- question, a reply to a story, or nothing, and a CRM that turns each one
-- into a lead stops being a record of who is enrolling. So the
-- conversation is the object, `lead_id` stays null until a counsellor
-- presses Convert to lead, and converting runs resolveOrCreateLead() like
-- every other source.
--
-- Separate tables from whatsapp_messages rather than a `channel` column on
-- it: that table's from_phone/to_phone are NOT NULL and an Instagram
-- correspondent has no phone number at all. Identity is the one thing
-- these two channels genuinely do not share.

-- Added here and deliberately not used anywhere in this transaction:
-- Postgres allows ALTER TYPE ... ADD VALUE inside a transaction block
-- (12+), but the new label cannot be referenced until it commits. The
-- policies below never mention it, so this is safe; a policy comparing
-- source = 'instagram' in this same file would not be.
alter type webhook_source add value if not exists 'instagram';--> statement-breakpoint

create type instagram_message_status as enum ('queued', 'sent', 'failed', 'received');--> statement-breakpoint

create table instagram_conversations (
  id uuid primary key default gen_random_uuid(),
  -- Meta's Instagram-scoped user id (IGSID). Not the handle: a handle
  -- changes, is not always available, and cannot be messaged.
  ig_user_id text not null,
  username text,
  name text,
  profile_pic_url text,
  -- set null, not cascade: if a lead is ever hard-deleted the
  -- conversation still happened, and losing the transcript is worse.
  lead_id uuid references leads(id) on delete set null,
  assigned_to uuid references profiles(id) on delete set null,
  last_message_at timestamptz,
  -- The clock that matters: Meta only allows a reply within 24 hours of
  -- the last inbound message. Stored rather than derived so the inbox can
  -- disable the reply box without scanning the thread.
  last_inbound_at timestamptz,
  unread_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);--> statement-breakpoint

create unique index instagram_conversations_ig_user_id_uq on instagram_conversations (ig_user_id);--> statement-breakpoint
create index instagram_conversations_last_message_idx on instagram_conversations (last_message_at desc);--> statement-breakpoint
create index instagram_conversations_lead_idx on instagram_conversations (lead_id);--> statement-breakpoint

create table instagram_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references instagram_conversations(id) on delete cascade,
  direction interaction_direction not null,
  ig_message_id text,
  body text,
  attachment_type text,
  attachment_url text,
  reply_to_story text,
  status instagram_message_status not null default 'received',
  error_message text,
  sent_by uuid references profiles(id) on delete set null,
  sent_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz
);--> statement-breakpoint

-- The idempotency key. Meta retries any non-2xx, and a retry must not
-- double-post a message into a counsellor's thread.
create unique index instagram_messages_ig_message_id_uq on instagram_messages (ig_message_id);--> statement-breakpoint
create index instagram_messages_conversation_idx on instagram_messages (conversation_id, sent_at);--> statement-breakpoint

alter table instagram_conversations enable row level security;--> statement-breakpoint
alter table instagram_messages enable row level security;--> statement-breakpoint

/*
  Who can see a DM.

  A converted conversation inherits its lead's visibility, exactly like
  whatsapp_messages: a counsellor sees their own leads', a centre head
  their centre's, admins everything.

  An UNCONVERTED one is visible to anybody holding whatsapp.read at any
  scope, and that is a deliberate decision rather than a loose default. A
  DM is addressed to the institute's own Instagram account, not to a
  counsellor — there is no owner to scope it by yet, and somebody has to
  answer it. Scoping an unassigned DM to `own` would make the inbox empty
  for precisely the people who work it. Once it is assigned, or converted,
  normal scoping takes over.

  Schema-qualified `private.` helpers (migration 0077): a NEW policy
  writing the bare name fails at migration time with "function does not
  exist", which is the intended, loud failure.
*/
create policy instagram_conversations_select on instagram_conversations for select
  to authenticated
  using (
    (
      instagram_conversations.lead_id is not null
      and exists (
        select 1 from leads l
        where l.id = instagram_conversations.lead_id
          and private.can_access_center('whatsapp.read', l.center_id, l.assigned_to)
      )
    )
    or (
      instagram_conversations.lead_id is null
      and private.auth_scope('whatsapp.read') is not null
    )
  );--> statement-breakpoint

-- Assigning a conversation, marking it read, and linking it to a lead are
-- all updates. Gated on whatsapp.read rather than a new primitive: being
-- allowed to work the inbox is what this is, and inventing
-- `instagram.assign` would be a permission nobody would ever set
-- differently.
create policy instagram_conversations_update on instagram_conversations for update
  to authenticated
  using (
    (
      instagram_conversations.lead_id is not null
      and exists (
        select 1 from leads l
        where l.id = instagram_conversations.lead_id
          and private.can_access_center('whatsapp.read', l.center_id, l.assigned_to)
      )
    )
    or (
      instagram_conversations.lead_id is null
      and private.auth_scope('whatsapp.read') is not null
    )
  );--> statement-breakpoint

-- No INSERT policy: a conversation only ever starts from an inbound
-- webhook, which runs on the direct db client (CLAUDE.md non-negotiable
-- #3 — service-role in webhooks and cron only). Nobody creates one from a
-- browser, so there is no policy to get wrong.

create policy instagram_messages_select on instagram_messages for select
  to authenticated
  using (exists (
    select 1 from instagram_conversations c
    where c.id = instagram_messages.conversation_id
      and (
        (
          c.lead_id is not null
          and exists (
            select 1 from leads l
            where l.id = c.lead_id
              and private.can_access_center('whatsapp.read', l.center_id, l.assigned_to)
          )
        )
        or (c.lead_id is null and private.auth_scope('whatsapp.read') is not null)
      )
  ));--> statement-breakpoint

-- Sending needs whatsapp.send, and the sender must be recorded as
-- themselves — the same shape as audit_log's actor check in 0077,
-- `(select auth.uid())` included: a bare call is re-evaluated per row,
-- which the Supabase linter flags and which costs real time on a long
-- thread. A reply is a two-step write under this boundary (insert
-- 'queued', call Meta, update to 'sent'/'failed'), which is why update is
-- allowed too.
create policy instagram_messages_insert on instagram_messages for insert
  to authenticated
  with check (
    instagram_messages.sent_by = (select auth.uid())
    and private.auth_scope('whatsapp.send') is not null
    and exists (
      select 1 from instagram_conversations c
      where c.id = instagram_messages.conversation_id
        and (
          (
            c.lead_id is not null
            and exists (
              select 1 from leads l
              where l.id = c.lead_id
                and private.can_access_center('whatsapp.send', l.center_id, l.assigned_to)
            )
          )
          or (c.lead_id is null and private.auth_scope('whatsapp.send') is not null)
        )
    )
  );--> statement-breakpoint

create policy instagram_messages_update on instagram_messages for update
  to authenticated
  using (
    instagram_messages.sent_by = (select auth.uid())
    and private.auth_scope('whatsapp.send') is not null
  );--> statement-breakpoint

-- Nothing here is ever hard-deleted, so no DELETE policy for anyone.

comment on table instagram_conversations is
  'An Instagram DM thread. lead_id is null until a counsellor presses Convert to lead — a DM deliberately does not create a lead on arrival. See docs/DECISIONS.md 2026-10-04.';
comment on column instagram_conversations.last_inbound_at is
  'The last time they wrote. Meta only allows a reply within 24 hours of it.';

-- A converted DM needs a source to be filed under, and `lead_source` is
-- admin-editable data rather than an enum — so this is an insert, not an
-- ALTER TYPE. Guarded, because an admin may well have added it by hand
-- already while waiting for this.
insert into dropdown_options (category, value, label, sort_order)
select 'lead_source', 'instagram', 'Instagram', 95
where not exists (
  select 1 from dropdown_options where category = 'lead_source' and value = 'instagram'
);
