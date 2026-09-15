-- Which dashboard widgets each role sees.
--
-- docs/01-DATA-MODEL.md named `dashboard_layouts` from the first week and
-- nothing was ever built, so `dashboard/page.tsx` branched on hardcoded
-- permission checks: an admin who wanted the accounts team to stop seeing
-- the pipeline card, or the counsellors' day to sit above everything else,
-- had nowhere to say so. CLAUDE.md § 10's test — "could this be deployed
-- for a different company by changing only database contents?" — was
-- failing on the first screen anybody sees.
--
-- The widget implementations stay in code, deliberately (CLAUDE.md's
-- "admin composes them; doesn't author new ones"). `widget_key` is a plain
-- text key into that registry rather than a foreign key to a widgets
-- table: the registry really does live in code, and a key that no longer
-- exists is ignored by the resolver, so deleting a widget from the
-- codebase cannot break a saved layout.
create table if not exists dashboard_layouts (
  id uuid primary key default gen_random_uuid(),
  role_id uuid not null references roles(id) on delete cascade,
  widget_key text not null,
  sort_order integer not null default 0,
  is_visible boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  constraint dashboard_layouts_role_widget_uq unique (role_id, widget_key)
);--> statement-breakpoint

create index if not exists dashboard_layouts_role_idx on dashboard_layouts (role_id);--> statement-breakpoint

alter table dashboard_layouts enable row level security;--> statement-breakpoint

-- Everybody reads. A person's own dashboard has to be able to load its
-- layout, and there is nothing in a row here worth hiding: it says which
-- cards a role sees, not what is on them. The widgets themselves still
-- read through their own tables' RLS, so a layout row can never reveal
-- data — the worst an over-generous layout can do is show an empty card,
-- and the resolver will not even do that (lib/dashboard/resolve-layout.ts
-- treats permission as a floor an admin can subtract from, never add to).
create policy dashboard_layouts_select on dashboard_layouts for select
  to authenticated
  using (true);--> statement-breakpoint

-- Arranging somebody else's dashboard is an administration act.
create policy dashboard_layouts_insert on dashboard_layouts for insert
  to authenticated
  with check (auth_scope('settings.manage') = 'all');--> statement-breakpoint

create policy dashboard_layouts_update on dashboard_layouts for update
  to authenticated
  using (auth_scope('settings.manage') = 'all')
  with check (auth_scope('settings.manage') = 'all');--> statement-breakpoint

-- Hard delete is allowed here, and only here among the configuration
-- tables, because a layout row carries no history worth keeping: deleting
-- every row for a role means "no arrangement", which is a real and useful
-- state (the role falls back to its permissions) rather than a loss.
create policy dashboard_layouts_delete on dashboard_layouts for delete
  to authenticated
  using (auth_scope('settings.manage') = 'all');
