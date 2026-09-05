-- Two new resting places for a broadcast, added on their own because
-- Postgres will not let a transaction both create an enum value and use
-- it. The columns and the constraint that reference them are the next
-- migration.
--
-- `scheduled` — written now, leaves later. The sweep promotes it to
--   `sending` once its moment arrives, so "queued to send" and "queued
--   but not yet due" stay distinguishable; folding them together would
--   have the sweep send everything the instant it was composed.
--
-- `cancelled` — stopped by a person. Distinct from `failed`, which means
--   Meta refused it: one is a decision and the other is a fault, and a
--   report that cannot tell them apart is a report nobody trusts. The
--   sweep only ever picks up recipients whose broadcast is `sending`, so
--   moving a row here halts it — mid-send included.
alter type whatsapp_broadcast_status add value if not exists 'scheduled';--> statement-breakpoint
alter type whatsapp_broadcast_status add value if not exists 'cancelled';
