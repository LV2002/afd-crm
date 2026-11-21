-- Working tools for the WhatsApp inbox: saved replies, labels on chats,
-- private notes, and an open/resolved status per conversation.

create table if not exists whatsapp_saved_replies (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  -- Typed after a slash in the composer: /fees
  shortcut text,
  body text not null,
  sort_order integer not null default 0,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  deleted_at timestamptz
);--> statement-breakpoint
create unique index if not exists whatsapp_saved_replies_shortcut_uq on whatsapp_saved_replies (lower(shortcut)) where deleted_at is null and shortcut is not null;--> statement-breakpoint

create table if not exists whatsapp_labels (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  colour text not null default 'slate',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);--> statement-breakpoint
create unique index if not exists whatsapp_labels_name_uq on whatsapp_labels (lower(name)) where deleted_at is null;--> statement-breakpoint

-- One row per phone number once somebody has acted on the conversation.
create table if not exists whatsapp_conversations (
  phone text primary key,
  status text not null default 'open' check (status in ('open', 'resolved')),
  resolved_at timestamptz,
  resolved_by uuid references profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);--> statement-breakpoint

create table if not exists whatsapp_conversation_labels (
  phone text not null,
  label_id uuid not null references whatsapp_labels(id) on delete cascade,
  added_by uuid references profiles(id) on delete set null,
  added_at timestamptz not null default now(),
  primary key (phone, label_id)
);--> statement-breakpoint

-- Private to staff: never sent to the person.
create table if not exists whatsapp_notes (
  id uuid primary key default gen_random_uuid(),
  phone text not null,
  lead_id uuid references leads(id) on delete set null,
  body text not null,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);--> statement-breakpoint
create index if not exists whatsapp_notes_phone_idx on whatsapp_notes (phone, created_at);--> statement-breakpoint

alter table whatsapp_saved_replies enable row level security;--> statement-breakpoint
alter table whatsapp_labels enable row level security;--> statement-breakpoint
alter table whatsapp_conversations enable row level security;--> statement-breakpoint
alter table whatsapp_conversation_labels enable row level security;--> statement-breakpoint
alter table whatsapp_notes enable row level security;--> statement-breakpoint
-- Read-only through the browser client; every write goes through a checked
-- server action, after confirming the caller can see that conversation.
create policy whatsapp_saved_replies_select on whatsapp_saved_replies for select to authenticated
  using (deleted_at is null and private.auth_scope('whatsapp.read') is not null);--> statement-breakpoint
create policy whatsapp_labels_select on whatsapp_labels for select to authenticated
  using (deleted_at is null and private.auth_scope('whatsapp.read') is not null);--> statement-breakpoint
create policy whatsapp_conversations_select on whatsapp_conversations for select to authenticated
  using (private.auth_scope('whatsapp.read') is not null);--> statement-breakpoint
create policy whatsapp_conversation_labels_select on whatsapp_conversation_labels for select to authenticated
  using (private.auth_scope('whatsapp.read') is not null);--> statement-breakpoint
create policy whatsapp_notes_select on whatsapp_notes for select to authenticated
  using (private.auth_scope('whatsapp.read') is not null);--> statement-breakpoint

insert into whatsapp_labels (name, colour, sort_order)
select v.name, v.colour, v.ord from (values
  ('Interested', 'green', 0),
  ('Fee query', 'amber', 1),
  ('Demo class', 'blue', 2),
  ('Follow up', 'violet', 3),
  ('Wrong number', 'slate', 4)
) as v(name, colour, ord)
where not exists (select 1 from whatsapp_labels);
