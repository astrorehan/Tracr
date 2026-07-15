-- WhatsApp bot channel.
--
-- The bot lets a user record transactions by messaging a WhatsApp number. It is
-- the same AI agent already shipped in the app, reached through a new input
-- channel (Meta WhatsApp Cloud API webhook).
--
-- SECURITY MODEL — read before touching wa-webhook:
--   The app's AI (ai-analysis) is safe because it runs under the caller's JWT
--   and Postgres RLS enforces per-user isolation. A webhook has NO user session,
--   only a phone number. The wa-webhook function therefore runs as SERVICE ROLE
--   and RLS stops protecting it. These three tables + explicit user_id/book_id
--   filters in the function become the ONLY security boundary. A phone is bound
--   to exactly one (user_id, book_id) via whatsapp_links; every query the webhook
--   makes must be scoped to that pair by hand.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- whatsapp_links — a verified phone → (user, book) binding. One row per phone.
-- Written by the webhook (service role) during the LINK handshake. Users can
-- read and delete their own row (the settings "unlink" button) via RLS.
-- ---------------------------------------------------------------------------
create table whatsapp_links (
  wa_phone      text primary key,                                   -- E.164, normalized, no '+'
  user_id       uuid not null references auth.users (id) on delete cascade,
  book_id       uuid not null references books (id) on delete cascade,
  linked_at     timestamptz not null default now(),
  last_seen_at  timestamptz
);
create index whatsapp_links_user_idx on whatsapp_links (user_id);

alter table whatsapp_links enable row level security;
-- Users see/delete their own link. The webhook reads it via service role, which
-- bypasses RLS, so no policy grants the webhook anything — it is trusted code.
create policy "own whatsapp link" on whatsapp_links
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- whatsapp_link_tokens — short-lived one-time tokens for the deep-link flow.
-- The app mints one (wa_mint_link_token), builds a wa.me link that prefills
-- "LINK <token>", the user sends it, the webhook consumes it to create the link.
-- A token, not the raw user id, so the prefilled text is worthless after use/TTL.
-- ---------------------------------------------------------------------------
create table whatsapp_link_tokens (
  token       text primary key,                                     -- random, URL-safe, ~10 chars
  user_id     uuid not null references auth.users (id) on delete cascade,
  book_id     uuid not null references books (id) on delete cascade,
  expires_at  timestamptz not null,
  used_at     timestamptz
);
create index whatsapp_link_tokens_user_idx on whatsapp_link_tokens (user_id);

alter table whatsapp_link_tokens enable row level security;
-- No user-facing policy: tokens are minted by a SECURITY DEFINER RPC and consumed
-- by the service-role webhook. Users never read the table directly.

-- ---------------------------------------------------------------------------
-- whatsapp_history — rolling conversation history per phone. WhatsApp is
-- stateless per webhook call, so the "confirm before write" handshake needs the
-- last few turns persisted: "yes" in message 2 must connect to the receipt in
-- message 1. Same idea as the app's HISTORY_LIMIT, but server-side.
-- ---------------------------------------------------------------------------
create table whatsapp_history (
  wa_phone    text primary key references whatsapp_links (wa_phone) on delete cascade,
  turns       jsonb not null default '[]'::jsonb,                   -- [{role,content}], last ~8
  updated_at  timestamptz not null default now()
);

alter table whatsapp_history enable row level security;
-- Service-role only; no user policy.

-- ---------------------------------------------------------------------------
-- wa_mint_link_token: called by the signed-in app to start the linking flow.
-- Returns a fresh URL-safe token bound to the user's ACTIVE book, valid 10 min.
-- SECURITY DEFINER so it can write whatsapp_link_tokens (users can't); auth.uid()
-- still resolves to the caller, so the token is always theirs.
-- ---------------------------------------------------------------------------
create or replace function public.wa_mint_link_token()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  bid uuid;
  tok text;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;

  select active_book_id into bid from profiles where id = uid;
  if bid is null then
    raise exception 'no active book';
  end if;

  -- URL-safe: base64 of 12 random bytes, strip non-alphanumerics, take 10 chars.
  tok := left(regexp_replace(encode(gen_random_bytes(12), 'base64'), '[^a-zA-Z0-9]', '', 'g'), 10);

  insert into whatsapp_link_tokens (token, user_id, book_id, expires_at)
  values (tok, uid, bid, now() + interval '10 minutes');

  return tok;
end;
$$;

revoke all on function public.wa_mint_link_token() from public;
revoke execute on function public.wa_mint_link_token() from anon;
grant execute on function public.wa_mint_link_token() to authenticated;

-- ---------------------------------------------------------------------------
-- ai_try_consume_for: service-role twin of ai_try_consume (migration 0030).
-- ai_try_consume uses auth.uid(), which is NULL under the service role, so the
-- webhook can't use it. This variant takes an explicit user id and is callable
-- ONLY by the service role — an authenticated user must never be able to burn
-- another user's quota, so anon/authenticated are denied execute.
-- ---------------------------------------------------------------------------
create or replace function public.ai_try_consume_for(p_user uuid, p_max int)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  cur text := to_char(now(), 'YYYY-MM');
  used int;
begin
  if p_user is null then
    return false;
  end if;

  select calls into used
  from ai_usage
  where user_id = p_user and ym = cur
  for update;

  if used is null then
    insert into ai_usage (user_id, ym, calls) values (p_user, cur, 1)
    on conflict (user_id, ym) do update set calls = ai_usage.calls + 1, updated_at = now();
    return true;
  end if;

  if used >= p_max then
    return false;
  end if;

  update ai_usage set calls = calls + 1, updated_at = now()
  where user_id = p_user and ym = cur;
  return true;
end;
$$;

revoke all on function public.ai_try_consume_for(uuid, int) from public;
revoke execute on function public.ai_try_consume_for(uuid, int) from anon;
revoke execute on function public.ai_try_consume_for(uuid, int) from authenticated;
grant execute on function public.ai_try_consume_for(uuid, int) to service_role;
