-- Scheduling, and per-recipient template values.
--
-- ## scheduled_for
--
-- The instant, in UTC, that a broadcast should leave. A person picks
-- 10:00 in Kochi; this column holds 04:30Z, because everything else in
-- the system stores timestamptz in UTC and IST lives only at the edges
-- (CLAUDE.md § Stack).
--
-- The check constraint is the point of the column: a broadcast sitting in
-- `scheduled` with no time is one that will never send and never say why.
-- The database refuses to hold one.
--
-- ## body_params / params
--
-- `whatsapp_broadcasts.body_params` is what the composer chose for each
-- of the template's `{{n}}` placeholders — either fixed text or a merge
-- variable with a fallback. `whatsapp_broadcast_recipients.params` is the
-- ANSWER for one person: the actual strings, resolved when the audience
-- was snapshotted.
--
-- Both, deliberately. Resolving at snapshot time rather than at send time
-- keeps the send loop a single API call per person with no lookups, and
-- it makes "what did we actually say to Anjali" a column somebody can
-- read six months later rather than a re-computation against a record
-- that has since changed. It is the same reasoning that snapshots the
-- phone number onto the recipient row.
--
-- `body_param` (singular) stays for the rows that already exist. The
-- sweep prefers `params` and falls back to it, so nothing sent before
-- today changes meaning.
alter table whatsapp_broadcasts
  add column if not exists scheduled_for timestamptz,
  add column if not exists body_params jsonb,
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancelled_by uuid references profiles(id) on delete set null;--> statement-breakpoint

alter table whatsapp_broadcast_recipients
  add column if not exists params jsonb;--> statement-breakpoint

alter table whatsapp_broadcasts
  drop constraint if exists whatsapp_broadcasts_scheduled_needs_time;--> statement-breakpoint

-- `status::text`, not `status <> 'scheduled'::whatsapp_broadcast_status`.
-- Postgres refuses to USE an enum value that was added in the same
-- transaction, and drizzle-kit applies every pending migration in one —
-- so referencing the label the previous migration just created fails on
-- exactly the run that matters, the first one. Comparing the text of the
-- status sidesteps that and means the same thing.
alter table whatsapp_broadcasts
  add constraint whatsapp_broadcasts_scheduled_needs_time
  check (status::text <> 'scheduled' or scheduled_for is not null);--> statement-breakpoint

-- The sweep's first query every run: which scheduled broadcasts are due?
-- Partial, because a year of completed campaigns has no business being
-- walked to answer it.
create index if not exists whatsapp_broadcasts_scheduled_for_idx
  on whatsapp_broadcasts (scheduled_for)
  where scheduled_for is not null;--> statement-breakpoint

comment on column whatsapp_broadcasts.scheduled_for is
  'UTC instant this should be sent. Set only while status = scheduled; the sweep promotes it to sending at or after this time.';--> statement-breakpoint

comment on column whatsapp_broadcasts.body_params is
  'Per-placeholder sources: [{"kind":"text","value":…} | {"kind":"variable","key":…,"fallback":…}]. See lib/whatsapp/personalise.ts.';--> statement-breakpoint

comment on column whatsapp_broadcast_recipients.params is
  'The resolved strings sent to THIS person, in placeholder order. Snapshotted with the audience, never recomputed.';
