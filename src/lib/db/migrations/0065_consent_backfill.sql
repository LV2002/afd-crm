-- Everyone already in the CRM is on the messaging list.
--
-- Three consent columns have sat on `leads` since the identity layer and
-- nothing ever wrote them: opt-OUT was handled properly (a STOP suppresses
-- the number, and the broadcast audience honours it) while opt-IN was
-- recorded nowhere, so the CRM could not answer "on what basis did we
-- message this person?" for a single lead.
--
-- Leon's decision, and the basis recorded here: entering somebody into the
-- CRM is the act of adding them to the messaging list — everyone who
-- reaches it has enquired about a course, and the enquiry is the consent.
-- New leads get this from `resolveOrCreateLead()`; this backfills the ones
-- that already exist.
--
-- Dated to the lead's own `created_at`, not to today. Consent given on the
-- day they enquired is the true statement; stamping every historical lead
-- with the date of this migration would be inventing a record.
update leads
set
  consent_status = 'given',
  consent_source = 'enquiry:backfill',
  consent_at = created_at
where consent_status is null
  -- Never over an explicit "do not contact": somebody set that deliberately.
  and do_not_contact = false
  -- Nor over a live opt-out. The suppression list is by phone and it wins.
  and not exists (
    select 1 from whatsapp_suppressions s
    where s.phone = leads.primary_phone
      and s.released_at is null
  );--> statement-breakpoint

-- The ones we are NOT claiming consent for say so explicitly, rather than
-- staying null and looking like a lead nobody got round to.
update leads
set
  consent_status = 'withdrawn',
  consent_source = 'opt_out',
  consent_at = coalesce(consent_at, now())
where consent_status is null
  and (
    do_not_contact = true
    or exists (
      select 1 from whatsapp_suppressions s
      where s.phone = leads.primary_phone
        and s.released_at is null
    )
  );--> statement-breakpoint

-- Reading "who may we message?" is a per-send question on a table that
-- grows to tens of thousands of rows, and it filters on this every time.
create index if not exists leads_consent_status_idx
  on leads (consent_status) where deleted_at is null;
