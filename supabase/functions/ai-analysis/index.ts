// AI spending insights — user-facing, tool-calling agent over the user's own
// ledger. Unlike the cron functions, this one is called from the browser by an
// authenticated user, so:
//
//   * It runs under the CALLER'S JWT, not the service role. The supabase client
//     is built from the incoming Authorization header, so every RPC the model
//     triggers is row-level-security scoped to that user. Personalization and
//     isolation are enforced by Postgres, not by the prompt.
//   * The model may only call the four read-only aggregate RPCs from migration
//     0029. It never sees raw rows and never writes SQL.
//   * Every call is metered against a per-user monthly cap (migration 0030)
//     before any tokens are spent.
//
// The LLM is reached through the OpenAI-compatible Chat Completions API, so any
// provider that speaks it works by changing secrets only — no code edit.
// Default target: DeepSeek direct with deepseek-v4-flash, thinking disabled.
//
// Required edge-function secrets (`supabase secrets set`):
//   LLM_API_KEY    — provider key (DeepSeek: sk-...)
// Optional (defaults target DeepSeek direct):
//   LLM_BASE_URL          (default 'https://api.deepseek.com')
//   LLM_MODEL             (default 'deepseek-v4-flash')
//   LLM_DISABLE_THINKING  (default 'true' — DeepSeek V4 thinks by default;
//                          disabling keeps insights fast + cheap. Set 'false'
//                          on providers that reject the `thinking` field, e.g.
//                          OpenRouter — there use base_url openrouter.ai/api/v1
//                          and model 'deepseek/deepseek-v4-flash'.)
//   LLM_SITE_URL          (optional HTTP-Referer, ignored by DeepSeek)
//   AI_MONTHLY_LIMIT      (default '50')
// SUPABASE_URL / SUPABASE_ANON_KEY are injected by the platform.
import { createClient } from 'jsr:@supabase/supabase-js@2'
import OpenAI from 'npm:openai'

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

// --- money formatting (mirror of src/lib/currencies.ts minor-unit places) ---
const DECIMALS: Record<string, number> = {
  IDR: 0, USD: 2, EUR: 2, SGD: 2, MYR: 2, JPY: 0, GBP: 2, AUD: 2,
  BTC: 8, ETH: 8, USDT: 2,
}
const decimalsOf = (code: string) => DECIMALS[code] ?? 2
function formatMoney(minor: number, currency: string): string {
  const d = decimalsOf(currency)
  const major = minor / 10 ** d
  try {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency', currency, minimumFractionDigits: d, maximumFractionDigits: d,
    }).format(major)
  } catch {
    return `${new Intl.NumberFormat('id-ID', { maximumFractionDigits: d }).format(major)} ${currency}`
  }
}

