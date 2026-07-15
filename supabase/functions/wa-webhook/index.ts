// WhatsApp bot webhook (Meta WhatsApp Cloud API).
//
// This exposes the SAME agent brain as ai-analysis (../_shared/ai-core.ts)
// through WhatsApp. The critical difference: there is NO user session on a
// webhook — Meta authenticates the request, not a user. So:
//
//   * Auth of the REQUEST is the HMAC signature check (X-Hub-Signature-256 vs
//     WA_APP_SECRET). The endpoint is public; the signature is the only gate.
//     Skipping it lets anyone forge messages.
//   * Auth of the USER is the phone → (user_id, book_id) binding in
//     whatsapp_links. A phone is bound once, via the LINK handshake.
//   * The Supabase client is the SERVICE ROLE — RLS does NOT protect us. Every
//     query is hard-scoped to the resolved book_id inside ai-core (audited) and
//     the user_id/book_id we pass in come ONLY from whatsapp_links. Never derive
//     scope from anything in the message body.
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
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { encodeBase64 } from 'jsr:@std/encoding@1/base64'
import OpenAI from 'npm:openai'
import {
  buildSystemPrompt,
  extractDocument,
  runAgentLoop,
  type ToolCtx,
} from '../_shared/ai-core.ts'

const GRAPH = 'https://graph.facebook.com/v21.0'
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
 *  extractDocument accepts. */
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

// --- conversation history (WhatsApp is stateless per call) ------------------
const HISTORY_LIMIT = 8
type Turn = { role: 'user' | 'model'; content: string }

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
  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  )

  const textBody = (message.text?.body ?? '').trim()

  // --- LINK handshake: "LINK <token>" binds this phone to a user + book ------
  if (/^LINK\s+/i.test(textBody)) {
    await handleLink(admin, from, textBody.replace(/^LINK\s+/i, '').trim(), reply)
    return
  }

  // --- resolve the phone → (user_id, book_id) binding ------------------------
  const { data: link } = await admin
    .from('whatsapp_links')
    .select('user_id, book_id')
    .eq('wa_phone', from)
    .maybeSingle()
  if (!link) {
    await reply('Not connected yet. Open Tracr → Settings → Connect WhatsApp to link this number.')
    return
  }
  admin.from('whatsapp_links').update({ last_seen_at: new Date().toISOString() }).eq('wa_phone', from)
    .then(() => {}, () => {})

  // --- meter (service-role variant; ai_try_consume uses auth.uid()) ----------
  const monthlyLimit = Number(Deno.env.get('AI_MONTHLY_LIMIT') ?? '50')
  const { data: allowed, error: capErr } = await admin.rpc('ai_try_consume_for', {
    p_user: link.user_id, p_max: monthlyLimit,
  })
  if (capErr) {
    console.error('meter failed', capErr)
    await reply('Something went wrong on my side. Please try again in a bit.')
    return
  }
  if (!allowed) {
    await reply("You've reached this month's assistant limit. It resets at the start of next month.")
    return
  }

  // --- LLM config ------------------------------------------------------------
  const apiKey = Deno.env.get('LLM_API_KEY')
  if (!apiKey) {
    await reply('The assistant is not configured yet.')
    return
  }
  const baseURL = Deno.env.get('LLM_BASE_URL') ?? 'https://api.deepseek.com'
  const model = Deno.env.get('LLM_MODEL') ?? 'deepseek-v4-flash'
  const disableThinking = (Deno.env.get('LLM_DISABLE_THINKING') ?? 'true') === 'true'

  // Base currency, scoped to the linked user by hand.
  const { data: profile } = await admin
    .from('profiles').select('base_currency').eq('id', link.user_id).single()
  const baseCurrency = profile?.base_currency ?? 'IDR'
  const today = new Date().toISOString().slice(0, 10)

  // --- load rolling history --------------------------------------------------
  const { data: hist } = await admin
    .from('whatsapp_history').select('turns').eq('wa_phone', from).maybeSingle()
  const priorTurns: Turn[] = Array.isArray(hist?.turns) ? hist!.turns as Turn[] : []

  // --- assemble messages -----------------------------------------------------
  const systemPrompt = buildSystemPrompt({ today, baseCurrency, language: 'English', channel: 'whatsapp' })
  // deno-lint-ignore no-explicit-any
  const messages: any[] = [{ role: 'system', content: systemPrompt }]
  for (const t of priorTurns) {
    if (t?.content) messages.push({ role: t.role === 'model' ? 'assistant' : 'user', content: t.content })
  }

  // A short, human-readable record of THIS turn to persist afterwards (never the
  // giant scan JSON — that stays ephemeral, like the app does).
  let userTurnText = textBody

  if (message.type === 'image' && message.image?.id) {
    const caption = (message.image.caption ?? '').trim()
    try {
      const dataUrl = await fetchMediaDataUrl(message.image.id, waToken)
      const scan = await extractDocument([dataUrl], caption)
      messages.push({
        role: 'user',
        content: (caption ? `${caption}\n\n` : '') + `[DOCUMENT_SCAN]\n${JSON.stringify(scan)}`,
      })
      userTurnText = caption ? `[photo] ${caption}` : '[photo]'
    } catch (e) {
      const notConfigured = e instanceof Error && e.message === 'vision-not-configured'
      await reply(notConfigured
        ? "Photo reading isn't enabled yet. Please type the amount instead."
        : "I couldn't read that photo. Try a clearer one, or type the amount.")
      return
    }
  } else if (message.type === 'text' && textBody) {
    messages.push({ role: 'user', content: textBody })
  } else {
    await reply('Send me a message or a photo of a receipt and I can log it for you.')
    return
  }

  // --- run the shared agent loop (service-role, hard-scoped) -----------------
  const client = new OpenAI({
    apiKey,
    baseURL,
    defaultHeaders: {
      'HTTP-Referer': Deno.env.get('LLM_SITE_URL') ?? 'https://tracr.app',
      'X-Title': 'Tracr',
    },
  })
  const ctx: ToolCtx = {
    supabase: admin,
    bookId: link.book_id,
    userId: link.user_id,
    baseCurrency,
    source: 'whatsapp',
    onRecorded: () => {},
  }

  let replyText: string
  try {
    const result = await runAgentLoop({ client, model, messages, ctx, disableThinking })
    replyText = result.timedOut || !result.text
      ? 'Sorry, that took too long. Please try again.'
      : result.text
  } catch (e) {
    console.error('agent loop failed', e)
    await reply('Something went wrong reading that. Please try again.')
    return
  }

  await reply(replyText)

  // --- persist the trimmed history ------------------------------------------
  const nextTurns = [...priorTurns, { role: 'user', content: userTurnText }, { role: 'model', content: replyText }]
    .slice(-HISTORY_LIMIT)
  await admin.from('whatsapp_history')
    .upsert({ wa_phone: from, turns: nextTurns, updated_at: new Date().toISOString() })
}

