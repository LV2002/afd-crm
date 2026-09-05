-- Named, pre-approved discounts.
--
-- "Early Bird 10% until 30 June", "Sibling ₹5,000", "Staff Ward 25%" —
-- the discounts the institute has already decided to give, as opposed to
-- the ones a counsellor negotiates in the room. docs/01-DATA-MODEL.md has
-- listed `promos` since the beginning and nothing ever implemented it.
--
-- The difference between a promo and typing 10% into the fee panel is
-- AUTHORITY. The institute decided on the offer in advance, wrote down its
-- cap and its expiry and put it in this list, so applying one does not
-- queue for a manager's approval the way a negotiated discount does. That
-- is the whole reason this is worth a table — and it is why the cap, the
-- dates and the courses live here rather than in somebody's head.
create table if not exists promos (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text,
  discount_type text not null,
  percent_value numeric(5,2),
  fixed_paise bigint,
  max_discount_paise bigint,
  valid_from date,
  valid_until date,
  courses text[],
  center_ids uuid[],
  max_uses integer,
  -- A counter rather than an aggregate over every admission ever taken:
  -- "this offer has been used up" has to be answerable while somebody is
  -- on the phone.
  used_count integer not null default 0,
  is_active boolean not null default true,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  deleted_at timestamptz,
  constraint promos_discount_type check (discount_type in ('percentage','fixed')),
  -- A promo with neither a percentage nor an amount is a discount of
  -- nothing that looks like a discount.
  constraint promos_has_a_value check (num_nonnulls(percent_value, fixed_paise) >= 1),
  constraint promos_percent_range check (percent_value is null or (percent_value > 0 and percent_value <= 100)),
  constraint promos_dates_ordered check (valid_from is null or valid_until is null or valid_until >= valid_from)
);--> statement-breakpoint

create unique index if not exists promos_code_uq
  on promos (code) where code is not null and deleted_at is null;--> statement-breakpoint

create index if not exists promos_active_idx on promos (is_active);--> statement-breakpoint

-- Which promo was applied to which admission.
--
-- Its own table rather than a column on `enrolments`, because the question
-- somebody actually asks is the other way round: "how many admissions did
-- Early Bird bring in and what did it cost us?" It also keeps the amount
-- taken off AT THE TIME, which is the only figure that stays true after
-- somebody edits the offer.
create table if not exists enrolment_promos (
  id uuid primary key default gen_random_uuid(),
  enrolment_id uuid not null references enrolments(id) on delete cascade,
  promo_id uuid not null references promos(id) on delete restrict,
  discount_paise bigint not null,
  applied_by uuid references profiles(id) on delete set null,
  applied_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz
);--> statement-breakpoint

-- One promo per admission. Stacking offers is a decision an institute
-- should make deliberately, not one that falls out of a form being saved
-- twice.
create unique index if not exists enrolment_promos_enrolment_uq
  on enrolment_promos (enrolment_id);--> statement-breakpoint

create index if not exists enrolment_promos_promo_idx on enrolment_promos (promo_id);--> statement-breakpoint

alter table promos enable row level security;--> statement-breakpoint
alter table enrolment_promos enable row level security;--> statement-breakpoint

-- Every authenticated user can SEE the offers — a counsellor has to be
-- able to tell a family what is available — and only settings.manage can
-- change them. Exactly the shape fee_structures uses (migration 0017),
-- and for the same reason: what the institute charges and what it is
-- prepared to knock off are the same decision.
create policy promos_select on promos for select
  to authenticated
  using (true);--> statement-breakpoint

create policy promos_insert on promos for insert
  to authenticated
  with check (auth_scope('settings.manage') = 'all');--> statement-breakpoint

create policy promos_update on promos for update
  to authenticated
  using (auth_scope('settings.manage') = 'all')
  with check (auth_scope('settings.manage') = 'all');--> statement-breakpoint

-- Applying one is fee work on somebody's admission, so visibility is
-- inherited from the parent lead exactly as `enrolments` is — a
-- counsellor sees the offers on their own students' admissions and no
-- further.
create policy enrolment_promos_select on enrolment_promos for select
  to authenticated
  using (exists (
    select 1 from enrolments e
    join leads l on l.id = e.lead_id
    where e.id = enrolment_promos.enrolment_id
      and can_access_center('enrolment.read', l.center_id, l.assigned_to)
  ));--> statement-breakpoint

create policy enrolment_promos_insert on enrolment_promos for insert
  to authenticated
  with check (exists (
    select 1 from enrolments e
    join leads l on l.id = e.lead_id
    where e.id = enrolment_promos.enrolment_id
      and can_access_center('enrolment.update', l.center_id, l.assigned_to)
  ));--> statement-breakpoint

create policy enrolment_promos_delete on enrolment_promos for delete
  to authenticated
  using (exists (
    select 1 from enrolments e
    join leads l on l.id = e.lead_id
    where e.id = enrolment_promos.enrolment_id
      and can_access_center('enrolment.update', l.center_id, l.assigned_to)
  ));
