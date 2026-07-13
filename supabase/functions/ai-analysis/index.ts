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
//     model can do is record_transaction, which is validated here (enum/type/
//     amount bounds, account must belong to the book, currency must match the
//     account) and inserted under RLS — and the prompt requires an explicit
//     user confirmation first.
//   * Every call is metered against a per-user monthly cap (migration 0030)
//     before any tokens are spent.
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
  {
    type: 'function',
    function: {
      name: 'list_accounts',
      description:
        "The user's wallets/accounts (name and currency). Call before recording " +
        'a transaction when you need to know which account to use or what exists.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'record_transaction',
      description:
        'Write ONE expense or income into the ledger. Call ONLY after the user ' +
        'has explicitly confirmed in this conversation that they want it recorded ' +
        '(never on your own initiative). Amount is in MAJOR units (e.g. 25000 for ' +
        'Rp 25.000, 9.99 for $9.99). The currency must match the target account.',
      parameters: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['expense', 'income'] },
          amount: { type: 'number', description: 'Major units, > 0. E.g. 25000 = Rp 25.000.' },
          currency: { type: 'string', description: 'ISO code, e.g. IDR. Must match the account.' },
          occurred_at: { type: 'string', description: 'YYYY-MM-DD; defaults to today.' },
          account_name: {
            type: 'string',
            description: 'Which wallet/account. Omit only if the user has exactly one.',
          },
          category_name: { type: 'string', description: 'Category name if the user gave/agreed one.' },
          payee: { type: 'string', description: 'Merchant / store name if known.' },
          note: { type: 'string', description: 'Short description, e.g. main items bought.' },
        },
        required: ['type', 'amount', 'currency'],
      },
    },
  },
]

type Row = Record<string, unknown>
const fmtRows = (rows: Row[], map: (r: Row) => Row) => (rows ?? []).map(map)

/** Everything runTool needs beyond the call itself. `onRecorded` lets the
 *  request handler flag the response so the client can refresh its caches. */
interface ToolCtx {
  // deno-lint-ignore no-explicit-any
  supabase: any
  bookId: string
  userId: string
  baseCurrency: string
  onRecorded: () => void
}

// Dispatch one model tool call and shape the result for the model. Money
// columns are formatted to strings here so the model never does minor-unit
// arithmetic — it just quotes what it gets.
async function runTool(ctx: ToolCtx, name: string, args: Record<string, unknown>): Promise<unknown> {
  const { supabase, bookId } = ctx
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

  if (name === 'list_accounts') {
    const { data, error } = await supabase
      .from('accounts')
      .select('name, currency')
      .eq('book_id', bookId)
      .eq('is_archived', false)
      .order('sort_order')
    if (error) return { error: error.message }
    return { rows: data ?? [] }
  }

  if (name === 'record_transaction') return recordTransaction(ctx, args)

  return { error: `unknown tool: ${name}` }
}

/** The one write the model can perform. Every field is validated here — the
 *  model's claim of "user confirmed" is a prompt rule, but the blast radius is
 *  bounded regardless: one row, own book, own account, sane amount. */
