// Telegram transport (Telegram Bot API).
//
// This file is transport only: authenticate the request, parse the update, fetch
// media bytes, hand the turn to ../_shared/bot-core.ts, send the reply back. The
// agent pipeline is shared verbatim with ../wa-webhook — changes to how a turn is
// handled belong in bot-core, not here.
//
//   * Auth of the REQUEST is the secret token. Telegram echoes whatever string
//     was passed as `secret_token` to setWebhook in the
//     X-Telegram-Bot-Api-Secret-Token header. The endpoint is public, so this
//     compare is the only gate — without it anyone can POST forged updates.
//     (Unlike Meta, Telegram does not sign the body, so there is nothing else to
//     verify against.)
//   * Auth of the USER is the chat id -> (user_id, book_id) binding in bot_links,
//     created by the /start <token> handshake.
//   * PRIVATE CHATS ONLY. In a group the bot would take instructions from every
//     member, and bot_links binds a chat rather than a person — a group chat id
//     would hand the whole group write access to one user's ledger. Groups are
//     refused before anything else happens.
//
// Telegram retries an update that doesn't get a 2xx, which would double-deliver
// (and could double-record a "yes"), so we ACK immediately after the secret check
// and do the slow work (LLM, vision, DB) in the background via
// EdgeRuntime.waitUntil.
//
// Setup:
//   1. @BotFather → /newbot → copy the token → TELEGRAM_BOT_TOKEN
//   2. pick any random string → TELEGRAM_WEBHOOK_SECRET
//   3. supabase secrets set TELEGRAM_BOT_TOKEN=... TELEGRAM_WEBHOOK_SECRET=...
//   4. supabase functions deploy tg-webhook --no-verify-jwt
//      (--no-verify-jwt is REQUIRED: Telegram cannot send a Supabase JWT. The
//      secret token above is what replaces it. Without the flag the platform
//      rejects every update with 401 before this code runs.)
//   5. curl -X POST "https://api.telegram.org/bot<TOKEN>/setWebhook" \
//        -H 'content-type: application/json' \
//        -d '{"url":"https://<ref>.supabase.co/functions/v1/tg-webhook",
//             "secret_token":"<TELEGRAM_WEBHOOK_SECRET>",
//             "allowed_updates":["message"]}'
//
// (LLM_* / GEMINI_* / AI_MONTHLY_LIMIT are already set for ai-analysis.)
// SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are injected by the platform.
import { encodeBase64 } from 'jsr:@std/encoding@1/base64'
import { MAX_IMAGE_CHARS, type AgentFile } from '../_shared/ai-core.ts'
import { renderTelegramHtml, stripMarkdown } from '../_shared/telegram-format.ts'
import {
  adminClient,
  consumeBotLinkToken,
  resolveBotLink,
  runBotTurn,
  touchBotLink,
} from '../_shared/bot-core.ts'

const CHANNEL = 'telegram' as const
const API = (token: string) => `https://api.telegram.org/bot${token}`

const HELP =
  'Send me an expense like "Lunch 45k" or a photo of a receipt and I\'ll log it. ' +
  'You can also ask things like "how much did I spend on food last month?". ' +
  'Send /unlink to disconnect this chat.'

/** Constant-time compare so we don't leak the secret via timing. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

// --- Bot API helpers --------------------------------------------------------
async function post(token: string, method: string, body: unknown): Promise<Response> {
  return await fetch(`${API(token)}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

async function sendText(token: string, chatId: string, body: string): Promise<void> {
  // Telegram caps a text message at 4096 chars. Slicing HTML could cut a tag in
  // half, so trim the markdown first and render what survives.
  const text = renderTelegramHtml(body.slice(0, 3900))

  const res = await post(token, 'sendMessage', {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    link_preview_options: { is_disabled: true },
  })
  if (res.ok) return

  // A malformed entity 400s the whole message. Never lose the reply over
  // formatting — resend it as plain text with the markup stripped.
  const detail = await res.text().catch(() => '')
  console.error('tg send failed', res.status, detail)
  const retry = await post(token, 'sendMessage', {
    chat_id: chatId,
    text: stripMarkdown(body).slice(0, 4096),
  })
  if (!retry.ok) console.error('tg plain retry failed', retry.status, await retry.text().catch(() => ''))
}

/** "typing…" in the chat. The agent loop can take several seconds; the status
 *  expires by itself after ~5s, so this is fire-and-forget. */
