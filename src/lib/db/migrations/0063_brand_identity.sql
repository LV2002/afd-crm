-- The letterhead, as data.
--
-- Settings → Organisation held a name, a logo, a colour and three locale
-- fields. The name and logo reached exactly two printouts; the colour was
-- stored and read by nothing at all. There was no address, phone, email,
-- website or GST number anywhere in the system, so no document could show
-- contact details even in principle — which is why the fee agreement had
-- the brand, the tagline and the accent colour typed into its source, and
-- why changing the logo in Settings changed nothing on the document a
-- family actually signs.
alter table org_settings add column if not exists legal_name text;--> statement-breakpoint
alter table org_settings add column if not exists tagline text;--> statement-breakpoint
alter table org_settings add column if not exists address_line text;--> statement-breakpoint
alter table org_settings add column if not exists city text;--> statement-breakpoint
alter table org_settings add column if not exists state text;--> statement-breakpoint
alter table org_settings add column if not exists pincode text;--> statement-breakpoint
alter table org_settings add column if not exists phone text;--> statement-breakpoint
alter table org_settings add column if not exists email text;--> statement-breakpoint
alter table org_settings add column if not exists website text;--> statement-breakpoint
alter table org_settings add column if not exists gstin text;--> statement-breakpoint
alter table org_settings add column if not exists document_footer text;--> statement-breakpoint

-- Per-centre contact details, for documents a centre issues. A receipt
-- printed at Kannur that carries Kochi's phone number sends the person
-- with a question about it to the wrong office.
alter table centers add column if not exists phone text;--> statement-breakpoint
alter table centers add column if not exists email text;
