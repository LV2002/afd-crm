-- Indexes on the foreign keys the application actually searches by.
--
-- Postgres indexes a primary key automatically and a foreign key not at
-- all. An audit of the schema found 65 single-column foreign keys with no
-- index behind them, which sounds alarming and mostly is not: the majority
-- are `created_by` / `recorded_by` / `reviewed_by` columns that exist to
-- answer "who did this?" about a row already in hand. Nothing ever
-- searches by them, and an index on a column nobody filters by is pure
-- cost — slower writes, more to keep in memory, more to vacuum.
--
-- These thirteen are the ones the codebase genuinely queries by, counted
-- from real call sites. Left deliberately unindexed: every `*_by` actor
-- column, the flow-runner's step pointers (the sweep finds work by
-- `wake_at`, never by step), and the small configuration tables where a
-- sequential scan of a dozen rows beats an index lookup.
--
-- The other thing an index on a foreign key buys: deleting a parent row
-- makes Postgres check every child table, and without an index that check
-- is a full scan. This system soft-deletes almost everything, so that
-- matters less here than it usually would — but `lead_identifiers` and
-- `merge_review_queue` do cascade from `leads`, and a merge touches both.

-- The lead detail page loads tasks for one lead on every open.
create index if not exists tasks_lead_idx on tasks (lead_id);--> statement-breakpoint

-- Identity resolution reads these for every single lead that enters the
-- system, from every source. The hottest of the lot.
create index if not exists lead_identifiers_lead_idx on lead_identifiers (lead_id);--> statement-breakpoint

-- The lead timeline, and the "why is this lead mine?" question.
create index if not exists assignment_history_lead_idx on assignment_history (lead_id);--> statement-breakpoint

-- Merge review looks up both sides of a suspected duplicate.
create index if not exists merge_review_queue_lead_idx on merge_review_queue (lead_id);--> statement-breakpoint
create index if not exists merge_review_queue_candidate_idx on merge_review_queue (candidate_lead_id);--> statement-breakpoint

-- The broadcast sweep walks recipients lead by lead.
create index if not exists whatsapp_broadcast_recipients_lead_idx
  on whatsapp_broadcast_recipients (lead_id);--> statement-breakpoint

-- Retargeting audience diffing, on every sync.
create index if not exists ad_audience_members_lead_idx on ad_audience_members (lead_id);--> statement-breakpoint

-- Referrals: "who did this person send us?" on the lead page, and the
-- whole of Insights → Referrals. Partial because the column is null for
-- most leads — an index over the nulls would be mostly dead weight.
create index if not exists leads_referred_by_idx on leads (referred_by_lead_id)
  where referred_by_lead_id is not null;--> statement-breakpoint

-- Receipt lookup from a payment, and the finance ledger's link back to
-- the payment that produced an entry.
create index if not exists receipts_payment_idx on receipts (payment_id);--> statement-breakpoint
create index if not exists finance_transactions_payment_idx on finance_transactions (payment_id)
  where payment_id is not null;--> statement-breakpoint

-- Batch screens: who is in this batch.
create index if not exists students_current_batch_idx on students (current_batch_id)
  where current_batch_id is not null;--> statement-breakpoint

-- `user_centers` is read on every permission check that is centre-scoped,
-- and `notifications`/`batches` are filtered by centre on their screens.
create index if not exists user_centers_center_idx on user_centers (center_id);--> statement-breakpoint
create index if not exists notifications_center_idx on notifications (center_id)
  where center_id is not null;--> statement-breakpoint
create index if not exists batches_center_idx on batches (center_id);