async function recordTransaction(ctx: ToolCtx, args: Record<string, unknown>): Promise<unknown> {
  const { supabase, bookId, userId, baseCurrency } = ctx

  const type = String(args.type ?? '')
  if (type !== 'expense' && type !== 'income') return { error: 'type must be expense or income' }

  const amountMajor = Number(args.amount)
  if (!Number.isFinite(amountMajor) || amountMajor <= 0) return { error: 'amount must be > 0' }

  const currency = String(args.currency ?? '').toUpperCase().trim()
  if (!/^[A-Z]{3,8}$/.test(currency)) return { error: 'invalid currency code' }

  const minor = Math.round(amountMajor * 10 ** decimalsOf(currency))
  if (minor <= 0 || minor > 1e15) return { error: 'amount out of range' }

  // Date: default today, reject unparseable or far-future.
  const rawDate = String(args.occurred_at ?? '').trim()
  const date = rawDate || new Date().toISOString().slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) {
    return { error: 'occurred_at must be YYYY-MM-DD' }
  }
  if (Date.parse(date) > Date.now() + 86_400_000) return { error: 'date is in the future' }

  // Resolve the account inside this book (RLS also guards, belt and braces).
  const { data: accounts, error: accErr } = await supabase
    .from('accounts')
    .select('id, name, currency')
    .eq('book_id', bookId)
    .eq('is_archived', false)
    .order('sort_order')
  if (accErr) return { error: accErr.message }
  if (!accounts?.length) return { error: 'no accounts exist — ask the user to create one first' }

  const wanted = String(args.account_name ?? '').trim().toLowerCase()
  let account = wanted
    ? accounts.find((a: Row) => String(a.name).toLowerCase() === wanted) ??
      accounts.find((a: Row) => String(a.name).toLowerCase().includes(wanted))
    : accounts.length === 1
      ? accounts[0]
      : undefined
  if (!account) {
    return {
      error: 'account not resolved — ask the user which one',
      accounts: accounts.map((a: Row) => ({ name: a.name, currency: a.currency })),
    }
  }
  if (String(account.currency) !== currency) {
    return {
      error:
        `account "${account.name}" uses ${account.currency}, not ${currency} — ` +
        'ask the user for the amount in the account currency or another account',
    }
  }

  // Optional category by name, matching the transaction kind.
  let categoryId: string | null = null
  const wantedCat = String(args.category_name ?? '').trim()
  if (wantedCat) {
    const { data: cats } = await supabase
      .from('categories')
      .select('id, name')
      .eq('book_id', bookId)
      .eq('kind', type)
      .eq('is_archived', false)
      .ilike('name', `%${wantedCat}%`)
      .limit(1)
    categoryId = cats?.[0]?.id ?? null
  }

  const payee = String(args.payee ?? '').trim().slice(0, 120) || null
  const note = String(args.note ?? '').trim().slice(0, 500) || null

  const { error: insErr } = await supabase.from('transactions').insert({
    user_id: userId,
    book_id: bookId,
    account_id: account.id,
    category_id: categoryId,
    type,
    amount: minor,
    currency,
    // Same-currency snapshot is exact; cross-currency is left for the app to value.
    base_amount: currency === baseCurrency ? minor : null,
    fx_rate: currency === baseCurrency ? 1 : null,
    occurred_at: `${date}T12:00:00Z`,
    note,
    payee,
    source: 'web',
  })
  if (insErr) return { error: insErr.message }

  ctx.onRecorded()
  return {
    ok: true,
    recorded: {
      type,
      amount: formatMoney(minor, currency),
      account: account.name,
      date,
      category_matched: categoryId != null,
    },
  }
}

// --- document extraction (Gemini vision, strict JSON, no tools) -------------

type DocumentType = 'receipt' | 'transaction_history' | 'unknown'
type TransactionDirection = 'debit' | 'credit'

interface ScannedTransaction {
  date: string | null
  description: string | null
  direction: TransactionDirection | null
  amount: number | null
  currency: string | null
  reference: string | null
  note: string | null
  confidence: number | null
}

interface ScanDocument {
  document_type: DocumentType
  confidence: number | null
  currency: string | null
  account_name: string | null
  transactions: ScannedTransaction[]
  warnings: string[]
}

/** One vision call: one or more photos in, structured rows out. The scanner
 * deliberately does not write to the database; the browser presents its result
 * for one explicit bulk confirmation first. */
