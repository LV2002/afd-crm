-- Every `npm run db:seed` run has been inserting a fresh duplicate row per
-- center name, because centers had no unique constraint for
-- `.onConflictDoNothing()` to match against in seed.ts's seedCenters().
-- This merges any existing duplicates (oldest row per name wins as the
-- canonical row, since it's the one everything already assigned before the
-- second seed run pointed elsewhere) before adding the constraint that
-- makes it impossible going forward.
DO $$
DECLARE
  dup RECORD;
  canonical_id uuid;
  other_id uuid;
BEGIN
  FOR dup IN
    SELECT name, (array_agg(id ORDER BY created_at ASC))[1] AS canonical_id
    FROM centers
    WHERE deleted_at IS NULL
    GROUP BY name
    HAVING count(*) > 1
  LOOP
    canonical_id := dup.canonical_id;

    FOR other_id IN
      SELECT id FROM centers WHERE name = dup.name AND id <> canonical_id
    LOOP
      -- Repoint straightforward FK references (no other uniqueness to
      -- collide with).
      UPDATE leads SET center_id = canonical_id WHERE center_id = other_id;
      UPDATE assignment_history SET from_center = canonical_id WHERE from_center = other_id;
      UPDATE assignment_history SET to_center = canonical_id WHERE to_center = other_id;

      -- user_centers has its own (user_id, center_id) primary key: drop the
      -- link to the duplicate wherever the user is already linked to the
      -- canonical row, then repoint the rest.
      DELETE FROM user_centers uc
      WHERE uc.center_id = other_id
        AND EXISTS (
          SELECT 1 FROM user_centers c2
          WHERE c2.user_id = uc.user_id AND c2.center_id = canonical_id
        );
      UPDATE user_centers SET center_id = canonical_id WHERE center_id = other_id;

      -- business_hours has a (center_id, day_of_week) unique index: drop
      -- the duplicate's row wherever the canonical already has that day.
      DELETE FROM business_hours bh
      WHERE bh.center_id = other_id
        AND EXISTS (
          SELECT 1 FROM business_hours c2
          WHERE c2.center_id = canonical_id AND c2.day_of_week = bh.day_of_week
        );
      UPDATE business_hours SET center_id = canonical_id WHERE center_id = other_id;

      -- holidays has a (center_id, date) unique index: same pattern.
      DELETE FROM holidays h
      WHERE h.center_id = other_id
        AND EXISTS (
          SELECT 1 FROM holidays c2
          WHERE c2.center_id = canonical_id AND c2.date = h.date
        );
      UPDATE holidays SET center_id = canonical_id WHERE center_id = other_id;

      DELETE FROM centers WHERE id = other_id;
    END LOOP;
  END LOOP;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX "centers_name_uq" ON "centers" USING btree ("name");
