-- The indexes this database has been missing since the beginning.
--
-- Every table below had its primary key and, at best, one unique
-- constraint. No foreign key was indexed, and neither was a single column
-- anything actually filters on. That means every leads list, every
-- pipeline board, every My Day queue, every lead timeline and every join
-- was a SEQUENTIAL SCAN of the whole table — and worse, RLS made it a
-- sequential scan with a `can_access_center(...)` function call executed
-- once per row.
--
-- At a few hundred rows nobody notices. At the volume AFD is heading for
-- it is the difference between a page that opens and a page somebody
-- gives up on, and it compounds with everything else on the page.
--
-- Two rules followed throughout:
--
--   * Partial `where deleted_at is null` wherever the queries all carry
--     that filter — nothing hard-deletes here (CLAUDE.md § 5), so the
--     dead rows accumulate forever and there is no reason to index them.
--   * Composite in the order the queries use, filter column first and
--     sort column second, so one index serves both the WHERE and the
--     ORDER BY.

-- ── leads ────────────────────────────────────────────────────────────
-- The table everything reads. A counsellor's own list, a centre head's
-- centre, the pipeline board, the follow-up queue and the SLA sweep are
-- five different filters on it, and RLS adds `assigned_to`/`center_id` to
-- every one of them.
create index if not exists leads_assigned_to_idx
  on leads (assigned_to) where deleted_at is null;--> statement-breakpoint

create index if not exists leads_center_id_idx
  on leads (center_id) where deleted_at is null;--> statement-breakpoint

create index if not exists leads_stage_idx
  on leads (stage_id) where deleted_at is null;--> statement-breakpoint

create index if not exists leads_created_at_idx
  on leads (created_at desc) where deleted_at is null;--> statement-breakpoint

-- My Day, and the follow-up counters on every dashboard.
create index if not exists leads_next_followup_idx
  on leads (next_followup_at) where deleted_at is null and next_followup_at is not null;--> statement-breakpoint

-- The identity path. `findLeadByPhone` runs on every inbound WhatsApp
-- message and every webhook lead, and was scanning the table each time.
create index if not exists leads_primary_phone_idx
  on leads (primary_phone) where deleted_at is null;--> statement-breakpoint

-- Small and very selective: the breached list is a handful of rows out of
-- everything, which is exactly what a partial index is for.
create index if not exists leads_sla_breached_idx
  on leads (sla_breached) where sla_breached and deleted_at is null;--> statement-breakpoint

-- The orphan queue.
create index if not exists leads_unassigned_idx
  on leads (center_id) where assigned_to is null and deleted_at is null;--> statement-breakpoint

-- ── the tables that hang off a lead ──────────────────────────────────
-- Every one of these is read by lead id and shown newest first.
create index if not exists enquiries_lead_id_idx on enquiries (lead_id, created_at desc);--> statement-breakpoint

create index if not exists interactions_lead_id_idx
  on interactions (lead_id, occurred_at desc) where deleted_at is null;--> statement-breakpoint

-- The counsellor's own activity, for the SLA first-response calculation.
create index if not exists interactions_created_by_idx
  on interactions (created_by, occurred_at desc) where deleted_at is null;--> statement-breakpoint

create index if not exists stage_history_lead_id_idx on stage_history (lead_id, changed_at desc);--> statement-breakpoint

create index if not exists lead_tags_tag_id_idx on lead_tags (tag_id);--> statement-breakpoint

-- ── audit_log ────────────────────────────────────────────────────────
-- Written on every mutation in the system (CLAUDE.md § 5) and therefore
-- the fastest-growing table here. Read two ways: "what happened to this
-- record" and "what did this person do".
create index if not exists audit_log_entity_idx
  on audit_log (entity_type, entity_id, occurred_at desc);--> statement-breakpoint

create index if not exists audit_log_actor_idx on audit_log (actor_id, occurred_at desc);--> statement-breakpoint

-- ── money ────────────────────────────────────────────────────────────
create index if not exists enrolments_lead_id_idx
  on enrolments (lead_id) where deleted_at is null;--> statement-breakpoint

create index if not exists enrolments_student_id_idx
  on enrolments (student_id) where student_id is not null and deleted_at is null;--> statement-breakpoint

create index if not exists enrolments_center_idx
  on enrolments (center_id) where deleted_at is null;--> statement-breakpoint

-- The accounts queue and the handover report: confirmed, not yet paid.
create index if not exists enrolments_awaiting_payment_idx
  on enrolments (sales_to_accounts_at)
  where sales_to_accounts_at is not null
    and accounts_to_academics_at is null
    and dropped_at is null
    and deleted_at is null;--> statement-breakpoint

-- The ledger is append-only and read per enrolment on every fee panel,
-- every receipt and every reminder sweep.
create index if not exists payments_enrolment_idx on payments (enrolment_id, received_at);--> statement-breakpoint

create index if not exists students_lead_id_idx
  on students (lead_id) where deleted_at is null;--> statement-breakpoint

create index if not exists students_center_idx
  on students (center_id) where deleted_at is null;--> statement-breakpoint

-- ── analyse ──────────────────────────────────────────────────────────
-- Postgres will not use a new index well until it has statistics for the
-- table. Doing it here means the first query after the migration is fast,
-- rather than the first query after autovacuum next happens to run.
analyze leads;--> statement-breakpoint
analyze enquiries;--> statement-breakpoint
analyze interactions;--> statement-breakpoint
analyze enrolments;--> statement-breakpoint
analyze payments;--> statement-breakpoint
analyze audit_log;
