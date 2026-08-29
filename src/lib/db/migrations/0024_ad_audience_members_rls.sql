-- ad_audience_members: same shape as ad_spend_daily -- admin-visible
-- (report.org), no insert/update/delete policy for any authenticated
-- role. Only the retargeting sync crons (direct db client) write here.

alter table ad_audience_members enable row level security;

create policy ad_audience_members_select on ad_audience_members for select
  to authenticated
  using (auth_scope('report.org') = 'all');