// --- the tools the model is allowed to call (OpenAI function schema) ---
// deno-lint-ignore no-explicit-any
const tools: any[] = [
  {
    type: 'function',
    function: {
      name: 'period_totals',
      description:
        'Total income, spending and net for a date range, one row per currency. ' +
        'To compare two periods (e.g. this month vs last month), call this twice.',
      parameters: {
        type: 'object',
        properties: {
          start: { type: 'string', description: 'Start date, inclusive, YYYY-MM-DD.' },
          end: { type: 'string', description: 'End date, inclusive, YYYY-MM-DD.' },
        },
        required: ['start', 'end'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'spending_summary',
      description:
        'Totals for a date range grouped by category, by month, or by account. ' +
        'Use group_by="category" to find where money went.',
      parameters: {
        type: 'object',
        properties: {
          start: { type: 'string', description: 'Start date, inclusive, YYYY-MM-DD.' },
          end: { type: 'string', description: 'End date, inclusive, YYYY-MM-DD.' },
          group_by: { type: 'string', enum: ['category', 'month', 'account'] },
          type: { type: 'string', enum: ['expense', 'income'], description: 'Defaults to expense.' },
        },
        required: ['start', 'end', 'group_by'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'top_transactions',
      description: 'The largest individual transactions in a date range (max 20).',
      parameters: {
        type: 'object',
        properties: {
          start: { type: 'string', description: 'Start date, inclusive, YYYY-MM-DD.' },
          end: { type: 'string', description: 'End date, inclusive, YYYY-MM-DD.' },
          type: { type: 'string', enum: ['expense', 'income'], description: 'Defaults to expense.' },
          limit: { type: 'integer', description: '1–20, default 10.' },
        },
        required: ['start', 'end'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'budget_status',
      description:
        "Each budget's limit vs how much has been spent in its current period, " +
        'with percent used. Use to find budgets that are over or nearly over.',
      parameters: {
        type: 'object',
        properties: {
          asof: { type: 'string', description: 'Reference date YYYY-MM-DD; defaults to today.' },
        },
      },
    },
  },
]

type Row = Record<string, unknown>
const fmtRows = (rows: Row[], map: (r: Row) => Row) => (rows ?? []).map(map)

// Dispatch one model tool call to its RPC and shape the result for the model.
// Money columns are formatted to strings here so the model never does minor-unit
// arithmetic — it just quotes what it gets.
async function runTool(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  bookId: string,
  name: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  const start = String(args.start ?? '')
  const end = String(args.end ?? '')

  if (name === 'period_totals') {
    const { data, error } = await supabase.rpc('ai_period_totals', {
      p_book_id: bookId, p_start: start, p_end: end,
    })
    if (error) return { error: error.message }
    return {
      rows: fmtRows(data, (r) => ({
        currency: r.currency,
        income: formatMoney(Number(r.income_minor), String(r.currency)),
        spending: formatMoney(Number(r.expense_minor), String(r.currency)),
        net: formatMoney(Number(r.net_minor), String(r.currency)),
        transactions: r.txn_count,
      })),
    }
  }

  if (name === 'spending_summary') {
    const { data, error } = await supabase.rpc('ai_spending_summary', {
      p_book_id: bookId, p_start: start, p_end: end,
      p_type: (args.type as string) ?? 'expense',
      p_group_by: (args.group_by as string) ?? 'category',
    })
    if (error) return { error: error.message }
    return {
      rows: fmtRows(data, (r) => ({
        name: r.bucket,
        currency: r.currency,
        total: formatMoney(Number(r.total_minor), String(r.currency)),
        transactions: r.txn_count,
      })),
    }
  }

  if (name === 'top_transactions') {
    const { data, error } = await supabase.rpc('ai_top_transactions', {
      p_book_id: bookId, p_start: start, p_end: end,
      p_type: (args.type as string) ?? 'expense',
      p_limit: Number(args.limit ?? 10),
    })
    if (error) return { error: error.message }
    return {
      rows: fmtRows(data, (r) => ({
        date: r.occurred_on,
        amount: formatMoney(Number(r.amount_minor), String(r.currency)),
        category: r.category,
        account: r.account,
        note: r.note,
      })),
    }
  }

  if (name === 'budget_status') {
    const { data, error } = await supabase.rpc('ai_budget_status', {
      p_book_id: bookId, p_asof: (args.asof as string) || new Date().toISOString().slice(0, 10),
    })
    if (error) return { error: error.message }
    return {
      rows: fmtRows(data, (r) => ({
        category: r.category,
        period: r.period,
        currency: r.currency,
        limit: formatMoney(Number(r.limit_minor), String(r.currency)),
        spent: formatMoney(Number(r.spent_minor), String(r.currency)),
        percent_used: r.pct,
      })),
    }
  }

  return { error: `unknown tool: ${name}` }
}

const MAX_STEPS = 6

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
    mode?: 'insights' | 'chat'
    book_id?: string
    lang?: string
    question?: string
    history?: { role: 'user' | 'model'; content: string }[]
  }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'bad request' }, 400)
  }

  const bookId = body.book_id
  if (!bookId) return json({ error: 'book_id required' }, 400)
  const mode = body.mode === 'chat' ? 'chat' : 'insights'
  const language = body.lang === 'id' ? 'Indonesian' : 'English'

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

  const systemPrompt =
    `You are the built-in money assistant for a personal finance app called Tracr. ` +
    `Today is ${today}. The user's base currency is ${baseCurrency}. You are looking ` +
    `at a single ledger (one "book").\n` +
    `Rules:\n` +
    `- Answer ONLY from the tools. Never invent or estimate numbers. If a tool ` +
    `returns no rows, say there is no data for that period.\n` +
    `- Amounts from tools are already formatted with the correct currency; quote ` +
    `them exactly as given.\n` +
    `- Be concise and concrete. Prefer short bullet points. Use plain, everyday ` +
    `words — no finance jargon.\n` +
    `- Reply in ${language}.\n` +
    `- If asked anything unrelated to this user's money, politely decline.`

  // deno-lint-ignore no-explicit-any
  const messages: any[] = [{ role: 'system', content: systemPrompt }]
  if (mode === 'chat') {
    const question = (body.question ?? '').trim()
    if (!question) return json({ error: 'question required' }, 400)
    for (const m of body.history ?? []) {
      // Map the app's 'model' role to OpenAI's 'assistant'.
      if (m?.content) messages.push({ role: m.role === 'model' ? 'assistant' : 'user', content: m.content })
    }
    messages.push({ role: 'user', content: question })
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

  try {
    for (let step = 0; step < MAX_STEPS; step++) {
      const res = await client.chat.completions.create({
        model,
        messages,
        tools,
        tool_choice: 'auto',
        temperature: 0.4,
        max_tokens: 800,
        // DeepSeek V4 non-thinking mode; harmlessly omitted for other providers.
        ...(disableThinking ? { thinking: { type: 'disabled' } } : {}),
        // deno-lint-ignore no-explicit-any
      } as any)

      const msg = res.choices[0]?.message
      const calls = msg?.tool_calls ?? []

      if (calls.length === 0) {
        return json({ text: msg?.content ?? '' })
      }

      // Echo the assistant's tool-call turn, then answer each call.
      messages.push(msg)
      for (const call of calls) {
        // Only function tool calls carry a name/arguments pair.
        // deno-lint-ignore no-explicit-any
        const fn = (call as any).function
        let args: Record<string, unknown> = {}
        try {
          args = fn?.arguments ? JSON.parse(fn.arguments) : {}
        } catch {
          args = {}
        }
        const result = await runTool(supabase, bookId, fn?.name ?? '', args)
        messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(result) })
      }
    }
    // Ran out of tool-call rounds without a final answer.
    return json({ text: '', error: 'The assistant took too long. Please try again.' }, 200)
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500)
  }
})
