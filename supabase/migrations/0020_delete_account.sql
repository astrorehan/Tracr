-- 0020_delete_account — self-service account deletion (privacy / "delete my data")
--
-- Deleting the caller's auth.users row cascades to every owned table: each
-- `user_id` FK (and profiles.id) is declared `on delete cascade` in 0001, so this
-- single delete removes all of the user's data with no per-table cleanup.
--
-- security definer so an ordinary authenticated user can remove themselves, but
-- the body only ever targets `auth.uid()` — callers can never delete anyone else.
-- search_path is pinned empty and every reference is schema-qualified.

create or replace function public.delete_current_user()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;
  delete from auth.users where id = uid;
end;
$$;

-- Only signed-in users may call it; never anon/public. (Supabase's default
-- privileges grant EXECUTE on new public functions to anon + authenticated, so
-- anon must be revoked explicitly — revoking from PUBLIC alone leaves it.)
revoke all on function public.delete_current_user() from public;
revoke execute on function public.delete_current_user() from anon;
grant execute on function public.delete_current_user() to authenticated;
