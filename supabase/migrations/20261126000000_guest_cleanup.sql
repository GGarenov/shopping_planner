-- Guests (Supabase anonymous users, taylor_the_app/loginless.md part 5) are deleted after 3 days without activity.
-- Activity = the latest of: account made, last sign-in, last session refresh (an open app refreshes its session
-- every hour, so "3 days without activity" means "3 days without opening the app").
-- Deleting the auth user cascades to everything of theirs (profile, plans, ticks); feedback keeps user_id = null.
-- Accounts with Google or email are never touched (is_anonymous = false).

create extension if not exists pg_cron with schema pg_catalog;

create or replace function public.delete_stale_guests(max_idle interval default interval '3 days')
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  with stale as (
    select u.id
    from auth.users u
    where u.is_anonymous
      and greatest(
            u.created_at,
            u.last_sign_in_at,
            (select max(greatest(s.updated_at, s.refreshed_at at time zone 'utc')) from auth.sessions s where s.user_id = u.id)
          ) < now() - max_idle
  ),
  gone as (
    delete from auth.users u using stale where u.id = stale.id returning 1
  )
  select count(*) into n from gone;
  -- Shows in Supabase → Logs → Postgres.
  raise log 'delete_stale_guests: deleted % guest(s) idle for more than %', n, max_idle;
  return n;
end
$$;

-- Only the service role (and the cron job, which runs as postgres) may call it.
revoke all on function public.delete_stale_guests(interval) from public, anon, authenticated;
grant execute on function public.delete_stale_guests(interval) to service_role;

-- Every night at 03:17 UTC. cron.schedule with a job name replaces an existing job of that name.
select cron.schedule('delete-stale-guests', '17 3 * * *', $$select public.delete_stale_guests()$$);
