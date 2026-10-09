-- Which paid platform an enquiry came from, said explicitly.
--
-- Ad Performance joins leads to `ad_spend_daily` on the campaign id, and
-- decides whether an enquiry is paid advertising by testing its `source`
-- against the two words `meta` and `google` — the values the built-in
-- Meta and Google webhooks write. That worked while those were the only
-- paid feeds.
--
-- It stops working the moment a Google Ads lead form is wired up as a
-- custom webhook, which is what Leon has just done. The admin names the
-- feed, so the enquiry's source reads "Google Ads" — a label chosen for
-- the sources report, which is its job — and `AD_PLATFORMS.has("Google
-- Ads")` is false. The leads arrive, they carry a campaign id and a
-- gclid, and the report cannot see any of it: a campaign with spend and
-- no leads beside a source with leads and no spend.
--
-- Matching the label loosely would be the wrong fix. "Google Ads",
-- "google-ads" and "Google Ads – NIFT" are all things somebody might
-- type, and a report that guesses from a display name will eventually
-- guess wrong about money. So the platform is recorded as a fact at
-- ingestion, by the admin who knows, instead of inferred later.
alter table enquiries
  add column if not exists ad_platform text;--> statement-breakpoint

comment on column enquiries.ad_platform is
  'The paid platform whose spend this enquiry should be attributed to: ''meta'', ''google'', or null for anything that is not paid advertising. Set from custom_webhooks.ad_platform at ingestion; the built-in Meta and Google webhooks leave it null and are matched on source instead.';--> statement-breakpoint

-- Ad Performance reads these rows by lead id and orders by received_at;
-- the platform is a filter applied after. Partial on the not-null side
-- because the overwhelming majority of enquiries are not paid at all.
create index if not exists enquiries_ad_platform_idx
  on enquiries (ad_platform)
  where ad_platform is not null;--> statement-breakpoint

-- And the endpoint that stamps it.
--
-- Null means "this feed is not paid advertising", which is the right
-- default and what every endpoint already configured keeps: nothing
-- starts being counted as ad spend because this deployed.
alter table custom_webhooks
  add column if not exists ad_platform text;--> statement-breakpoint

comment on column custom_webhooks.ad_platform is
  'When set, every enquiry from this endpoint is attributed to that platform''s spend in Ad Performance. Null means the feed is not paid advertising.';
