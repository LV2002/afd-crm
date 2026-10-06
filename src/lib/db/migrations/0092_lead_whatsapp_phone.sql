-- A lead's WhatsApp number, when it is not the number they were entered
-- under.
--
-- Common enough at AFD to be worth a column: a student fills in a form
-- with their own mobile and does their actual talking on a parent's
-- WhatsApp, or gives a landline and messages from a different handset.
-- Until now the CRM assumed `primary_phone` was the WhatsApp number, so a
-- counsellor pressing WhatsApp on such a lead opened a conversation with
-- a number that has no WhatsApp account.
--
-- A real column rather than a key in the `custom` jsonb, because it is
-- read on a hot path — the Chats link resolves it per lead — and because
-- a number is a first-class thing in a CRM, not an extra somebody added.
--
-- Nullable and staying that way. Null means "the same as the primary
-- phone", which is true of nearly every lead, and filling it in for all
-- of them would be inventing data to avoid a `coalesce`.
alter table leads add column if not exists whatsapp_phone text;--> statement-breakpoint

comment on column leads.whatsapp_phone is
  'The number this person uses on WhatsApp, when it differs from primary_phone. Null means it is the same — readers coalesce rather than assume.';--> statement-breakpoint

-- Registered as a field so it behaves like every other one: an admin can
-- rename it, reorder it or take it off a form from Settings → Custom
-- Fields with no deploy (CLAUDE.md, "Configuration is data, not code").
--
-- Placed in Personal immediately after the phones it belongs with, which
-- means shifting everything below it down one. The alternative was
-- dropping it at the bottom of the section, where somebody filling in a
-- lead's numbers would never find it.
update field_definitions
   set sort_order = sort_order + 1
 where entity = 'lead'
   and section = 'Personal'
   and sort_order > 4
   and not exists (select 1 from field_definitions where entity = 'lead' and key = 'whatsapp_phone');--> statement-breakpoint

insert into field_definitions
  (entity, key, label, type, section, sort_order, is_required, show_in_list,
   show_in_filters, is_core, on_profile_form)
select
  'lead', 'whatsapp_phone', 'WhatsApp Number', 'phone', 'Personal', 5,
  false, false, false, true, false
where not exists (
  select 1 from field_definitions where entity = 'lead' and key = 'whatsapp_phone'
);