function sendTyping(token: string, chatId: string): void {
  post(token, 'sendChatAction', { chat_id: chatId, action: 'typing' }).then(() => {}, () => {})
}

/** Upload a tool-produced file (PDF report) as a Telegram document. Multipart,
 *  not JSON — the bytes go straight up, no URL hosting step. */
async function sendDocument(token: string, chatId: string, file: AgentFile): Promise<void> {
  const form = new FormData()
  form.append('chat_id', chatId)
  form.append('document', new Blob([file.bytes], { type: file.mime }), file.filename)
  const res = await fetch(`${API(token)}/sendDocument`, { method: 'POST', body: form })
  if (!res.ok) console.error('tg sendDocument failed', res.status, await res.text().catch(() => ''))
}

interface PhotoSize {
  file_id: string
  file_size?: number
  width?: number
  height?: number
}

/** Telegram sends one photo as several pre-scaled sizes, ascending. Take the
 *  largest that still fits the scanner's per-image budget (base64 inflates bytes
 *  by ~4/3); fall back to the smallest if even that is too big. */
function pickPhoto(sizes: PhotoSize[]): PhotoSize | null {
  if (!sizes.length) return null
  const budgetBytes = (MAX_IMAGE_CHARS * 3) / 4
  for (let i = sizes.length - 1; i >= 0; i--) {
    const size = sizes[i]
    if (!size.file_size || size.file_size <= budgetBytes) return size
  }
  return sizes[0]
}

/** Two calls: file_id → file_path → bytes. Returns a data: URL the scanner takes.
 *  The download URL embeds the bot token — never log it. */
async function fetchPhotoDataUrl(token: string, fileId: string): Promise<string> {
  const metaRes = await fetch(`${API(token)}/getFile`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ file_id: fileId }),
  })
  if (!metaRes.ok) throw new Error(`getFile ${metaRes.status}`)
  const meta = await metaRes.json() as { ok?: boolean; result?: { file_path?: string } }
  const path = meta.result?.file_path
  if (!meta.ok || !path) throw new Error('file_path missing')

  const binRes = await fetch(`https://api.telegram.org/file/bot${token}/${path}`)
  if (!binRes.ok) throw new Error(`file bytes ${binRes.status}`)
  const bytes = new Uint8Array(await binRes.arrayBuffer())

  const mime = /\.png$/i.test(path) ? 'image/png' : /\.webp$/i.test(path) ? 'image/webp' : 'image/jpeg'
  return `data:${mime};base64,${encodeBase64(bytes)}`
}

// --- incoming update shapes (only the bits we read) -------------------------
interface TgMessage {
  message_id: number
  from?: { id?: number; is_bot?: boolean }
  chat?: { id?: number; type?: string }
  text?: string
  caption?: string
  photo?: PhotoSize[]
}
interface TgUpdate {
  update_id?: number
  message?: TgMessage
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 })

  // --- verify the secret token BEFORE trusting anything ---------------------
  const secret = Deno.env.get('TELEGRAM_WEBHOOK_SECRET')
  if (!secret) {
    console.error('TELEGRAM_WEBHOOK_SECRET not set')
    return new Response('server misconfigured', { status: 500 })
  }
  const header = req.headers.get('X-Telegram-Bot-Api-Secret-Token') ?? ''
  if (!timingSafeEqual(header, secret)) return new Response('bad secret', { status: 403 })

  let update: TgUpdate
  try {
    update = await req.json()
  } catch {
    return new Response('bad json', { status: 400 })
  }

  // ACK now; do the slow work in the background so Telegram doesn't retry (which
  // would double-deliver). waitUntil keeps the instance alive past the response.
  const work = handleUpdate(update).catch((e) => console.error('handleUpdate failed', e))
  // deno-lint-ignore no-explicit-any
  const runtime = (globalThis as any).EdgeRuntime
  if (runtime?.waitUntil) runtime.waitUntil(work)
  else await work

  return new Response('ok', { status: 200 })
})

