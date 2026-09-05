-- WhatsApp automation flows.
--
-- A flow is a numbered list of steps a lead walks down — send a
-- template, wait, send another, wait for their reply and branch on which
-- button they pressed. Leon asked for this in AiSensy's terms and it is
-- the largest single thing on the backlog.
--
-- Four tables: the flow, its steps, one run per lead, and what actually
-- happened on that run. The last one exists because an automation nobody
-- can audit is an automation nobody trusts: "why did this student get
-- that message?" has to have an answer, and the flow definition alone
-- cannot give it once somebody has edited the flow since.

create table if not exists whatsapp_flows (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  trigger_type text not null,
  trigger_config jsonb,
  -- Off by default, deliberately. A flow is written over several edits,
  -- and a half-written one that starts messaging people the moment its
  -- first step is saved is the worst default available.
  is_active boolean not null default false,
  -- Null means every centre. Set to keep a Kannur sequence off Kochi.
  center_id uuid references centers(id) on delete cascade,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  deleted_at timestamptz
);--> statement-breakpoint

create index if not exists whatsapp_flows_trigger_idx on whatsapp_flows (trigger_type);--> statement-breakpoint

create table if not exists whatsapp_flow_steps (
  id uuid primary key default gen_random_uuid(),
  flow_id uuid not null references whatsapp_flows(id) on delete cascade,
  -- The step's public name: branches jump to this number and it is shown
  -- on screen. Renumbering an existing flow would silently redirect every
  -- branch pointing at it, so the UI appends and never reflows.
  position integer not null,
  kind text not null,
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  constraint whatsapp_flow_steps_position_positive check (position >= 1)
);--> statement-breakpoint

create unique index if not exists whatsapp_flow_steps_flow_position_uq
  on whatsapp_flow_steps (flow_id, position);--> statement-breakpoint

create table if not exists whatsapp_flow_runs (
  id uuid primary key default gen_random_uuid(),
  flow_id uuid not null references whatsapp_flows(id) on delete cascade,
  lead_id uuid not null references leads(id) on delete cascade,
  status text not null default 'running',
  current_step_id uuid references whatsapp_flow_steps(id) on delete set null,
  -- Set only while parked on a wait_for_reply step. This is what the
  -- inbound webhook looks for when a message arrives.
  awaiting_step_id uuid references whatsapp_flow_steps(id) on delete set null,
  -- When the sweep should look at this run again. The whole scheduling
  -- mechanism, and the reason a parked run costs nothing.
  wake_at timestamptz,
  stop_reason text,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);--> statement-breakpoint

-- ONE live run per lead per flow. Without this a lead who re-enters a
-- stage twice in a week gets two concurrent copies of the same sequence,
-- which reads to them as an institute that has lost track of who they
-- are. The index is the enforcement; the trigger code trusts it.
create unique index if not exists whatsapp_flow_runs_live_uq
  on whatsapp_flow_runs (flow_id, lead_id)
  where status in ('running', 'waiting');--> statement-breakpoint

create index if not exists whatsapp_flow_runs_wake_idx
  on whatsapp_flow_runs (wake_at)
  where status in ('running', 'waiting');--> statement-breakpoint

create index if not exists whatsapp_flow_runs_awaiting_idx
  on whatsapp_flow_runs (lead_id)
  where awaiting_step_id is not null;--> statement-breakpoint

create table if not exists whatsapp_flow_run_events (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references whatsapp_flow_runs(id) on delete cascade,
  step_id uuid references whatsapp_flow_steps(id) on delete set null,
  kind text not null,
  detail text,
  created_at timestamptz not null default now()
);--> statement-breakpoint

create index if not exists whatsapp_flow_run_events_run_idx
  on whatsapp_flow_run_events (run_id, created_at);--> statement-breakpoint

-- RLS, same shape as whatsapp_broadcasts (migration 0028): gated on the
-- whatsapp.campaign primitive at 'all' scope, because a flow is org-wide
-- campaign machinery with no per-centre concept of its own to check
-- against — the optional center_id narrows who a flow REACHES, not who
-- may edit it.
--
-- No UPDATE or DELETE policy for authenticated roles on the run tables:
-- a run's progress is the engine's to write, on the direct client, same
-- trust boundary as every other cron in this codebase. An admin writes a
-- flow; they do not hand-edit somebody's position in it.
alter table whatsapp_flows enable row level security;--> statement-breakpoint
alter table whatsapp_flow_steps enable row level security;--> statement-breakpoint
alter table whatsapp_flow_runs enable row level security;--> statement-breakpoint
alter table whatsapp_flow_run_events enable row level security;--> statement-breakpoint

create policy whatsapp_flows_select on whatsapp_flows for select
  to authenticated
  using (auth_scope('whatsapp.campaign') = 'all');--> statement-breakpoint

create policy whatsapp_flows_write on whatsapp_flows for all
  to authenticated
  using (auth_scope('whatsapp.campaign') = 'all')
  with check (auth_scope('whatsapp.campaign') = 'all');--> statement-breakpoint

create policy whatsapp_flow_steps_select on whatsapp_flow_steps for select
  to authenticated
  using (auth_scope('whatsapp.campaign') = 'all');--> statement-breakpoint

create policy whatsapp_flow_steps_write on whatsapp_flow_steps for all
  to authenticated
  using (auth_scope('whatsapp.campaign') = 'all')
  with check (auth_scope('whatsapp.campaign') = 'all');--> statement-breakpoint

create policy whatsapp_flow_runs_select on whatsapp_flow_runs for select
  to authenticated
  using (auth_scope('whatsapp.campaign') = 'all');--> statement-breakpoint

create policy whatsapp_flow_run_events_select on whatsapp_flow_run_events for select
  to authenticated
  using (auth_scope('whatsapp.campaign') = 'all');
