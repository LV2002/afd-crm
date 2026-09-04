-- The AI analyst becomes admin-only, at Leon's instruction: "the AI feature
-- should only be available to admins and co admins."
--
-- The seed grants permissions with an upsert and never revokes, by design —
-- re-running it must not undo a role an admin has deliberately customised.
-- So a grant that should no longer exist has to be removed once, here.
--
-- This is not only a UI preference. The analyst now answers questions about
-- ONE named person — profile, enquiry date, fee plan, payments, whether
-- they are still studying — and those tools refuse anybody without org-wide
-- report access. Leaving `ai.query` on roles that would always be refused
-- would mean a menu item that exists to say no.
--
-- Roles are ordinary editable rows: an admin who wants a centre head to
-- have it again grants it in Settings → Roles, and nothing here stops them.

delete from role_permissions
where permission_code = 'ai.query'
  and role_id in (
    select id from roles where code in ('center_head', 'counsellor', 'academics')
  );
