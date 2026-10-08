-- A fixed key a sender can present in a header, as an alternative to
-- signing the request.
--
-- Custom webhooks have offered exactly two settings since they shipped:
-- sign every request with an HMAC, or send nothing and let the random
-- token in the URL be the whole credential. HMAC is the right default and
-- stays the default. The problem is the senders — a great many course
-- platforms and form builders cannot compute a signature at all, and
-- their own setup screens ask for a URL, a payload and one key to paste
-- into a box. For those, the only option here was to turn signing off,
-- which is a real step down and was being taken for the wrong reason.
--
-- Nullable, and null means no key is expected. That is the whole point of
-- the design rather than a convenience: every endpoint already configured
-- has null, so nothing an admin set up last month starts getting 401s the
-- moment this deploys. A key comes into existence only when somebody asks
-- for one, and from that moment a request without it is refused.
--
-- Not unique, and deliberately so. Two endpoints may end up with the same
-- key only by a collision of 32 random bytes, and a uniqueness constraint
-- would turn that into a failed save rather than the non-event it is.
alter table custom_webhooks
  add column if not exists auth_token text;--> statement-breakpoint

comment on column custom_webhooks.auth_token is
  'A fixed key the sender presents as `Authorization: Bearer <key>` or `X-AFD-Key: <key>`. Null means no key is expected; non-null means a request without it is refused. Independent of require_signature — an endpoint may demand both.';
