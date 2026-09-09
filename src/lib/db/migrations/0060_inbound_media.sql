-- Inbound WhatsApp media, actually fetched.
--
-- Sending images and video has worked since Session 35. Receiving them
-- never has: an inbound picture was recorded by Meta's media id and the
-- bytes were never fetched, so a counsellor could see that a student had
-- sent something and not what it was. A photo of a mark sheet, a
-- screenshot of a payment — exactly the things somebody needs to look at.
--
-- Meta keeps inbound media for 30 days and then it is gone for good, so
-- this is not only a convenience: an id that is never redeemed becomes a
-- permanently missing message.
--
-- The bytes land in the private `attachments` bucket alongside everything
-- else and are read through short-lived signed URLs, so nothing about the
-- existing storage trust model changes.
alter table whatsapp_messages
  add column if not exists media_storage_path text,
  add column if not exists media_filename text,
  add column if not exists media_size_bytes integer,
  add column if not exists media_downloaded_at timestamptz,
  -- Why a fetch failed, and how many times it has been tried. A media id
  -- that 404s because Meta has already expired it must not be retried
  -- forever, and a person needs to be able to see WHY the picture never
  -- arrived rather than looking at a blank space.
  add column if not exists media_error text,
  add column if not exists media_attempts integer not null default 0;--> statement-breakpoint

-- The sweep's working set: inbound messages with a media id, nothing
-- downloaded yet, and not already given up on. Partial so it stays tiny
-- however large the message table grows.
create index if not exists whatsapp_messages_pending_media_idx
  on whatsapp_messages (occurred_at)
  where media_id is not null
    and media_storage_path is null
    and media_attempts < 5;--> statement-breakpoint

comment on column whatsapp_messages.media_storage_path is
  'Path in the private attachments bucket. Null means the bytes have not been fetched from Meta yet.';
