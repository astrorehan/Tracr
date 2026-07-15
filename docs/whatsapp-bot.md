# WhatsApp Bot — Implementation Plan

> **Status: WhatsApp is PARKED; Telegram shipped first.** Meta requires Business
> verification before a number can message real users, so Telegram became the
> first live channel. `wa-webhook` still exists and is kept working, but no Meta
> app is configured and nothing routes to it.
>
> The design below is still accurate in substance — the channel is just a
> transport. What changed since it was written:
>
> - The agent brain moved to `supabase/functions/_shared/ai-core.ts`, and the
>   per-channel plumbing (link, metering, history, one-turn pipeline) to
>   `_shared/bot-core.ts`. A webhook is now transport only.
> - The `whatsapp_*` tables were generalized to `bot_links` / `bot_link_tokens` /
>   `bot_history`, keyed by `(channel, chat_id)` (migration 0032). `chat_id` is
>   E.164-without-`+` for WhatsApp, the numeric chat id for Telegram.
> - `wa_mint_link_token()` → `bot_mint_link_token(p_channel)`.
> - Telegram specifics live in the header of `supabase/functions/tg-webhook/index.ts`.
>
> Reviving WhatsApp = Meta verification + the Settings link button, not new backend.

Goal: a WhatsApp bot that lets a user record transactions by messaging the bot in
plain language (text or photo). It is the same AI brain already shipped in the app,
exposed through a new input channel.

Decisions locked:

- **Provider:** Meta WhatsApp Cloud API (official, free tier, cheapest at scale).
- **Account linking:** deep link (`wa.me`) with a signed one-time token.
- **Confirm flow:** reuse the app's in-conversation "confirm before write" rule.

## 1. What you reuse vs. build

| Layer | Status |
|---|---|
| LLM tool-agent (DeepSeek + `record_transaction`) | exists in `ai-analysis` |
| Gemini vision extraction (`extractDocument`) | exists |
| Metering (`ai_try_consume`) | exists |
| Per-user RLS isolation | **can't reuse as-is** — no user JWT on webhook |
| Phone→user linking | build |
| Webhook receiver + WhatsApp send | build |
| AI core refactor (share logic) | build |

**Core problem:** `ai-analysis` is safe because it runs under the caller's JWT and
Postgres RLS enforces isolation. A webhook has **no user session** — only a phone
number. So the WhatsApp function runs as **service role** and must manually scope
every query to the resolved user. RLS stops protecting you; the link table + explicit
`book_id`/`user_id` filters become the security boundary.

## 2. New pieces

### a) Migration — link table

```sql
create table whatsapp_links (
  wa_phone      text primary key,        -- E.164, normalized, no '+'
  user_id       uuid not null references auth.users(id) on delete cascade,
  book_id       uuid not null references books(id) on delete cascade,
  linked_at     timestamptz not null default now(),
  last_seen_at  timestamptz
);
alter table whatsapp_links enable row level security;
-- users can see/delete their own link (for the settings "unlink" button);
-- the webhook reads it via service role, bypassing RLS.
create policy "own link" on whatsapp_links
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- short-lived binding tokens for the deep-link flow
create table whatsapp_link_tokens (
  token       text primary key,          -- random 8-10 char, URL-safe
  user_id     uuid not null references auth.users(id) on delete cascade,
  book_id     uuid not null references books(id),
  expires_at  timestamptz not null,
  used_at     timestamptz
);

-- per-phone rolling conversation history, so the confirm handshake survives
-- across stateless webhook calls (see section 3)
create table whatsapp_history (
  wa_phone    text primary key references whatsapp_links(wa_phone) on delete cascade,
  turns       jsonb not null default '[]'::jsonb,   -- [{role, content}], last ~8
  updated_at  timestamptz not null default now()
);
```

### b) Deep-link linking flow

```
App settings "Connect WhatsApp" button
  -> app calls RPC: mint token (random, 10 min TTL, tied to user + active book)
  -> build https://wa.me/<BOT_NUMBER>?text=LINK%20<token>
  -> user taps -> WhatsApp opens with "LINK abc123xyz" prefilled -> sends
  -> webhook sees "LINK <token>", looks up token, upserts whatsapp_links,
     marks token used, replies "Connected to <book name>"
```

Token, not raw user id, so the prefilled text is worthless after 10 min / one use.
Normalize phone to E.164 without `+` on store and lookup.

### c) New edge function `wa-webhook`

