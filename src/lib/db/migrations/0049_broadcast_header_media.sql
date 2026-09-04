-- A broadcast can carry a picture or a video.
--
-- Not as an attached message of its own: outside the 24-hour window Meta
-- accepts only templates, so the only way an image reaches a broadcast
-- audience is the media HEADER of a template that was approved with one.
-- The template says a header exists; these columns say which file fills it
-- on this particular send, so one approved "campus tour" template serves
-- every campaign that has a different video.
--
-- `header_media_id` is Meta's id from the /media upload, not a file of
-- ours. It is valid for 30 days, which comfortably outlives a send, and it
-- is deliberately uploaded ONCE per broadcast rather than once per
-- recipient — a thousand-recipient campaign uploads the video once and
-- then sends the same id a thousand times.
alter table whatsapp_broadcasts
  add column if not exists header_media_id text,
  add column if not exists header_media_kind text,
  add column if not exists header_media_filename text;

comment on column whatsapp_broadcasts.header_media_id is
  'Meta media id filling the template''s media header on this send. Expires
   after 30 days on Meta''s side; a re-send needs a fresh upload.';
