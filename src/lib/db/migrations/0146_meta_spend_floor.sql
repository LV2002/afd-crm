-- Meta ad spend before 1 October 2026 is not kept (owner's decision). The
-- sync is clamped to the same floor in code (META_SPEND_FLOOR).
WITH gone AS (
  DELETE FROM "ad_spend_daily" WHERE "platform" = 'meta' AND "date" < DATE '2026-10-01' RETURNING 1
)
INSERT INTO "audit_log" ("action", "entity_type", "after")
SELECT 'ad_spend.trim_before_floor', 'ad_spend_daily',
       jsonb_build_object('platform', 'meta', 'before', '2026-10-01', 'rowsDeleted', count(*))
FROM gone;