async function extractDocument(imageDataUrls: string[], caption: string): Promise<ScanDocument> {
  const key = Deno.env.get('GEMINI_API_KEY')
  if (!key) throw new Error('vision-not-configured')

  const vision = new OpenAI({
    apiKey: key,
    baseURL:
      Deno.env.get('GEMINI_BASE_URL') ?? 'https://generativelanguage.googleapis.com/v1beta/openai/',
  })

  const res = await vision.chat.completions.create({
    model: Deno.env.get('GEMINI_MODEL') ?? 'gemini-3.1-flash-lite',
    temperature: 0,
    max_tokens: 2400,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content:
          'Classify and extract financial-document images. Reply with ONLY one JSON object, no prose, ' +
          'matching exactly: {"document_type":"receipt"|"transaction_history"|"unknown", ' +
          '"confidence":number|null, "currency":"ISO code e.g. IDR"|null, ' +
          '"account_name":string|null, "transactions":[{"date":"YYYY-MM-DD"|null, ' +
          '"description":string|null, "direction":"debit"|"credit"|null, ' +
          '"amount":number|null, "currency":"ISO code"|null, "reference":string|null, ' +
          '"note":string|null, "confidence":number|null}], "warnings":[string]}. ' +
          'A receipt/invoice has one purchase and a grand total: return document_type="receipt" and ' +
          'exactly one transaction whose amount is the grand total. A receipt is money spent, so set its ' +
          'direction="debit" unless it is clearly a refund (then "credit"). A bank/e-wallet transaction ' +
          'history has repeated dated rows: return ' +
          'document_type="transaction_history" and one transaction per visible row. ' +
          'For bank/e-wallet histories, debit/outgoing/spent/paid is direction="debit" and ' +
          'credit/incoming/received is direction="credit". Ignore balances, running totals, headers, ' +
          'pending rows and rows where the amount or direction cannot be read. Amounts are positive MAJOR ' +
          'units without thousands separators. Preserve a provider transaction/reference ID when visible. ' +
          'Indonesian amounts like 25.000 mean twenty-five thousand; use IDR unless another currency is ' +
          'shown. Images may be sequential tiles of one long screenshot: combine their rows and do not ' +
          'repeat overlap rows. Never invent missing values. If it is neither, return document_type="unknown" ' +
          'with an empty transactions array and a short warning.',
      },
      {
        role: 'user',
        content: [
          { type: 'text', text: caption || 'Classify this financial document and extract its transactions.' },
          ...imageDataUrls.map((url) => ({ type: 'image_url' as const, image_url: { url } })),
        ],
        // deno-lint-ignore no-explicit-any
      } as any,
    ],
  })

  const raw = res.choices[0]?.message?.content ?? ''
  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim()
  const parsed = JSON.parse(cleaned) as Partial<ScanDocument>
  const documentType: DocumentType =
    parsed.document_type === 'receipt' || parsed.document_type === 'transaction_history'
      ? parsed.document_type
      : 'unknown'
  const currency = typeof parsed.currency === 'string' ? parsed.currency.toUpperCase().slice(0, 8) : null

  return {
    document_type: documentType,
    confidence:
      typeof parsed.confidence === 'number' && Number.isFinite(parsed.confidence)
        ? Math.max(0, Math.min(1, parsed.confidence))
        : null,
    currency,
    account_name: typeof parsed.account_name === 'string' ? parsed.account_name.slice(0, 120) : null,
    transactions: Array.isArray(parsed.transactions)
      ? parsed.transactions.slice(0, 100).flatMap((row) => {
          if (!row || typeof row !== 'object') return []
          const item = row as Partial<ScannedTransaction>
          const direction: TransactionDirection | null =
            item.direction === 'debit' || item.direction === 'credit' ? item.direction : null
          return [{
            date: typeof item.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(item.date) ? item.date : null,
            description: typeof item.description === 'string' ? item.description.slice(0, 160) : null,
            direction,
            amount: typeof item.amount === 'number' && Number.isFinite(item.amount) && item.amount > 0 ? item.amount : null,
            currency: typeof item.currency === 'string' ? item.currency.toUpperCase().slice(0, 8) : currency,
            reference: typeof item.reference === 'string' ? item.reference.slice(0, 160) : null,
            note: typeof item.note === 'string' ? item.note.slice(0, 300) : null,
            confidence:
              typeof item.confidence === 'number' && Number.isFinite(item.confidence)
                ? Math.max(0, Math.min(1, item.confidence))
                : null,
          }]
        })
      : [],
    warnings: Array.isArray(parsed.warnings)
      ? parsed.warnings
          .filter((item): item is string => typeof item === 'string')
          .slice(0, 8)
          .map((item) => item.slice(0, 240))
      : [],
  }
}

const MAX_STEPS = 6
const MAX_IMAGES = 6
// The client keeps each tile below this cap. The aggregate limit prevents
// hand-written requests from exhausting the edge function.
const MAX_IMAGE_CHARS = 1_300_000
const MAX_TOTAL_IMAGE_CHARS = 7_200_000

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
    mode?: 'insights' | 'chat' | 'scan'
    book_id?: string
    lang?: string
    question?: string
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
    `- Recording: you can save ONE expense/income with record_transaction, but ` +
    `ONLY after the user explicitly says yes to a specific amount in this ` +
    `conversation. Before asking for confirmation, check list_accounts; if there ` +
    `is more than one account, ask which one. After recording, restate exactly ` +
    `what was saved. Never record the same receipt twice.\n` +
    `- When you receive a [RECEIPT_SCAN] block: it is machine-extracted data from ` +
    `a photo the user sent. Summarize it briefly (merchant, date, total, notable ` +
    `items), point out anything the scanner flagged, then ask whether to record ` +
    `it. If is_receipt is false or total is missing, say you could not read it ` +
    `and ask the user to type the amount instead.\n` +
    `- If asked anything unrelated to this user's money, politely decline.`

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

  let recorded = false
  const ctx: ToolCtx = {
    supabase,
    bookId,
    userId: user.id,
    baseCurrency,
    onRecorded: () => {
      recorded = true
    },
  }

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
        return json({ text: msg?.content ?? '', ...(recorded ? { recorded: true } : {}) })
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
        const result = await runTool(ctx, fn?.name ?? '', args)
        messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(result) })
      }
    }
    // Ran out of tool-call rounds without a final answer.
    return json({ text: '', error: 'The assistant took too long. Please try again.', ...(recorded ? { recorded: true } : {}) }, 200)
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500)
  }
})
