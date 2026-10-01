-- Academics has to accept a student before the student is theirs.
--
-- Gate 2 creates a `students` row the moment accounts record a first
-- payment, and nothing told academics it had happened. Their two screens
-- are Dashboard and Students, and a new name simply appeared in a list of
-- two hundred, sorted by a join date that is almost always today — which
-- is indistinguishable from not being told.
--
-- So there is now a third step after the two named gates, and unlike them
-- it is a to-do rather than a fact: a student arrives un-onboarded, sits in
-- a queue of their own, and joins the main roster when somebody in
-- academics says they are ready.
--
-- A timestamp, not a value on `student_status`. Status is the academic
-- lifecycle — active, on hold, completed, dropped — and a student in
-- onboarding is *active*; they have paid and they are joining. Overloading
-- the enum would make every existing status filter and report quietly mean
-- something else. The timestamp also records WHEN, which "a status that
-- used to be onboarding" cannot, and matches how the two gates themselves
-- are modelled.
alter table students add column if not exists onboarded_at timestamptz;
alter table students add column if not exists onboarded_by uuid references profiles(id) on delete set null;

comment on column students.onboarded_at is
  'When academics completed onboarding. Null means still in the onboarding queue and hidden from the main roster.';

-- Every student who already exists is onboarded, as of the day they
-- joined. The alternative — leaving them null — would greet academics with
-- a queue of everybody who has ever enrolled, which is the opposite of a
-- queue. Only students created from here on go through onboarding.
update students set onboarded_at = joined_at where onboarded_at is null;

-- The queue's own lookup, and the badge count beside it. Partial: once a
-- student is onboarded they are never found this way again, so the index
-- stays the size of the queue rather than the size of the roster.
create index if not exists students_onboarding_queue_idx
  on students (center_id, joined_at)
  where onboarded_at is null and deleted_at is null;

-- One row per WhatsApp conversation, carrying only which way the last
-- message went.
--
-- The sidebar needs "how many people are waiting for a reply" on every
-- page load, and the inbox answers that today by reading three thousand
-- message rows into memory and grouping them in JavaScript. That is fine
-- once on the inbox itself and absurd on every click, so the grouping
-- moves to where it belongs.
--
-- `security_invoker = true` is the load-bearing word: without it the view
-- would run as its owner and hand every caller every thread, bypassing
-- `whatsapp_messages`' own RLS entirely. With it, the base table's
-- policies apply to whoever is querying, so a counsellor's count covers
-- their own leads and a centre head's their centre — the same boundary as
-- the inbox, enforced in the same place.
--
-- The thread key matches `lib/whatsapp/get-threads.ts` exactly, so the
-- badge and the inbox's own "Needs a reply (N)" can never disagree.
create or replace view whatsapp_thread_latest
with (security_invoker = true) as
select distinct on (coalesce('lead:' || lead_id::text, 'phone:' || from_phone))
  coalesce('lead:' || lead_id::text, 'phone:' || from_phone) as thread_key,
  lead_id,
  from_phone,
  direction as last_direction,
  occurred_at as last_message_at
from whatsapp_messages
where deleted_at is null
order by
  coalesce('lead:' || lead_id::text, 'phone:' || from_phone),
  occurred_at desc;

comment on view whatsapp_thread_latest is
  'One row per WhatsApp thread with the direction of its latest message. security_invoker, so whatsapp_messages RLS applies to the caller.';

grant select on whatsapp_thread_latest to authenticated;

-- The scan the view does per thread, newest first.
create index if not exists whatsapp_messages_from_phone_occurred_at_idx
  on whatsapp_messages (from_phone, occurred_at desc)
  where deleted_at is null;
