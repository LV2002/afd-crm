-- An account's opening balance is struck on a date; only entries after it add
-- to the balance. Earlier ones (a previous year's fees entered for the
-- record) still count in the income reports.
alter table finance_accounts add column if not exists opening_as_of date;

-- Who may see which colleagues was decided only by `users.manage`, an
-- administration permission. A manager who can open a counsellor's numbers
-- (report.center / report.org) but has no user administration saw an empty
-- team: the sidebar list and the Dashboard's counsellor table both read
-- profiles. Seeing the people whose numbers you are allowed to open now
-- follows the permission that lets you open them. Permissive policies are
-- ORed with the existing ones, so nothing anyone could already see goes away.
drop policy if exists profiles_select_managers on profiles;
create policy profiles_select_managers on profiles for select
  to authenticated
  using (
    private.auth_scope('report.org') = 'all'
    or private.auth_scope('report.center') = 'all'
    or (
      private.auth_scope('report.center') = 'center'
      and exists (
        select 1 from user_centers uc
        where uc.user_id = profiles.id
          and uc.center_id = any (private.auth_center_ids())
      )
    )
  );

drop policy if exists user_centers_select_managers on user_centers;
create policy user_centers_select_managers on user_centers for select
  to authenticated
  using (
    private.auth_scope('report.org') = 'all'
    or private.auth_scope('report.center') = 'all'
    or (
      private.auth_scope('report.center') = 'center'
      and center_id = any (private.auth_center_ids())
    )
  );
