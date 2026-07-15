// WhatsApp transport (Meta WhatsApp Cloud API).
//
// PARKED: this channel needs Meta Business verification, which is not done. The
// code is kept working and on the shared core so it can be switched on later;
// Telegram (../tg-webhook) is the live channel. Anything you change in the
// message pipeline belongs in ../_shared/bot-core.ts, not here.
//
// This file is transport only: authenticate the request, parse the update, fetch
// media bytes, hand the turn to bot-core, send the reply string back.
//
//   * Auth of the REQUEST is the HMAC signature check (X-Hub-Signature-256 vs
//     WA_APP_SECRET). The endpoint is public; the signature is the only gate.
//     Skipping it lets anyone forge messages.
//   * Auth of the USER is the phone -> (user_id, book_id) binding in bot_links.
//     A phone is bound once, via the LINK handshake.
//
// Meta retries a webhook that doesn't 200 within ~20s, which would double-deliver
// (and could double-record a "yes"). We therefore ACK immediately after the
// signature check and do the slow work (LLM, vision, DB) in the background via
// EdgeRuntime.waitUntil.
//
// Secrets (`supabase secrets set`):
//   WHATSAPP_TOKEN   — permanent system-user token (Graph API: send + media)
//   PHONE_NUMBER_ID  — sender phone-number id (falls back to webhook metadata)
//   WA_APP_SECRET    — Meta app secret, for the payload signature
//   WA_VERIFY_TOKEN  — random string you also enter in the Meta webhook config
//   (LLM_* / GEMINI_* / AI_MONTHLY_LIMIT already set for ai-analysis)
// SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are injected by the platform.
import { encodeBase64 } from 'jsr:@std/encoding@1/base64'
import {
  adminClient,
  consumeBotLinkToken,
  resolveBotLink,
  runBotTurn,
  touchBotLink,
} from '../_shared/bot-core.ts'

const GRAPH = 'https://graph.facebook.com/v21.0'
const CHANNEL = 'whatsapp' as const
const enc = new TextEncoder()

