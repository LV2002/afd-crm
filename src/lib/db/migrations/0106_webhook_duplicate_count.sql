-- Make a repeated delivery visible instead of silent.
--
-- A sender that posts the same submission twice (a retry, or a form that
-- reuses an id) is answered "duplicate" and nothing is stored -- by design,
-- so a retry never becomes a second lead. But it also meant that a sender
-- whose ids COLLIDE (every submission carrying the same id) lost leads with
-- no trace anywhere: the CRM said "ok" and wrote nothing.
--
-- These count how often a delivery was seen again after it was stored, so
-- the delivery log can say "this arrived 5 more times and was ignored".
alter table webhook_events add column if not exists duplicate_count integer not null default 0;--> statement-breakpoint
alter table webhook_events add column if not exists last_duplicate_at timestamptz;
