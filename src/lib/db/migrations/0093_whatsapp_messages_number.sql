-- Which of the institute's numbers a message arrived on, or went out from.
--
-- `whatsapp_messages` has never recorded this. It did not need to while
-- there was one number: everything in the table was the broadcast API
-- number by definition. Coexistence changed that — a counsellor's own
-- handset is a second number, with a different owner, a different rule
-- about creating leads, and now a different inbox — and there was no
-- column to tell the two apart.
--
-- Nullable, and null means the API number. That is not a default chosen
-- for convenience: every row that predates this migration genuinely did
-- arrive on the one API number, so reading null as "the API number" is
-- true rather than merely safe. No backfill is attempted, because there
-- is nothing to look up — the fact was never written down.
--
-- `on delete set null` rather than cascade. Deregistering a number must
-- not delete the conversations held on it: the messages are the record
-- of what was said to a student, and they outlive the handset.
alter table whatsapp_messages
  add column if not exists number_id uuid references whatsapp_numbers(id) on delete set null;--> statement-breakpoint

comment on column whatsapp_messages.number_id is
  'The institute number this message was sent from or received on. Null means the broadcast API number — true of every row written before migration 0093, when it was the only number.';--> statement-breakpoint

-- The two inboxes each ask "threads on numbers of this kind", which is a
-- scan over recent messages filtered by this column. Partial on the
-- not-null side: the null rows are the API inbox's default and are found
-- by the absence of a match, not by an index lookup.
create index if not exists whatsapp_messages_number_occurred_idx
  on whatsapp_messages (number_id, occurred_at desc)
  where deleted_at is null and number_id is not null;
