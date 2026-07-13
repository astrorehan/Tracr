-- Per-user monthly cap on AI calls.
--
-- The AI feature costs real money (Gemini tokens) and ships on a free tier, so
-- every call is metered. The counter must NOT be user-writable — otherwise a
-- user could reset their own quota. So the table grants SELECT only, and the
-- single writer is a SECURITY DEFINER function that both checks and increments
-- atomically. The edge function calls ai_try_consume() before touching Gemini.

create table if not exists ai_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  ym text not null,                       -- 'YYYY-MM' bucket
  calls int not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, ym)
);

alter table ai_usage enable row level security;

-- Users may read their own usage (to show "X of N left") but never write it.
drop policy if exists "own ai usage (select)" on ai_usage;
create policy "own ai usage (select)" on ai_usage for select using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- ai_try_consume: atomically reserve one call for the current month.
-- Returns true if the call is allowed (and counts it), false if over the cap.
-- SECURITY DEFINER so it can write the table that users can't write directly;
-- auth.uid() still resolves to the calling user, so the row is always theirs.
-- ---------------------------------------------------------------------------
create or replace function public.ai_try_consume(p_max int)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  cur text := to_char(now(), 'YYYY-MM');
  used int;
begin
  if uid is null then
    return false;
  end if;

  select calls into used
  from ai_usage
  where user_id = uid and ym = cur
  for update;

  if used is null then
    insert into ai_usage (user_id, ym, calls) values (uid, cur, 1)
    on conflict (user_id, ym) do update set calls = ai_usage.calls + 1, updated_at = now();
    return true;
  end if;

  if used >= p_max then
    return false;
  end if;

  update ai_usage set calls = calls + 1, updated_at = now()
  where user_id = uid and ym = cur;
  return true;
end;
$$;

-- Lock down execution: only signed-in users. Supabase's default privileges also
-- grant `anon` execute on new public functions, so revoke that explicitly (the
-- `from public` revoke alone doesn't remove the role-specific grant).
revoke all on function public.ai_try_consume(int) from public;
revoke execute on function public.ai_try_consume(int) from anon;
grant execute on function public.ai_try_consume(int) to authenticated;
