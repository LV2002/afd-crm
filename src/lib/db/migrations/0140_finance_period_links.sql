ALTER TABLE "finance_transactions" ADD COLUMN "period" text;--> statement-breakpoint

-- Which categories ask "whose is this?" when a bank line is categorised.
-- Configuration, not code: metadata.links is "enrolment" (a student's fee,
-- recorded on their profile), "student" (tagged to a student, no fee
-- record) or "employee" (pays a payslip); metadata.asksPeriod offers a
-- "for the month of" field. An admin changes these on the dropdown rows.
INSERT INTO "dropdown_options" ("category", "value", "label", "sort_order", "metadata")
SELECT v.category, v.value, v.label, v.sort_order, v.metadata
FROM (VALUES
  ('finance_income_category', 'course_fees', 'Course Fees', 0, '{"links":"enrolment"}'::jsonb),
  ('finance_income_category', 'pre_booking', 'Pre-booking / Token', 1, '{"links":"enrolment"}'::jsonb),
  ('finance_expense_category', 'gst_tax', 'GST & Taxes', 100, '{"asksPeriod":true}'::jsonb)
) AS v(category, value, label, sort_order, metadata)
-- A brand-new database has no categories yet: the seed creates them, with these settings.
WHERE EXISTS (SELECT 1 FROM "dropdown_categories" c WHERE c."key" = v.category)
ON CONFLICT ("category", "value") DO NOTHING;--> statement-breakpoint

UPDATE "dropdown_options" SET "metadata" = coalesce("metadata", '{}'::jsonb) || '{"links":"student"}'::jsonb
WHERE "category" = 'finance_income_category' AND "value" IN ('workshop', 'late_fee');--> statement-breakpoint

UPDATE "dropdown_options" SET "metadata" = coalesce("metadata", '{}'::jsonb) || '{"links":"employee"}'::jsonb
WHERE "category" = 'finance_expense_category' AND "value" = 'salaries';--> statement-breakpoint

UPDATE "dropdown_options" SET "metadata" = coalesce("metadata", '{}'::jsonb) || '{"asksPeriod":true}'::jsonb
WHERE "category" = 'finance_expense_category' AND "value" IN ('rent', 'google_ads', 'meta_ads', 'electricity', 'mobile_wifi', 'software');
