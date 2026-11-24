-- Statement lines paired in Reconciliation (automatically or by hand), or
-- accepted there as having no entry, were left marked "pending", so they kept
-- appearing under "To categorise" on the Bank import screen. Mark them as
-- dealt with. The code now does this at the moment of pairing; this fixes the
-- ones already stranded.
UPDATE "bank_statement_lines" l
SET "status" = 'posted', "resolved_at" = coalesce(l."resolved_at", now())
WHERE l."status" = 'pending'
  AND EXISTS (
    SELECT 1 FROM "bank_matches" m
    WHERE m."bank_line_id" = l."id" AND m."active" AND m."transaction_id" IS NOT NULL
  );--> statement-breakpoint

UPDATE "bank_statement_lines" l
SET "status" = 'skipped', "skip_reason" = coalesce(l."skip_reason", (
      SELECT m."note" FROM "bank_matches" m
      WHERE m."bank_line_id" = l."id" AND m."active" AND m."transaction_id" IS NULL
      LIMIT 1
    )), "resolved_at" = coalesce(l."resolved_at", now())
WHERE l."status" = 'pending'
  AND EXISTS (
    SELECT 1 FROM "bank_matches" m
    WHERE m."bank_line_id" = l."id" AND m."active" AND m."transaction_id" IS NULL
  );
