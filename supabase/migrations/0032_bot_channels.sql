-- Generalize the WhatsApp-only bot tables into channel-agnostic ones.
--
-- WhatsApp (0031) is parked on Meta Business verification; Telegram is the
-- channel actually being built. Both are the same bot reached over a different
-- transport, so the link/history storage becomes one set of tables keyed by
-- (channel, chat_id) instead of one set per channel.
--
--   whatsapp_links        -> bot_links        (wa_phone -> chat_id, + channel)
--   whatsapp_link_tokens  -> bot_link_tokens  (+ channel)
--   whatsapp_history      -> bot_history      (wa_phone -> chat_id, + channel)
--   wa_mint_link_token()  -> bot_mint_link_token(p_channel)
--
-- Existing rows are WhatsApp by definition, so `channel` backfills to
-- 'whatsapp' via a temporary default that is dropped again below — new rows
-- must always name their channel.
--
-- SECURITY MODEL is unchanged and still load-bearing: the webhooks run as
-- SERVICE ROLE with no RLS backstop, so bot_links is the only thing binding a
-- chat to a user. chat_id is per-channel opaque text (E.164 without '+' for
-- WhatsApp, the numeric Telegram chat id as text) and is only ever trusted
-- after the transport has authenticated the request.

-- 'telegram' joins the transaction source enum. PG17 allows ADD VALUE inside a
-- transaction block as long as the value is not USED before commit; nothing in
-- this migration writes a transactions row, so this is safe here.
alter type transaction_source add value if not exists 'telegram';

-- The history FK depends on the links primary key, so it has to go first and is
-- rebuilt as a composite at the end.
alter table whatsapp_history drop constraint whatsapp_history_wa_phone_fkey;

-- ---------------------------------------------------------------------------
-- bot_links — a verified chat -> (user, book) binding. One row per chat, per
-- channel. Written by a webhook (service role) during the link handshake.
-- ---------------------------------------------------------------------------
alter table whatsapp_links rename to bot_links;
alter table bot_links rename column wa_phone to chat_id;
alter table bot_links add column channel text not null default 'whatsapp'
  check (channel in ('whatsapp', 'telegram'));
alter table bot_links drop constraint whatsapp_links_pkey;
alter table bot_links add constraint bot_links_pkey primary key (channel, chat_id);
alter table bot_links alter column channel drop default;
alter index whatsapp_links_user_idx rename to bot_links_user_idx;

-- A table rename does not rename its policies. Same rule as before: users read
-- and delete their own link (the settings "unlink" button); the webhook reads it
-- via the service role, which bypasses RLS entirely.
drop policy "own whatsapp link" on bot_links;
create policy "own bot link" on bot_links
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- bot_link_tokens — short-lived one-time tokens for the deep-link flow. The app
-- mints one for a specific channel, builds the deep link that prefills it, the
-- user sends it, that channel's webhook consumes it. A token rather than the raw
-- user id, so the prefilled text is worthless after use/TTL.
-- ---------------------------------------------------------------------------
alter table whatsapp_link_tokens rename to bot_link_tokens;
alter table bot_link_tokens add column channel text not null default 'whatsapp'
  check (channel in ('whatsapp', 'telegram'));
alter table bot_link_tokens alter column channel drop default;
alter index whatsapp_link_tokens_user_idx rename to bot_link_tokens_user_idx;

-- No user-facing policy (unchanged): tokens are minted by a SECURITY DEFINER RPC
-- and consumed by the service-role webhook. Users never read the table.

-- ---------------------------------------------------------------------------
-- bot_history — rolling conversation history per chat. A webhook is stateless
-- per call, so the "confirm before write" handshake needs the last few turns
-- persisted: "yes" in message 2 must connect to the receipt in message 1.
-- ---------------------------------------------------------------------------
alter table whatsapp_history rename to bot_history;
alter table bot_history rename column wa_phone to chat_id;
alter table bot_history add column channel text not null default 'whatsapp'
  check (channel in ('whatsapp', 'telegram'));
alter table bot_history drop constraint whatsapp_history_pkey;
alter table bot_history add constraint bot_history_pkey primary key (channel, chat_id);
alter table bot_history alter column channel drop default;
alter table bot_history add constraint bot_history_chat_fkey
  foreign key (channel, chat_id) references bot_links (channel, chat_id) on delete cascade;

-- Service-role only; no user policy (unchanged).

-- ---------------------------------------------------------------------------
-- bot_mint_link_token: called by the signed-in app to start the linking flow for
-- one channel. Returns a fresh URL-safe token bound to the user's ACTIVE book,
-- valid 10 minutes. SECURITY DEFINER so it can write bot_link_tokens (users
-- can't); auth.uid() still resolves to the caller, so the token is always theirs.
-- ---------------------------------------------------------------------------
drop function if exists public.wa_mint_link_token();

create or replace function public.bot_mint_link_token(p_channel text)
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

  -- Validated here too: the column check would catch it, but this keeps the
  -- error legible and stops a typo minting an unusable token.
  if p_channel not in ('whatsapp', 'telegram') then
    raise exception 'unknown channel: %', p_channel;
  end if;

  select active_book_id into bid from profiles where id = uid;
  if bid is null then
    raise exception 'no active book';
  end if;

  -- URL-safe: base64 of 12 random bytes, strip non-alphanumerics, take 10 chars.
  -- gen_random_bytes is schema-qualified because pgcrypto lives in `extensions`
  -- on Supabase, not public — and `search_path` is pinned to public above (which
  -- is what keeps this SECURITY DEFINER function from resolving names against a
  -- caller-controlled path). 0031's wa_mint_link_token called it bare and always
  -- failed with "function gen_random_bytes(integer) does not exist".
  tok := left(regexp_replace(encode(extensions.gen_random_bytes(12), 'base64'), '[^a-zA-Z0-9]', '', 'g'), 10);

  insert into bot_link_tokens (token, channel, user_id, book_id, expires_at)
  values (tok, p_channel, uid, bid, now() + interval '10 minutes');

  return tok;
end;
$$;

revoke all on function public.bot_mint_link_token(text) from public;
revoke execute on function public.bot_mint_link_token(text) from anon;
grant execute on function public.bot_mint_link_token(text) to authenticated;