// --- signature verification (the only auth on a public webhook) -------------
const toHex = (buf: ArrayBuffer) =>
  [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')

/** Constant-time string compare so we don't leak the signature via timing. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

async function verifySignature(raw: string, header: string | null, secret: string): Promise<boolean> {
  if (!header || !header.startsWith('sha256=')) return false
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  )
  const mac = await crypto.subtle.sign('HMAC', key, enc.encode(raw))
  return timingSafeEqual(toHex(mac), header.slice('sha256='.length))
}

// --- Graph API helpers ------------------------------------------------------
/** Normalize a WhatsApp phone to E.164 without '+'. Must be IDENTICAL on link
 *  and lookup or bindings silently fail. */
const normPhone = (raw: string) => raw.replace(/\D/g, '')

async function sendText(phoneId: string, token: string, to: string, body: string): Promise<void> {
  const res = await fetch(`${GRAPH}/${phoneId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      // WhatsApp caps a text body at 4096 chars.
      text: { body: body.slice(0, 4096) },
    }),
  })
  if (!res.ok) console.error('wa send failed', res.status, await res.text().catch(() => ''))
}

/** Two authed calls: media id → media URL → bytes. Returns a data: URL that
 *  the scanner accepts. */
async function fetchMediaDataUrl(mediaId: string, token: string): Promise<string> {
  const metaRes = await fetch(`${GRAPH}/${mediaId}`, { headers: { Authorization: `Bearer ${token}` } })
  if (!metaRes.ok) throw new Error(`media meta ${metaRes.status}`)
  const meta = await metaRes.json() as { url?: string; mime_type?: string }
  if (!meta.url) throw new Error('media url missing')

  const binRes = await fetch(meta.url, { headers: { Authorization: `Bearer ${token}` } })
  if (!binRes.ok) throw new Error(`media bytes ${binRes.status}`)
  const bytes = new Uint8Array(await binRes.arrayBuffer())

  const mime = /^image\/(jpeg|png|webp)$/.test(meta.mime_type ?? '') ? meta.mime_type : 'image/jpeg'
  return `data:${mime};base64,${encodeBase64(bytes)}`
}

// --- incoming payload shapes (only the bits we read) ------------------------
interface WaMessage {
  from: string
  id: string
  type: string
  text?: { body?: string }
  image?: { id?: string; caption?: string; mime_type?: string }
}
interface WaValue {
  metadata?: { phone_number_id?: string }
  messages?: WaMessage[]
}

Deno.serve(async (req) => {
  const url = new URL(req.url)

  // --- GET: Meta's verification handshake -----------------------------------
  if (req.method === 'GET') {
    const verifyToken = Deno.env.get('WA_VERIFY_TOKEN')
    const mode = url.searchParams.get('hub.mode')
    const token = url.searchParams.get('hub.verify_token')
    const challenge = url.searchParams.get('hub.challenge')
    if (mode === 'subscribe' && verifyToken && token === verifyToken) {
      return new Response(challenge ?? '', { status: 200 })
    }
    return new Response('forbidden', { status: 403 })
  }

  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 })

  // --- POST: verify signature over the RAW body BEFORE trusting anything -----
  const appSecret = Deno.env.get('WA_APP_SECRET')
  if (!appSecret) {
    console.error('WA_APP_SECRET not set')
    return new Response('server misconfigured', { status: 500 })
  }
  const raw = await req.text()
  const ok = await verifySignature(raw, req.headers.get('X-Hub-Signature-256'), appSecret)
  if (!ok) return new Response('bad signature', { status: 403 })

  let payload: { entry?: { changes?: { value?: WaValue }[] }[] }
  try {
    payload = JSON.parse(raw)
  } catch {
    return new Response('bad json', { status: 400 })
  }

  // Collect real inbound messages (ignore delivery-status callbacks).
  const jobs: { value: WaValue; message: WaMessage }[] = []
  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value
      for (const message of value?.messages ?? []) {
        if (message?.from && message?.type) jobs.push({ value: value!, message })
      }
    }
  }

  // ACK now; do the slow work in the background so Meta doesn't retry (which
  // would double-deliver). waitUntil keeps the instance alive past the response.
  const work = Promise.all(jobs.map((j) => handleMessage(j.value, j.message).catch((e) =>
    console.error('handleMessage failed', e),
  )))
  // deno-lint-ignore no-explicit-any
  const runtime = (globalThis as any).EdgeRuntime
  if (runtime?.waitUntil) runtime.waitUntil(work)
  else await work

  return new Response('ok', { status: 200 })
})

// ---------------------------------------------------------------------------
// One inbound message, end to end. Runs in the background (post-ACK).
// ---------------------------------------------------------------------------
async function handleMessage(value: WaValue, message: WaMessage): Promise<void> {
  const waToken = Deno.env.get('WHATSAPP_TOKEN')
  if (!waToken) {
    console.error('WHATSAPP_TOKEN not set')
    return
  }
  const phoneId = Deno.env.get('PHONE_NUMBER_ID') ?? value.metadata?.phone_number_id
  if (!phoneId) {
    console.error('no phone_number_id (secret or metadata)')
    return
  }
  const from = normPhone(message.from)
  const reply = (body: string) => sendText(phoneId, waToken, from, body)

  // Service-role client — NO RLS. Scope is enforced by hand from here on.
  const admin = adminClient()
  const textBody = (message.text?.body ?? '').trim()

  // --- LINK handshake: "LINK <token>" binds this phone to a user + book ------
  if (/^LINK\s+/i.test(textBody)) {
    const res = await consumeBotLinkToken(admin, CHANNEL, from, textBody.replace(/^LINK\s+/i, '').trim())
    await reply(res.ok
      ? `Connected to *${res.bookName}*. Send me an expense like "Lunch 45k" or a photo of a receipt and I'll log it.`
      : res.message)
    return
  }

  // --- resolve the phone → (user_id, book_id) binding ------------------------
  const link = await resolveBotLink(admin, CHANNEL, from)
  if (!link) {
    await reply('Not connected yet. Open Tracr → Settings → Connect WhatsApp to link this number.')
    return
  }
  touchBotLink(admin, CHANNEL, from)

  // --- fetch media (transport-specific), then hand off to the shared core ----
  let imageDataUrls: string[] | undefined
  let text = textBody

  if (message.type === 'image' && message.image?.id) {
    text = (message.image.caption ?? '').trim()
    try {
      imageDataUrls = [await fetchMediaDataUrl(message.image.id, waToken)]
    } catch (e) {
      console.error('media fetch failed', e)
      await reply("I couldn't download that photo. Try sending it again.")
      return
    }
  } else if (message.type !== 'text' || !textBody) {
    await reply('Send me a message or a photo of a receipt and I can log it for you.')
    return
  }

  await reply(await runBotTurn({ admin, channel: CHANNEL, chatId: from, link, text, imageDataUrls }))
}