// ---------------------------------------------------------------------------
// One inbound update, end to end. Runs in the background (post-ACK).
// ---------------------------------------------------------------------------
async function handleUpdate(update: TgUpdate): Promise<void> {
  const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN')
  if (!botToken) {
    console.error('TELEGRAM_BOT_TOKEN not set')
    return
  }

  // Only plain new messages. Edits, channel posts and callbacks are ignored:
  // re-running an edited "yes" would record a second transaction.
  const message = update.message
  const chatId = message?.chat?.id
  if (!message || chatId == null || message.from?.is_bot) return

  const chat = String(chatId)
  const reply = (body: string) => sendText(botToken, chat, body)

  // Private chats only — see the header note. A group would let every member
  // spend one user's binding.
  if (message.chat?.type !== 'private') {
    await reply("I only work in a direct chat — group chats aren't supported.")
    return
  }

  // Service-role client — NO RLS. Scope is enforced by hand from here on.
  const admin = adminClient()
  const text = (message.text ?? '').trim()

  // --- /start <token>: bind this chat to a user + book ----------------------
  const start = text.match(/^\/start(?:@\S+)?(?:\s+(\S+))?$/i)
  if (start) {
    const token = start[1] ?? ''
    if (!token) {
      // Bare /start — either already linked, or they found the bot on their own.
      const existing = await resolveBotLink(admin, CHANNEL, chat)
      await reply(existing
        ? `You're connected. ${HELP}`
        : 'Not connected yet. Open Tracr → Settings → Connect Telegram, and tap the link there to connect this chat.')
      return
    }
    const res = await consumeBotLinkToken(admin, CHANNEL, chat, token)
    await reply(res.ok ? `Connected to ${res.bookName}. ${HELP}` : res.message)
    return
  }

  if (/^\/help(?:@\S+)?$/i.test(text)) {
    await reply(HELP)
    return
  }

  // --- resolve the chat → (user_id, book_id) binding ------------------------
  const link = await resolveBotLink(admin, CHANNEL, chat)
  if (!link) {
    await reply('Not connected yet. Open Tracr → Settings → Connect Telegram to link this chat.')
    return
  }

  // --- /unlink: revoke from the chat side ----------------------------------
  // The binding is what gives this chat access, so deleting the row is a full
  // revoke. bot_history cascades with it.
  if (/^\/unlink(?:@\S+)?$/i.test(text)) {
    const { error } = await admin.from('bot_links')
      .delete().eq('channel', CHANNEL).eq('chat_id', chat)
    if (error) {
      console.error('unlink failed', error)
      await reply('Could not disconnect just now. Please try again.')
      return
    }
    await reply("Disconnected. This chat can't see your ledger any more.")
    return
  }

  touchBotLink(admin, CHANNEL, chat)

  // --- fetch media (transport-specific), then hand off to the shared core ---
  let imageDataUrls: string[] | undefined
  let turnText = text

  if (message.photo?.length) {
    // Note: an album arrives as several updates sharing a media_group_id, so each
    // photo is scanned as its own turn. The web app tiles multi-image scans; the
    // bot doesn't yet.
    const photo = pickPhoto(message.photo)
    turnText = (message.caption ?? '').trim()
    if (!photo) {
      await reply("I couldn't read that photo. Try sending it again.")
      return
    }
    sendTyping(botToken, chat)
    try {
      imageDataUrls = [await fetchPhotoDataUrl(botToken, photo.file_id)]
    } catch (e) {
      console.error('photo fetch failed', e)
      await reply("I couldn't download that photo. Try sending it again.")
      return
    }
  } else if (!text) {
    await reply('Send me a message or a photo of a receipt and I can log it for you.')
    return
  } else {
    sendTyping(botToken, chat)
  }

  const turn = await runBotTurn({ admin, channel: CHANNEL, chatId: chat, link, text: turnText, imageDataUrls })
  await reply(turn.text)
  // Files after the text so the reply reads before the download card lands.
  for (const file of turn.files) await sendDocument(botToken, chat, file)
}