// ---------------------------------------------------------------------------
// LINK handshake: consume a one-time token, bind the phone. Service role only.
// ---------------------------------------------------------------------------
// deno-lint-ignore no-explicit-any
async function handleLink(admin: any, from: string, token: string, reply: (b: string) => Promise<void>) {
  if (!token) {
    await reply('That link looks incomplete. Please tap Connect WhatsApp in Tracr again.')
    return
  }
  const { data: row } = await admin
    .from('whatsapp_link_tokens')
    .select('token, user_id, book_id, expires_at, used_at')
    .eq('token', token)
    .maybeSingle()

  if (!row || row.used_at || new Date(row.expires_at).getTime() < Date.now()) {
    await reply('That link has expired. Open Tracr → Settings → Connect WhatsApp for a fresh one.')
    return
  }

  // Bind the phone (upsert so re-linking a number just moves it to the new book).
  const { error: linkErr } = await admin.from('whatsapp_links').upsert({
    wa_phone: from,
    user_id: row.user_id,
    book_id: row.book_id,
    linked_at: new Date().toISOString(),
    last_seen_at: new Date().toISOString(),
  })
  if (linkErr) {
    console.error('link upsert failed', linkErr)
    await reply('Could not connect just now. Please try again.')
    return
  }
  await admin.from('whatsapp_link_tokens').update({ used_at: new Date().toISOString() }).eq('token', token)

  const { data: book } = await admin.from('books').select('name').eq('id', row.book_id).maybeSingle()
  const bookName = book?.name ?? 'your ledger'
  await reply(`Connected to *${bookName}*. Send me an expense like "Lunch 45k" or a photo of a receipt and I'll log it.`)
}
