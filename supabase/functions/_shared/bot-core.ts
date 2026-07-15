// Shared plumbing for chat-bot channels (WhatsApp, Telegram).
//
// Split of responsibility:
//   * ai-core.ts  — the agent brain (tools, tool loop, validation, vision).
//                   Knows nothing about chats.
//   * bot-core.ts — everything a webhook channel needs around that brain:
//                   the chat -> (user, book) binding, the metering call, the
//                   rolling history, and the one-turn pipeline.
//   * <x>-webhook — pure transport: authenticate the request, parse the update,
//                   fetch media bytes, send the reply string back.
//
// Adding a channel should mean writing a transport, not another agent loop.
//
// SECURITY — read before touching any of this:
//   A webhook has NO user session. Meta/Telegram authenticate the REQUEST; they
//   say nothing about who the user is. So these functions run under the SERVICE
//   ROLE and RLS does not protect them. The (channel, chat_id) -> (user_id,
//   book_id) row in bot_links is the entire security boundary, and every scope
//   value passed into ai-core must come from it. Never derive user_id or book_id
//   from anything in the message body, and never call runBotTurn with a link the
//   transport did not resolve for the authenticated sender.
import { createClient } from 'jsr:@supabase/supabase-js@2'
import OpenAI from 'npm:openai'
import { buildSystemPrompt, extractDocument, runAgentLoop, type ToolCtx } from './ai-core.ts'

export type BotChannel = 'whatsapp' | 'telegram'

/** How many turns of chat history to keep per chat. A webhook is stateless per
 *  call, so "yes" only means something if the previous turns are replayed. */
export const HISTORY_LIMIT = 8
export type Turn = { role: 'user' | 'model'; content: string }

export interface BotLink {
  user_id: string
  book_id: string
}

/** The service-role client. NO RLS — see the security note at the top. */
// deno-lint-ignore no-explicit-any
export function adminClient(): any {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  )
}

// deno-lint-ignore no-explicit-any
export async function resolveBotLink(admin: any, channel: BotChannel, chatId: string): Promise<BotLink | null> {
  const { data } = await admin
    .from('bot_links')
    .select('user_id, book_id')
    .eq('channel', channel)
    .eq('chat_id', chatId)
    .maybeSingle()
  return data ?? null
}

/** Best-effort last_seen stamp. Never blocks or fails a turn. */
// deno-lint-ignore no-explicit-any
export function touchBotLink(admin: any, channel: BotChannel, chatId: string): void {
  admin.from('bot_links')
    .update({ last_seen_at: new Date().toISOString() })
    .eq('channel', channel).eq('chat_id', chatId)
    .then(() => {}, () => {})
}

/** Consume a one-time link token and bind this chat. The token is the proof of
 *  identity — it was minted by bot_mint_link_token() under the signed-in user's
 *  own auth.uid(), so whoever holds it is that user. It must be unused, unexpired
 *  and minted for THIS channel: a token is a capability, and letting one channel
 *  spend another's would let a leaked prefill bind the wrong transport. */
export async function consumeBotLinkToken(
  // deno-lint-ignore no-explicit-any
  admin: any,
  channel: BotChannel,
  chatId: string,
  token: string,
): Promise<{ ok: true; bookName: string } | { ok: false; message: string }> {
  const expired = 'That link has expired. Open Tracr and tap Connect again for a fresh one.'
  if (!token) return { ok: false, message: 'That link looks incomplete. Please tap Connect in Tracr again.' }

  const { data: row } = await admin
    .from('bot_link_tokens')
    .select('token, channel, user_id, book_id, expires_at, used_at')
    .eq('token', token)
    .maybeSingle()

  if (!row || row.channel !== channel || row.used_at || new Date(row.expires_at).getTime() < Date.now()) {
    return { ok: false, message: expired }
  }

  // Upsert so re-linking a chat just moves it to the newer book.
  const { error: linkErr } = await admin.from('bot_links').upsert({
    channel,
    chat_id: chatId,
    user_id: row.user_id,
    book_id: row.book_id,
    linked_at: new Date().toISOString(),
    last_seen_at: new Date().toISOString(),
  })
  if (linkErr) {
    console.error('link upsert failed', linkErr)
    return { ok: false, message: 'Could not connect just now. Please try again.' }
  }

  // Burn the token only after the binding succeeded, so a failed upsert leaves
  // it usable for a retry.
  await admin.from('bot_link_tokens').update({ used_at: new Date().toISOString() }).eq('token', token)

  const { data: book } = await admin.from('books').select('name').eq('id', row.book_id).maybeSingle()
  return { ok: true, bookName: book?.name ?? 'your ledger' }
}

