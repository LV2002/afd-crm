-- Let the browser hear about new and reassigned leads as they happen.
--
-- Supabase Realtime only streams tables that belong to the
-- `supabase_realtime` publication. The screens that list work (dashboard,
-- leads, follow-ups, unassigned) subscribe to `leads` so a lead that
-- arrives while somebody has the CRM open shows up without a refresh.
--
-- Row Level Security still decides who is told: Realtime evaluates the
-- subscriber's own policies, so a counsellor hears about their leads only.
--
-- Guarded, because a plain Postgres (CI, local) has no such publication.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'leads'
     ) then
    alter publication supabase_realtime add table public.leads;
  end if;
end $$;
