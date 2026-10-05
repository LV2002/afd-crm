-- Who hears about a platform failure, as a setting rather than a deploy.
--
-- `ALERT_EMAIL_TO` is an environment variable, which means changing who
-- gets told that leads have stopped arriving requires somebody with
-- access to the hosting dashboard. That fails CLAUDE.md's own test for
-- configuration (§10: "could this system be deployed for a completely
-- different company by changing only database contents?") on the one
-- setting whose whole purpose is making sure a person finds out.
--
-- The environment variable still works and still wins nothing: the
-- column is read first, and the variable is the fallback for an
-- installation that has not set it yet.
alter table org_settings add column if not exists alert_email_to text;

comment on column org_settings.alert_email_to is
  'Comma-separated addresses that receive platform failure alerts. Falls back to the ALERT_EMAIL_TO environment variable when null.';