Two responsibilities on one endpoint:

- **GET** — Meta's verification handshake (`hub.mode` / `hub.verify_token` /
  `hub.challenge`). Echo the challenge if the token matches your `WA_VERIFY_TOKEN`
  secret.
- **POST** — incoming messages. Steps:
  1. **Verify signature** — check `X-Hub-Signature-256` HMAC against `WA_APP_SECRET`.
     Reject if bad. (The webhook is public — this is the auth.)
  2. Parse message: `from` (phone), `type` (`text` | `image`), body or media id.
  3. If body starts `LINK ` -> run linking flow, reply, return.
  4. Resolve `whatsapp_links[from]` -> user_id, book_id. Unknown number -> reply
     "Not connected. Open the app -> Settings -> Connect WhatsApp." Return.
  5. **Metering** — `ai_try_consume` for that user. Over cap -> reply limit message.
  6. If image -> download media (Meta media id -> GET media URL -> fetch bytes with
     bearer token) -> base64 data URL -> `extractDocument`.
  7. Run the shared AI tool-loop (text or `[DOCUMENT_SCAN]` block) as a
     **service-role client, hard-scoped to user_id + book_id**.
  8. **Reply** via `POST graph.facebook.com/v21.0/<PHONE_ID>/messages`.

### d) Refactor `ai-analysis` core -> shared module

Extract the tool schema, `runTool`, `recordTransaction`, `extractDocument`,
`formatMoney`, and the system prompt into `supabase/functions/_shared/ai-core.ts`.
Both `ai-analysis` (JWT client) and `wa-webhook` (service client) import it. **The only
difference is how the supabase client is built and scoped** — the tool loop is
identical.

Critical: in `wa-webhook`, `ToolCtx.supabase` is service-role, so every helper must
filter `.eq('book_id', bookId)` explicitly (it already does — verify
`recordTransaction`'s account lookup and `list_accounts` stay book-scoped). No RLS
backstop, so audit that no query is missing a scope filter before shipping.

## 3. Confirm / write safety on WhatsApp

The chat model already requires an explicit in-conversation "yes" before
`record_transaction`. Reuse it — but WhatsApp is **stateless per webhook call**, so
persist short conversation history:

- Use the `whatsapp_history` table (last ~8 turns per phone, same shape as the app's
  `HISTORY_LIMIT`).
- Load before the loop, append after, so "yes" in message 2 connects to the receipt in
  message 1.

Without history persistence the confirm handshake breaks — this is the non-obvious
must-do.

## 4. Meta setup (done outside code)

1. Meta Business account + [developers.facebook.com](https://developers.facebook.com)
   app -> add **WhatsApp** product.
2. Get test number (free) -> later register your own, verify business.
3. Copy: `WHATSAPP_TOKEN` (permanent system-user token, not the 24h dev one),
   `PHONE_NUMBER_ID`, `APP_SECRET`.
4. Set webhook URL = your `wa-webhook` function URL, `WA_VERIFY_TOKEN` = a random
   string you pick, subscribe to `messages`.
5. **Free tier:** 1,000 user-initiated conversations/month. Session messages (user
   texts first) are free within the 24h window — the whole use case fits, no message
   templates needed.

## 5. Secrets to add

```
WHATSAPP_TOKEN, PHONE_NUMBER_ID, WA_APP_SECRET, WA_VERIFY_TOKEN, BOT_WA_NUMBER
```

(LLM / Gemini / metering secrets already set.)

## 6. Build order

1. Migration: `whatsapp_links` + `whatsapp_link_tokens` + `whatsapp_history` +
   mint-token RPC.
2. Refactor AI core into `_shared/ai-core.ts`; keep `ai-analysis` green.
3. `wa-webhook`: GET verify -> POST signature check -> link flow -> resolve + meter ->
   text path.
4. Add image path (media download -> `extractDocument`).
5. App settings "Connect WhatsApp" UI (deep link + unlink).
6. Test on Meta test number, then go live.

## Watch-outs

- **No RLS safety net** in the webhook — a missing scope filter leaks another user's
  data. Audit every query.
- **Signature verification is the only gate** on a public webhook — don't skip it.
- **Phone normalization** must be identical on link + lookup or binds silently fail.
- **Meta 24h window** — the bot can only freely reply within 24h of the user's last
  message; fine for on-demand logging, but no unprompted "you're over budget" pushes
  without paid templates.
- **Media download is a second authed call** — Meta returns a media id, not the bytes.
