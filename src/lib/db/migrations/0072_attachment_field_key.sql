-- Which profile-form question a file answers.
--
-- A student uploading their ID proof and their photograph produces two
-- `attachments` rows that are otherwise indistinguishable from anything a
-- counsellor uploaded, and `profile_form_data` holds only the filename.
-- So the submitted-forms list had no way to put a link next to the right
-- question: matching on the label would break the moment two questions
-- shared one, and matching on the filename breaks when a student attaches
-- `image.jpg` twice.
--
-- The key goes on the file rather than a map on the lead because that is
-- where it belongs: this column says what the file IS, next to `label`
-- (what a person calls it) and `kind` (what the system calls it). Null for
-- every file a member of staff uploaded — they answer no question.
alter table attachments add column if not exists field_key text;

comment on column attachments.field_key is
  'The field_definitions.key of the profile-form question this file answers. Null for staff uploads.';

-- The lookup the submitted-forms list makes: every question-answering file
-- for a set of leads. Partial, because staff uploads are the majority and
-- none of them are ever looked up this way.
create index if not exists attachments_lead_field_key_idx
  on attachments (lead_id, field_key)
  where field_key is not null and deleted_at is null;
