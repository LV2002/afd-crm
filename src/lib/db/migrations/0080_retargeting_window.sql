-- How far back the retargeting audiences reach.
--
-- The daily sync (Meta Custom Audiences, Google Customer Match) had no
-- recency rule at all: every consenting lead the CRM had ever held stayed
-- in the live ad audience forever. That is not only money — somebody who
-- enquired about a 2024 batch, sat their exam and moved on is a person the
-- institute keeps paying to show course ads to, about a course they no
-- longer want.
--
-- 180 days is the asked-for default ("my last 6 months of leads"). A
-- column rather than a constant because it is exactly the sort of number
-- an admin has an opinion about and a marketing agency changes twice a
-- year — CLAUDE.md § "Configuration is data, not code". Zero means no
-- cutoff, i.e. the behaviour this replaces, for an institute that genuinely
-- wants every lead ever.
alter table org_settings
  add column if not exists retargeting_window_days integer not null default 180;

comment on column org_settings.retargeting_window_days is
  'Leads this many days old or newer are kept in the ad platforms'' retargeting audiences; 0 means no cutoff. Measured from the LATER of the lead''s creation and its last activity — see lib/integrations/audience-sync.ts.';