/** Run one inbound message end to end and return the reply text to send.
 *
 *  `link` MUST be the row resolved for the authenticated sender — it is the only
 *  thing scoping the service-role queries underneath. Never fabricate one.
 *
 *  Images are passed in already fetched (each transport downloads media its own
 *  way); the scan itself, and the [DOCUMENT_SCAN] handoff to the agent, are
 *  shared so both channels behave identically. */
export async function runBotTurn(opts: {
  // deno-lint-ignore no-explicit-any
  admin: any
  channel: BotChannel
  chatId: string
  link: BotLink
  /** Message text, or an image caption. May be empty for a bare photo. */
  text: string
  imageDataUrls?: string[]
}): Promise<string> {
  const { admin, channel, chatId, link, text, imageDataUrls = [] } = opts

  // --- meter (service-role variant; ai_try_consume reads auth.uid()) ---------
  const monthlyLimit = Number(Deno.env.get('AI_MONTHLY_LIMIT') ?? '50')
  const { data: allowed, error: capErr } = await admin.rpc('ai_try_consume_for', {
    p_user: link.user_id, p_max: monthlyLimit,
  })
  if (capErr) {
    console.error('meter failed', capErr)
    return 'Something went wrong on my side. Please try again in a bit.'
  }
  if (!allowed) {
    return "You've reached this month's assistant limit. It resets at the start of next month."
  }

  // --- LLM config ------------------------------------------------------------
  const apiKey = Deno.env.get('LLM_API_KEY')
  if (!apiKey) return 'The assistant is not configured yet.'
  const baseURL = Deno.env.get('LLM_BASE_URL') ?? 'https://api.deepseek.com'
  const model = Deno.env.get('LLM_MODEL') ?? 'deepseek-v4-flash'
  const disableThinking = (Deno.env.get('LLM_DISABLE_THINKING') ?? 'true') === 'true'

  // Base currency, scoped to the linked user by hand.
  const { data: profile } = await admin
    .from('profiles').select('base_currency').eq('id', link.user_id).single()
  const baseCurrency = profile?.base_currency ?? 'IDR'
  const today = new Date().toISOString().slice(0, 10)

  // --- history ---------------------------------------------------------------
  const { data: hist } = await admin
    .from('bot_history').select('turns')
    .eq('channel', channel).eq('chat_id', chatId)
    .maybeSingle()
  const priorTurns: Turn[] = Array.isArray(hist?.turns) ? hist!.turns as Turn[] : []

  // deno-lint-ignore no-explicit-any
  const messages: any[] = [
    { role: 'system', content: buildSystemPrompt({ today, baseCurrency, language: 'English', channel }) },
  ]
  for (const t of priorTurns) {
    if (t?.content) messages.push({ role: t.role === 'model' ? 'assistant' : 'user', content: t.content })
  }

  // A short, human-readable record of THIS turn to persist afterwards (never the
  // giant scan JSON — that stays ephemeral, like the app does).
  let userTurnText = text

  if (imageDataUrls.length > 0) {
    try {
      const scan = await extractDocument(imageDataUrls, text)
      messages.push({
        role: 'user',
        content: (text ? `${text}\n\n` : '') + `[DOCUMENT_SCAN]\n${JSON.stringify(scan)}`,
      })
      userTurnText = text ? `[photo] ${text}` : '[photo]'
    } catch (e) {
      const notConfigured = e instanceof Error && e.message === 'vision-not-configured'
      console.error('scan failed', e)
      return notConfigured
        ? "Photo reading isn't enabled yet. Please type the amount instead."
        : "I couldn't read that photo. Try a clearer one, or type the amount."
    }
  } else if (text) {
    messages.push({ role: 'user', content: text })
  } else {
    return 'Send me a message or a photo of a receipt and I can log it for you.'
  }

  // --- shared agent loop (service-role, hard-scoped by `link`) ---------------
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
    source: channel,
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
    return 'Something went wrong reading that. Please try again.'
  }

  // --- persist the trimmed history ------------------------------------------
  const nextTurns: Turn[] = [
    ...priorTurns,
    { role: 'user' as const, content: userTurnText },
    { role: 'model' as const, content: replyText },
  ].slice(-HISTORY_LIMIT)
  await admin.from('bot_history').upsert({
    channel, chat_id: chatId, turns: nextTurns, updated_at: new Date().toISOString(),
  })

  return replyText
}
