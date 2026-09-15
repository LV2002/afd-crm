-- An audit row can only be written in your own name.
--
-- Security audit 2026-09-15, finding #11. The insert policy on `audit_log`
-- is `with check (true)` — deliberately, because every authenticated user
-- must be able to record their own actions, whatever their role — and
-- `actor_id` was supplied entirely by the application. Nothing in the
-- database tied the two together.
--
-- The anon key ships to the browser (that is how Supabase auth works), so
-- any signed-in counsellor could call the REST API directly, bypass
-- `writeAuditLog()` altogether, and insert a row attributing an export or
-- a phone reveal to somebody else — or a hundred rows of noise to bury a
-- real one. The table nobody can UPDATE or DELETE could still be written
-- dishonestly, which defeats the accountability model it exists for
-- (CLAUDE.md non-negotiable #5, and the "counsellors leave and take
-- databases with them" risk behind it).
--
-- This became worth fixing now rather than later because migration 0066
-- gave the log a screen. A trail that is read is a trail worth forging.
create or replace function enforce_audit_actor()
returns trigger
language plpgsql
as $$
begin
  -- auth.uid() is null for the service-role key and for the direct
  -- postgres connection: webhooks, cron sweeps and the seed, none of
  -- which have a user session and all of which legitimately write rows
  -- with a null or system actor. Those paths are already trusted — they
  -- hold the service-role credentials — so there is nothing here for the
  -- trigger to add.
  if auth.uid() is null then
    return new;
  end if;

  if new.actor_id is distinct from auth.uid() then
    raise exception 'audit_log.actor_id must be the acting user'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;--> statement-breakpoint

create trigger enforce_audit_actor before insert on audit_log
  for each row execute function enforce_audit_actor();
