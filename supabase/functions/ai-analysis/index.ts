// AI spending insights — user-facing, tool-calling agent over the user's own
// ledger. Unlike the cron functions, this one is called from the browser by an
// authenticated user, so:
//
//   * It runs under the CALLER'S JWT, not the service role. The supabase client
//     is built from the incoming Authorization header, so every RPC/query the
//     model triggers is row-level-security scoped to that user. Personalization
//     and isolation are enforced by Postgres, not by the prompt.
//   * Reads go through the four aggregate RPCs from migration 0029 (the model
//     never sees raw rows) plus a names-only account list. The ONE write the
//     model can do is record_transaction, which is validated in the shared core
//     (enum/type/amount bounds, account must belong to the book, currency must
//     match the account) and inserted under RLS — and the prompt requires an
//     explicit user confirmation first.
//   * Every call is metered against a per-user monthly cap (migration 0030)
//     before any tokens are spent.
//
// The agent brain (tool schema, tool loop, validation, document extraction) lives
// in ../_shared/ai-core.ts and is shared verbatim with the wa-webhook (WhatsApp)
// function. The ONLY difference between the two callers is how the Supabase
// client is built and scoped — here it is the caller's JWT client, so RLS is the
// safety net; in the webhook it is the service role and book_id filters are.
//
// Document scanning is a two-model pipeline:
//   photo → Gemini (vision, strict-JSON extraction only, no tools)
//         → DeepSeek (reads the JSON, talks to the user, records on confirm)
//
// The LLM is reached through the OpenAI-compatible Chat Completions API, so any
// provider that speaks it works by changing secrets only — no code edit.
//
// Required edge-function secrets (`supabase secrets set`):
//   LLM_API_KEY     — text-model key (DeepSeek: sk-...)
//   GEMINI_API_KEY  — vision key from Google AI Studio (receipt scan only;
//                     without it, photo messages get a friendly "not set up"
//                     reply and text chat keeps working)
// Optional:
//   LLM_BASE_URL          (default 'https://api.deepseek.com')
//   LLM_MODEL             (default 'deepseek-v4-flash')
//   LLM_DISABLE_THINKING  (default 'true')
//   LLM_SITE_URL          (optional HTTP-Referer)
//   GEMINI_BASE_URL       (default Google's OpenAI-compat endpoint)
//   GEMINI_MODEL          (default 'gemini-3.1-flash-lite')
//   AI_MONTHLY_LIMIT      (default '50')
// SUPABASE_URL / SUPABASE_ANON_KEY are injected by the platform.
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { encodeBase64 } from 'jsr:@std/encoding@1/base64'
import OpenAI from 'npm:openai'
import {
  buildSystemPrompt,
  extractDocument,
  generateReport,
  MAX_IMAGE_CHARS,
  MAX_IMAGES,
  MAX_TOTAL_IMAGE_CHARS,
  runAgentLoop,
  type ToolCtx,
} from '../_shared/ai-core.ts'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405)

  const authHeader = req.headers.get('Authorization') ?? ''
  if (!authHeader) return json({ error: 'unauthorized' }, 401)

  const apiKey = Deno.env.get('LLM_API_KEY')
  if (!apiKey) return json({ error: 'AI is not configured' }, 500)
  const baseURL = Deno.env.get('LLM_BASE_URL') ?? 'https://api.deepseek.com'
  const model = Deno.env.get('LLM_MODEL') ?? 'deepseek-v4-flash'
  const disableThinking = (Deno.env.get('LLM_DISABLE_THINKING') ?? 'true') === 'true'
  const monthlyLimit = Number(Deno.env.get('AI_MONTHLY_LIMIT') ?? '50')

  // User-scoped client: the caller's JWT rides on every query → RLS applies.
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } },
  )

  const { data: userData } = await supabase.auth.getUser()
  const user = userData?.user
  if (!user) return json({ error: 'unauthorized' }, 401)

  let body: {
    mode?: 'insights' | 'chat' | 'scan' | 'report'
    book_id?: string
    lang?: string
    question?: string
    /** Report period (mode 'report' only), YYYY-MM-DD. */
    start?: string
    end?: string
    /** Receipt photo as a data URL (image/jpeg|png|webp). Chat mode only. */
    image?: string
    /** Receipt, statement, or e-wallet history images for structured extraction. */
    images?: string[]
    history?: { role: 'user' | 'model'; content: string }[]
  }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'bad request' }, 400)
  }

  const bookId = body.book_id
  if (!bookId) return json({ error: 'book_id required' }, 400)
  const mode = body.mode === 'chat' || body.mode === 'scan' ? body.mode : 'insights'
  const language = body.lang === 'id' ? 'Indonesian' : 'English'

  // A report is deterministic — it is built from the same aggregate RPCs the app
  // uses, so it needs NEITHER the LLM NOR a metered turn. The browser resolves
  // the period from a picker and posts explicit dates; we render and return the
  // file. (The bots reach the same builder through the generate_report tool,
  // because a chat has no period picker.)
  if (body.mode === 'report') {
    const { data: rProfile } = await supabase
      .from('profiles').select('base_currency').eq('id', user.id).single()
    let file: { filename: string; mime: string; bytes: Uint8Array } | undefined
    const ctx: ToolCtx = {
      supabase,
      bookId,
      userId: user.id,
      baseCurrency: rProfile?.base_currency ?? 'IDR',
      source: 'web',
      lang: body.lang === 'id' ? 'id' : 'en',
      onRecorded: () => {},
      onFile: (f) => {
        file = f
        return true
      },
    }
    const result = await generateReport(ctx, {
      start: String(body.start ?? ''),
      end: String(body.end ?? ''),
    })
    if (file) {
      return json({ files: [{ name: file.filename, mime: file.mime, data: encodeBase64(file.bytes) }] })
    }
    // generateReport only ever declines with an { error } string; the one the
    // user will actually hit is an empty period, which we flag for a clean
    // client-side message instead of leaking the model-facing text.
    const err = (result as { error?: string }).error ?? 'could not build the report'
    return json({ empty: /no transactions/i.test(err), error: err }, 200)
  }

  const images = Array.isArray(body.images)
    ? body.images.filter((item): item is string => typeof item === 'string')
    : typeof body.image === 'string'
      ? [body.image]
      : []
  if (images.length > MAX_IMAGES) return json({ error: 'too many images' }, 413)
  if (images.some((image) => !/^data:image\/(jpeg|png|webp);base64,/.test(image))) {
    return json({ error: 'bad image' }, 400)
  }
  if (
    images.some((image) => image.length > MAX_IMAGE_CHARS) ||
    images.reduce((total, image) => total + image.length, 0) > MAX_TOTAL_IMAGE_CHARS
  ) {
    return json({ error: 'image too large' }, 413)
  }

  // Meter first — refuse before spending any tokens.
  const { data: allowed, error: capErr } = await supabase.rpc('ai_try_consume', {
    p_max: monthlyLimit,
  })
  if (capErr) return json({ error: capErr.message }, 500)
  if (!allowed) return json({ limited: true })

  // Base currency for context (RLS-scoped read of the caller's own profile).
  const { data: profile } = await supabase
    .from('profiles').select('base_currency').eq('id', user.id).single()
  const baseCurrency = profile?.base_currency ?? 'IDR'
  const today = new Date().toISOString().slice(0, 10)
  // Scanner results never enter the text-model tool loop. The browser shows a
  // review screen and only its explicit bulk confirmation can create records.
  if (mode === 'scan') {
    if (images.length === 0) return json({ error: 'image required' }, 400)
    try {
      return json({ scan: await extractDocument(images, (body.question ?? '').trim()) })
    } catch (e) {
      const notConfigured = e instanceof Error && e.message === 'vision-not-configured'
      return json({
        error: notConfigured
          ? 'Photo reading is not enabled on the server.'
          : 'The document could not be read. Please try clearer screenshots.',
      }, notConfigured ? 503 : 422)
    }
  }

  const systemPrompt = buildSystemPrompt({ today, baseCurrency, language, channel: 'web' })

  // deno-lint-ignore no-explicit-any
  const messages: any[] = [{ role: 'system', content: systemPrompt }]
  if (mode === 'chat') {
    const question = (body.question ?? '').trim()
    if (!question && images.length === 0) return json({ error: 'question required' }, 400)
    for (const m of body.history ?? []) {
      // Map the app's 'model' role to OpenAI's 'assistant'.
      if (m?.content) messages.push({ role: m.role === 'model' ? 'assistant' : 'user', content: m.content })
    }

    if (images.length > 0) {
      try {
        const scan = await extractDocument(images, question)
        messages.push({
          role: 'user',
          content: (question ? `${question}\n\n` : '') + `[DOCUMENT_SCAN]\n${JSON.stringify(scan)}`,
        })
      } catch (e) {
        const notConfigured = e instanceof Error && e.message === 'vision-not-configured'
        return json({
          text:
            language === 'Indonesian'
              ? notConfigured
                ? 'Fitur baca foto belum diaktifkan di server.'
                : 'Fotonya tidak bisa kubaca. Coba foto ulang yang lebih terang.'
              : notConfigured
                ? "Photo reading isn't enabled on the server yet."
                : "I couldn't read that photo. Try clearer screenshots.",
        })
      }
    } else {
      messages.push({ role: 'user', content: question })
    }
  } else {
    messages.push({
      role: 'user',
      content:
        'Summarize my spending for the current month: the total spent and how ' +
        'it compares with last month, my top 3–4 spending categories, and any ' +
        'budgets that are over or nearly over. Keep it short and use bullet points.',
    })
  }

  const client = new OpenAI({
    apiKey,
    baseURL,
    defaultHeaders: {
      'HTTP-Referer': Deno.env.get('LLM_SITE_URL') ?? 'https://tracr.app',
      'X-Title': 'Tracr',
    },
  })

  const ctx: ToolCtx = {
    supabase,
    bookId,
    userId: user.id,
    baseCurrency,
    source: 'web',
    lang: body.lang === 'id' ? 'id' : 'en',
    onRecorded: () => {},
  }

  try {
    const result = await runAgentLoop({ client, model, messages, ctx, disableThinking })
    if (result.timedOut) {
      return json(
        { text: '', error: 'The assistant took too long. Please try again.', ...(result.recorded ? { recorded: true } : {}) },
        200,
      )
    }
    // Tool-produced files (PDF reports) ride along base64'd — a report is
    // ~30–100KB, comfortably inside a JSON response.
    const files = result.files.map((f) => ({
      name: f.filename,
      mime: f.mime,
      data: encodeBase64(f.bytes),
    }))
    return json({
      text: result.text,
      ...(result.recorded ? { recorded: true } : {}),
      ...(files.length > 0 ? { files } : {}),
    })
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500)
  }
})
