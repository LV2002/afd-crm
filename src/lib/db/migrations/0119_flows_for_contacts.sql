-- Automation flows for the contact database.
--
-- A flow is either for leads (as before) or for database contacts. A contact
-- flow is started by hand for chosen lists, so its runs belong to a contact
-- rather than a lead. A run has exactly one subject.
alter table whatsapp_flows
  add column if not exists audience text not null default 'lead';--> statement-breakpoint
alter table whatsapp_flows
  add constraint whatsapp_flows_audience_check check (audience in ('lead', 'contact'));--> statement-breakpoint

alter table whatsapp_flow_runs alter column lead_id drop not null;--> statement-breakpoint
alter table whatsapp_flow_runs
  add column if not exists contact_id uuid references contacts(id) on delete cascade;--> statement-breakpoint
alter table whatsapp_flow_runs
  add constraint whatsapp_flow_runs_one_subject check (num_nonnulls(lead_id, contact_id) = 1);--> statement-breakpoint

create unique index if not exists whatsapp_flow_runs_live_contact_uq
  on whatsapp_flow_runs (flow_id, contact_id)
  where status in ('running', 'waiting') and contact_id is not null;--> statement-breakpoint
create index if not exists whatsapp_flow_runs_awaiting_contact_idx
  on whatsapp_flow_runs (contact_id)
  where awaiting_step_id is not null and contact_id is not null;
