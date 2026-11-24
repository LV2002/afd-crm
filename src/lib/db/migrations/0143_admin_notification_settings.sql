-- Saved notification settings override the shipped defaults, so a change to
-- the defaults alone does not reach an instance that has already saved them.
-- This makes the saved settings match what the admin asked for:
--   * the admin hears about leave and comp-day requests the moment they are made;
--   * the admin is NOT told about payments recorded, reversed or reminded
--     early; they hear about an instalment once it is 30 days late, which is
--     the new payment.overdue_severe event (no saved row: it uses its defaults).
UPDATE "notification_settings" ns
SET "is_enabled" = true,
    "notify_roles" = CASE
      WHEN r.id = ANY (coalesce(ns."notify_roles", '{}'::uuid[])) THEN ns."notify_roles"
      ELSE array_append(coalesce(ns."notify_roles", '{}'::uuid[]), r.id)
    END
FROM "roles" r
WHERE r."code" = 'admin'
  AND ns."event_key" IN ('leave.requested', 'comp.requested')
  AND ns."deleted_at" IS NULL;--> statement-breakpoint

UPDATE "notification_settings" ns
SET "notify_roles" = array_remove(coalesce(ns."notify_roles", '{}'::uuid[]), r.id)
FROM "roles" r
WHERE r."code" = 'admin'
  AND ns."event_key" IN ('payment.overdue', 'payment.recorded', 'payment.reversed')
  AND ns."deleted_at" IS NULL;
