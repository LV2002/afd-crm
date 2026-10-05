-- WhatsApp Coexistence: the Business app on a phone and the Cloud API on
-- the same number, at the same time.
--
-- This is the answer to the thing the CRM has been working around since
-- Phase 5. AFD's real enquiries arrive on the counsellors' own WhatsApp
-- Business apps and were typed into the CRM by hand; the API number only
-- sent campaigns and received the replies. Coexistence lets a
-- counsellor's own number join the account, keep its app, and mirror
-- every conversation into the CRM — so the typing stops.
--
-- Meta sends three extra webhook fields for such a number:
-- `smb_message_echoes` (what the counsellor sent from the phone),
-- `history` (up to 180 days of past chats, in chunks) and
-- `smb_app_state_sync` (the phone's contacts, which this CRM
-- deliberately ignores — see the handler).
--
-- One number was a `phone_number_id` in the credentials table. Several
-- numbers, each owned by a different person and each with its own rule
-- about whether an inbound message may create a lead, is a table.
create type whatsapp_number_mode as enum ('api', 'coexistence');--> statement-breakpoint

create table if not exists whatsapp_numbers (
  id uuid primary key default gen_random_uuid(),
  -- Meta's id for the number: what every webhook identifies it by.
  phone_number_id text not null,
  display_phone_number text,
  label text not null,
  mode whatsapp_number_mode not null default 'api',
  -- Whose phone, for a coexistence number. Echoed messages are
  -- attributed to them, and a lead created from an inbound message is
  -- assigned to them: the person already holding the conversation is the
  -- right owner, and routing it through the rules engine to land on
  -- somebody else would be actively wrong.
  counsellor_id uuid references profiles(id) on delete set null,
  -- Whether an inbound message from a number nobody has entered yet
  -- creates a lead. False on the broadcast number (a reply there is
  -- somebody who pressed a button on a campaign); true on a
  -- counsellor's own (a stranger asking about NIFT coaching is the
  -- highest-intent enquiry the institute gets).
  creates_leads boolean not null default false,
  history_completed_at timestamptz,
  history_message_count integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);--> statement-breakpoint

create unique index if not exists whatsapp_numbers_phone_number_id_uq
  on whatsapp_numbers (phone_number_id);--> statement-breakpoint

create trigger set_updated_at before update on whatsapp_numbers
  for each row execute function set_updated_at();--> statement-breakpoint

alter table whatsapp_numbers enable row level security;--> statement-breakpoint

-- Readable by anybody who may read WhatsApp at all, because the Chats
-- screens need to say which number a message came in on. Writes are
-- admin-only and go through the Settings screen's server actions on the
-- direct client, which check `settings.manage` themselves — there is no
-- insert/update/delete policy for any authenticated role.
create policy whatsapp_numbers_select on whatsapp_numbers for select
  to authenticated
  using (private.auth_scope('whatsapp.read') is not null);
