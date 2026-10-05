-- Webhook endpoints an admin can create, for sources nobody wrote a
-- handler for.
--
-- Before this, every new lead source meant a route handler, a signature
-- scheme and a deploy — so a course platform or a one-off landing page
-- either waited for developer time or kept its leads in a spreadsheet.
-- The `knorish` value sitting unused in `webhook_source` is what that
-- looks like after a year: a dead switch for a handler nobody wrote.
--
-- One generic handler, many rows. Each endpoint has its own unguessable
-- URL, its own signing secret and its own `source` stamped on the
-- enquiries it creates — which is what lets the sources report tell a
-- Knorish purchase from a Google Form.
alter type webhook_source add value if not exists 'custom';--> statement-breakpoint

create table if not exists custom_webhooks (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  -- The random token in the URL. For a sender that cannot sign a request
  -- this is the whole of the authentication, so it is generated, never
  -- typed, and never derived from the name.
  slug text not null,
  -- The lead_source value stamped on every enquiry from this endpoint.
  source text not null,
  sub_source text,
  center_id uuid references centers(id) on delete set null,
  signing_secret text not null,
  require_signature boolean not null default true,
  -- {"phone": ["mob"], "name": ["buyer"]} — extra aliases for a sender
  -- that names a field something the built-in list does not predict.
  field_aliases jsonb,
  is_active boolean not null default true,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);--> statement-breakpoint

create unique index if not exists custom_webhooks_slug_uq on custom_webhooks (slug);--> statement-breakpoint

create trigger set_updated_at before update on custom_webhooks
  for each row execute function set_updated_at();--> statement-breakpoint

-- Which endpoint a delivery arrived on.
--
-- The idempotency key stays `(source, external_id)`: the handler
-- prefixes the sender's own id with this endpoint's uuid, so two feeds
-- that both number their submissions from 1 cannot collide. A partial
-- index would have been a second rule to keep in step with the first.
alter table webhook_events
  add column if not exists custom_webhook_id uuid references custom_webhooks(id) on delete set null;--> statement-breakpoint

create index if not exists webhook_events_custom_webhook_id_idx
  on webhook_events (custom_webhook_id, received_at desc)
  where custom_webhook_id is not null;--> statement-breakpoint

alter table custom_webhooks enable row level security;--> statement-breakpoint

-- Admin-only, and read-only through RLS.
--
-- The signing secret lives in this table, so the same reasoning as
-- `webhook_events` applies: anybody who can read a row can forge a
-- delivery. Writes go through the Settings screen's server actions on the
-- direct client, which re-check `settings.manage` themselves — there is
-- no insert/update/delete policy for any authenticated role, deliberately.
create policy custom_webhooks_select on custom_webhooks for select
  to authenticated
  using (private.auth_scope('settings.manage') = 'all');
