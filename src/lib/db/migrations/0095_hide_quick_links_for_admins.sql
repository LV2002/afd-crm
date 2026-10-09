-- Quick links took Your day's slot, so it inherits Your day's hiding row.
--
-- Migration 0071 hid `my_numbers` and `my_day` for admin and co-admin,
-- on Leon's instruction that the admin view was right as it was: neither
-- card means anything to somebody with no leads assigned to them. The
-- `my_day` widget has now been replaced in the registry by `quick_links`,
-- and a widget with no row is visible by default — so without this, the
-- next deploy would put a card on the admin dashboard that Leon
-- explicitly asked not to have.
--
-- The stale `my_day` row is left exactly where it is. It names a widget
-- the registry no longer knows, which the resolver ignores, and deleting
-- it would throw away the record of a decision for no gain. If the key
-- ever returns, the row that hides it returns with it.
--
-- `on conflict do nothing`, like 0071: an admin who has already been to
-- Settings → Dashboards and turned this on keeps their choice. A
-- migration must not overrule somebody who has since made a decision.
insert into dashboard_layouts (role_id, widget_key, sort_order, is_visible)
select r.id, 'quick_links', 1, false
from roles r
where r.code in ('admin', 'co_admin')
on conflict (role_id, widget_key) do nothing;
