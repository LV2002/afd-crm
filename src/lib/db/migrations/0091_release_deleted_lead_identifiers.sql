-- Release the phone numbers held by leads that were deleted.
--
-- Deleting a lead soft-deleted the lead and left `lead_identifiers`
-- alone. That index is what identity resolution reads, and
-- `lead_identifiers_kind_value_uq` is partial on `deleted_at is null`, so
-- every deleted lead went on holding its number against the whole system
-- while being invisible in it.
--
-- What Leon saw: enter a number, delete the lead, enter the number again,
-- and the new enquiry attached itself to the deleted row. The action
-- redirected to `/leads/<id>`, that page filters `deleted_at is null`,
-- and creating a lead answered with a 404 — with the enquiry filed
-- against a record no screen will ever show.
--
-- Resolution now skips deleted leads and the delete action releases the
-- identifiers, but neither helps the rows already in this state. This is
-- the catch-up, and it is why the fix needs a migration at all.
--
-- Deliberately not touching an identifier whose value a LIVE lead already
-- holds: there is nothing to release in that case, the number is in use,
-- and clearing it would be a lie. Soft-deleting rather than deleting,
-- because nothing in this system is hard-deleted and the row is the
-- record that this lead once owned that number.

update lead_identifiers i
   set deleted_at = l.deleted_at,
       updated_at = now()
  from leads l
 where l.id = i.lead_id
   and l.deleted_at is not null
   and i.deleted_at is null;
