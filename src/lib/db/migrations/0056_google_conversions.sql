-- Reporting admissions back to Google Ads.
--
-- Google optimises against whatever you tell it converted. AFD's
-- conversion, as far as Google currently knows, is a form submission, so
-- Smart Bidding has spent a year buying the cheapest form fills it can
-- find — which is not the same as buying students. This table records
-- what has been told to Google so the truth can be sent instead: this
-- click, eleven days later, enrolled and paid.
--
-- The unique index is the entire point. Telling Google about the same
-- admission twice teaches it one click was worth double, and the budget
-- follows that lie. A retry after a timeout hits the index and does
-- nothing.
--
-- Failures and skips are rows too: "nothing was uploaded" is
-- indistinguishable from "everything already had been" and from "nobody
-- came from Google this month", and those need telling apart.
create table if not exists google_conversion_uploads (
  id uuid primary key default gen_random_uuid(),
  enrolment_id uuid not null references enrolments(id) on delete cascade,
  conversion_action text not null,
  gclid text,
  value_paise bigint,
  converted_at timestamptz,
  status text not null,
  detail text,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);--> statement-breakpoint

create unique index if not exists google_conversion_uploads_enrolment_action_uq
  on google_conversion_uploads (enrolment_id, conversion_action);--> statement-breakpoint

create index if not exists google_conversion_uploads_status_idx
  on google_conversion_uploads (status);--> statement-breakpoint

-- Same gate as ad_spend_daily (migration 0022): org-wide reporting, not
-- centre-scoped, because ad spend and the clicks it bought cannot honestly
-- be split by centre. Written only by the cron on the direct client, same
-- trust boundary as every other integration bookkeeping table.
alter table google_conversion_uploads enable row level security;--> statement-breakpoint

create policy google_conversion_uploads_select on google_conversion_uploads for select
  to authenticated
  using (auth_scope('report.org') = 'all');
