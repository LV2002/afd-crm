-- What a file IS, as a column rather than a guess about its label.
--
-- The lead page used to decide whether a signed instalment agreement had
-- been uploaded by looking for the word "instalment" inside the free-text
-- label. That worked only for one exact phrasing: a counsellor who typed
-- "Signed agreement", or nothing at all, produced a lead that looked to
-- the system like it had never been signed. Now that accounts reads the
-- same fact off the same file, a substring match is not good enough.
--
-- `kind` is a small, code-known set — the values are enforcement points,
-- not vocabulary, so unlike a label they do not belong in dropdown_options
-- (CLAUDE.md § What is configurable). `label` stays free text and stays
-- useful for everything the code has no opinion about.
alter table attachments
  add column if not exists kind text not null default 'document';

-- Anything already uploaded that reads like the agreement becomes one, so
-- the fact survives the change rather than every existing admission
-- suddenly showing as unsigned.
update attachments
   set kind = 'signed_agreement'
 where kind = 'document'
   and lead_id is not null
   and label ilike '%agreement%';

-- Both reads are "the signed agreement for this lead", from the lead page
-- and from the accounts screen.
create index if not exists attachments_lead_kind_idx on attachments (lead_id, kind);

comment on column attachments.kind is
  'What the file is to the system: signed_agreement or document. A small
   code-known set, unlike the free-text label — the app branches on it.';
