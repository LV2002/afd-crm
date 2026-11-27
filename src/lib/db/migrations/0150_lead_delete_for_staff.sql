-- Counsellors (their own leads), centre heads (their centre) and co-admins (all)
-- may delete a lead. Deleting stays soft with a required reason, and
-- the grants are ordinary role_permissions rows an admin can change under
-- Settings -> Roles. Existing grants are left as they are.
INSERT INTO "role_permissions" ("role_id", "permission_code", "scope")
SELECT r.id, 'lead.delete', g.scope::permission_scope
FROM "roles" r
JOIN (VALUES ('counsellor', 'own'), ('center_head', 'center'), ('co_admin', 'all')) AS g(code, scope) ON g.code = r.code
WHERE EXISTS (SELECT 1 FROM "permissions" p WHERE p.code = 'lead.delete')
ON CONFLICT ("role_id", "permission_code") DO NOTHING;
