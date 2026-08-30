-- RLS for the integrations foundation: credential storage, webhook
-- ingestion, and ad spend. See docs/DECISIONS.md for the reasoning behind
-- each boundary below.

alter table integration_credentials enable row level security;
alter table webhook_events enable row level security;
alter table ad_spend_daily enable row level security;

-- integration_credentials: NO policies for any authenticated role, on any
-- command -- same shape as `permissions` (docs/DECISIONS.md). Nobody
-- should ever be able to read a credential back through the browser, even
-- encrypted; only the direct db client (src/lib/integrations/credentials.ts,
-- same trust boundary as resolveOrCreateLead()/config import) touches this
-- table. RLS being enabled with zero policies means "denied for everyone
-- except the row owner" -- and Postgres's `owner` role bypasses RLS
-- entirely, which is exactly the direct-client bypass this needs.

-- webhook_events: admin-only read (raw payloads may carry lead PII before
-- it's ever resolved into a lead), no insert/update/delete policy for any
-- authenticated role -- only a webhook handler running on the direct db
-- client writes here, per CLAUDE.md non-negotiable #9.
create policy webhook_events_select on webhook_events for select
  to authenticated
  using (auth_scope('settings.manage') = 'all');

-- ad_spend_daily: org-wide by nature (a campaign isn't scoped to one
-- centre the way a lead is), so gated on report.org rather than a
-- per-centre check. No insert/update/delete policy for any authenticated
-- role -- only the nightly sync cron (direct db client) writes here.
create policy ad_spend_daily_select on ad_spend_daily for select
  to authenticated
  using (auth_scope('report.org') = 'all');
