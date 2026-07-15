// Shared AI agent core. The exact same tool-calling brain is used by two edge
// functions that differ ONLY in how the Supabase client is built and scoped:
//
//   * ai-analysis  — called from the browser under the CALLER'S JWT. Postgres
//                    RLS enforces per-user isolation. ctx.supabase is the
//                    user-scoped client.
//   * wa-webhook   — called by Meta with no user session, so it runs as SERVICE
//                    ROLE. There is NO RLS backstop: ctx.supabase is the service
//                    client and every helper here MUST filter by book_id (and the
//                    webhook resolves book_id/user_id from the phone → link table
//                    before calling in). Audit every query below for a scope
//                    filter before shipping the webhook.
//
// The tool loop, tool schema, validation, and document extraction are identical
// across both — that's the whole point of sharing them.
import OpenAI from 'npm:openai'

// --- money formatting (mirror of src/lib/currencies.ts minor-unit places) ---
const DECIMALS: Record<string, number> = {
  IDR: 0, USD: 2, EUR: 2, SGD: 2, MYR: 2, JPY: 0, GBP: 2, AUD: 2,
  BTC: 8, ETH: 8, USDT: 2,
}
export const decimalsOf = (code: string) => DECIMALS[code] ?? 2
export function formatMoney(minor: number, currency: string): string {
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

// --- FX (port of src/features/fx/fx.ts — keep the two in step) --------------
//
// Conversion is DISPLAY-ONLY: stored native amounts are never rewritten, we only
// estimate a total in the base currency. A rate row means 1 unit of `base` =
// `rate` units of `quote`. Latest row per directed pair wins; inverses are
// derived; anything else triangulates through the user's base currency.
//
// This mirrors what AccountsPage shows so the assistant and the dashboard can
// never quote two different net worths. If you change one, change the other.
interface FxRow {
  base: string
  quote: string
  rate: number
  as_of: string
}
export interface RateTable {
  pairs: Map<string, number>
  base: string
}
const pairKey = (from: string, to: string) => `${from}>${to}`

export function buildRateTable(rates: FxRow[], baseCurrency: string): RateTable {
  const best = new Map<string, FxRow>()
  for (const r of rates ?? []) {
    const k = pairKey(r.base, r.quote)
    const cur = best.get(k)
    if (!cur || r.as_of > cur.as_of) best.set(k, r)
  }
  const pairs = new Map<string, number>()
  for (const r of best.values()) {
    pairs.set(pairKey(r.base, r.quote), Number(r.rate))
    // Only fill the inverse if it wasn't given explicitly.
    const inv = pairKey(r.quote, r.base)
    if (!best.has(inv)) pairs.set(inv, 1 / Number(r.rate))
  }
  return { pairs, base: baseCurrency }
}

export function rateBetween(from: string, to: string, table: RateTable): number | null {
  if (from === to) return 1
  const direct = table.pairs.get(pairKey(from, to))
  if (direct != null) return direct
  const fromBase = from === table.base ? 1 : table.pairs.get(pairKey(from, table.base))
  const baseTo = to === table.base ? 1 : table.pairs.get(pairKey(table.base, to))
  if (fromBase != null && baseTo != null) return fromBase * baseTo
  return null
}

/** Minor units of `from` → minor units of `to`, accounting for differing decimal
 *  places. Null when no rate is known — callers must surface that rather than
 *  fall back to zero, or the total silently under-reports. */
export function convertMinor(minor: number, from: string, to: string, table: RateTable): number | null {
  if (from === to) return minor
  const rate = rateBetween(from, to, table)
  if (rate == null) return null
  const major = minor / 10 ** decimalsOf(from)
  return Math.round(major * rate * 10 ** decimalsOf(to))
}

/** Account types that are debts by nature — mirrors LIABILITY_TYPES in
 *  src/features/accounts/meta.ts. Used to default the liability flag. */
const ACCOUNT_TYPES = [
  'cash', 'bank_card', 'credit_card', 'e_wallet', 'crypto', 'stocks', 'loan', 'receivable', 'other',
] as const
const LIABILITY_TYPES = new Set(['credit_card', 'loan'])

// --- the tools the model is allowed to call (OpenAI function schema) ---
// deno-lint-ignore no-explicit-any
export const tools: any[] = [
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
      name: 'net_worth',
      description:
        'Current net worth: everything owned minus everything owed, valued in the ' +
        "user's base currency, plus each account's own balance. Use for questions " +
        'like "how much do I have?", "what am I worth?", "how much is in my wallet?".',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_categories',
      description:
        'The categories in this ledger. Call this BEFORE recording a transaction ' +
        'so you can put it in the right one, and before create_category so you ' +
        "don't duplicate an existing category.",
      parameters: {
        type: 'object',
        properties: {
          kind: {
            type: 'string',
            enum: ['expense', 'income'],
            description: 'Only categories of this kind. Omit for both.',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_category',
      description:
        'Create a category, then use it on a transaction. Call this ONLY when you ' +
        'have checked list_categories and nothing existing reasonably fits — prefer ' +
        'an existing category every time. Good reason to create: the spending is ' +
        'specific and recurring and has no home yet. Bad reason: a one-off purchase ' +
        'that fits a broader category you already have. If the name already exists ' +
        'the existing one is returned instead of a duplicate. Always tell the user ' +
        'when you created a category.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Short, plain name, e.g. "Coffee".' },
          kind: { type: 'string', enum: ['expense', 'income'] },
          parent_name: {
            type: 'string',
            description:
              'Optional existing category of the same kind to nest this under, e.g. ' +
              '"Food" for a new "Coffee". Must already exist.',
          },
        },
        required: ['name', 'kind'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_account',
      description:
        'Create a wallet/account (a place money sits, e.g. a bank account, cash, an ' +
        'e-wallet, a credit card). Call ONLY after the user has explicitly confirmed ' +
        'the name, type and currency in this conversation — never on your own ' +
        'initiative, and never to work around a transaction whose account you could ' +
        'not resolve (ask which existing account instead).',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'What the user calls it, e.g. "BCA" or "Cash".' },
          type: {
            type: 'string',
            enum: [...ACCOUNT_TYPES],
            description:
              'credit_card and loan are debts. receivable is money owed TO the user.',
          },
          currency: { type: 'string', description: 'ISO code, e.g. IDR.' },
          opening_balance: {
            type: 'number',
            description:
              'How much is in it right now, MAJOR units, not negative. For a debt ' +
              '(credit_card/loan) this is how much is OWED. Defaults to 0.',
          },
          credit_limit: {
            type: 'number',
            description: 'Major units. Only meaningful for a credit_card or loan.',
          },
        },
        required: ['name', 'type', 'currency'],
      },
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
 *  request handler flag the response so the client can refresh its caches.
 *
 *  In wa-webhook `supabase` is the SERVICE-ROLE client — there is no RLS, so
 *  `bookId`/`userId` here are the security boundary. Never pass values that were
 *  not resolved from whatsapp_links for the sending phone. */
export interface ToolCtx {
  // deno-lint-ignore no-explicit-any
  supabase: any
  bookId: string
  userId: string
  baseCurrency: string
  /** How the row is stamped in transactions.source — must be a value of the
   *  transaction_source enum ('web' | 'whatsapp' | 'telegram' | 'import'). */
  source?: string
  onRecorded: () => void
}

// Dispatch one model tool call and shape the result for the model. Money
// columns are formatted to strings here so the model never does minor-unit
// arithmetic — it just quotes what it gets. Every read is `.eq('book_id', …)`.
export async function runTool(ctx: ToolCtx, name: string, args: Record<string, unknown>): Promise<unknown> {
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

  if (name === 'list_categories') {
    let query = supabase
      .from('categories')
      .select('id, name, kind, parent_id')
      .eq('book_id', bookId)
      .eq('is_archived', false)
    const kind = String(args.kind ?? '')
    if (kind === 'expense' || kind === 'income') query = query.eq('kind', kind)
    const { data, error } = await query.order('sort_order')
    if (error) return { error: error.message }

    // Resolve parent names locally so the model sees "Food > Coffee" rather than
    // uuids it would only be tempted to echo back.
    const byId = new Map((data ?? []).map((c: Row) => [c.id, c.name]))
    return {
      rows: (data ?? []).map((c: Row) => ({
        name: c.name,
        kind: c.kind,
        parent: c.parent_id ? byId.get(c.parent_id) ?? null : null,
      })),
    }
  }

  if (name === 'net_worth') return netWorth(ctx)
  if (name === 'create_category') return createCategory(ctx, args)
  if (name === 'create_account') return createAccount(ctx, args)
  if (name === 'record_transaction') return recordTransaction(ctx, args)

  return { error: `unknown tool: ${name}` }
}

/** Assets minus debts in the base currency, mirroring AccountsPage. Accounts
 *  flagged exclude_from_stats are listed but not counted; accounts whose currency
 *  has no known rate are reported separately rather than silently counted as
 *  zero, so the model can say the total is incomplete instead of quoting a wrong
 *  number. */
export async function netWorth(ctx: ToolCtx): Promise<unknown> {
  const { supabase, bookId, userId, baseCurrency } = ctx

  const [accountsRes, balancesRes, ratesRes] = await Promise.all([
    supabase.from('accounts')
      .select('id, name, type, currency, is_liability, exclude_from_stats, opening_balance')
      .eq('book_id', bookId).eq('is_archived', false).order('sort_order'),
    supabase.from('account_balances').select('account_id, balance').eq('book_id', bookId),
    // fx_rates is scoped by user, not book — it has no book_id column.
    supabase.from('fx_rates').select('base, quote, rate, as_of').eq('user_id', userId),
  ])
  if (accountsRes.error) return { error: accountsRes.error.message }
  if (balancesRes.error) return { error: balancesRes.error.message }

  const balanceById = new Map<string, number>(
    (balancesRes.data ?? []).map((b: Row) => [String(b.account_id), Number(b.balance)]),
  )
  const table = buildRateTable((ratesRes.data ?? []) as FxRow[], baseCurrency)

  let assets = 0
  let debts = 0
  const rows: Row[] = []
  const noRate: string[] = []

  for (const a of (accountsRes.data ?? []) as Row[]) {
    const currency = String(a.currency)
    const balance = balanceById.get(String(a.id)) ?? Number(a.opening_balance)
    const counted = !a.exclude_from_stats
    const converted = convertMinor(balance, currency, baseCurrency, table)

    rows.push({
      name: a.name,
      type: a.type,
      // Debts are stored negative; show the plain "owed" figure.
      balance: formatMoney(a.is_liability ? Math.abs(balance) : balance, currency),
      is_debt: !!a.is_liability,
      counted_in_net_worth: counted && converted != null,
    })

    if (!counted) continue
    if (converted == null) {
      noRate.push(`${a.name} (${currency})`)
      continue
    }
    if (a.is_liability) debts += Math.abs(converted)
    else assets += converted
  }

  return {
    net_worth: formatMoney(assets - debts, baseCurrency),
    total_assets: formatMoney(assets, baseCurrency),
    total_debts: formatMoney(debts, baseCurrency),
    accounts: rows,
    ...(noRate.length
      ? {
          warning:
            `No exchange rate for ${noRate.join(', ')}, so ${noRate.length === 1 ? 'it is' : 'they are'} ` +
            `left out of the total. Say so when you answer.`,
        }
      : {}),
  }
}

/** Create a category, or hand back the existing one with the same name. The
 *  model is told to prefer existing categories, but "prefer" is a prompt rule —
 *  the case-insensitive dedupe here is what actually stops the list filling up
 *  with near-duplicates. */
export async function createCategory(ctx: ToolCtx, args: Record<string, unknown>): Promise<unknown> {
  const { supabase, bookId, userId } = ctx

  const kind = String(args.kind ?? '')
  if (kind !== 'expense' && kind !== 'income') return { error: 'kind must be expense or income' }

  const name = String(args.name ?? '').trim().slice(0, 60)
  if (!name) return { error: 'name is required' }

  const { data: existing, error: exErr } = await supabase
    .from('categories')
    .select('id, name, is_archived')
    .eq('book_id', bookId).eq('kind', kind).ilike('name', name)
    .limit(1)
  if (exErr) return { error: exErr.message }
  if (existing?.[0]) {
    return {
      ok: true,
      created: false,
      name: existing[0].name,
      note: existing[0].is_archived
        ? 'A category with this name already exists but is archived; it was reused.'
        : 'A category with this name already exists; use it as-is.',
    }
  }

  // Optional parent, same kind, must already exist. One level only — the app
  // nests categories, but a bot inventing deep trees is not worth the confusion.
  let parentId: string | null = null
  const parentName = String(args.parent_name ?? '').trim()
  if (parentName) {
    const { data: parents } = await supabase
      .from('categories')
      .select('id, parent_id')
      .eq('book_id', bookId).eq('kind', kind).eq('is_archived', false)
      .ilike('name', parentName)
      .limit(1)
    if (!parents?.[0]) return { error: `no ${kind} category named "${parentName}" to nest under` }
    if (parents[0].parent_id) return { error: `"${parentName}" is already a sub-category` }
    parentId = parents[0].id
  }

  const { error: insErr } = await supabase.from('categories').insert({
    user_id: userId, book_id: bookId, name, kind, parent_id: parentId,
  })
  if (insErr) return { error: insErr.message }

  ctx.onRecorded()
  return { ok: true, created: true, name, kind, parent: parentName || null }
}

/** Create an account. Like record_transaction, the model's claim that the user
 *  confirmed is only a prompt rule — so the blast radius is bounded here: one
 *  row, own book, known type, sane currency and amount. */
export async function createAccount(ctx: ToolCtx, args: Record<string, unknown>): Promise<unknown> {
  const { supabase, bookId, userId } = ctx

  const name = String(args.name ?? '').trim().slice(0, 60)
  if (!name) return { error: 'name is required' }

  const type = String(args.type ?? '')
  if (!(ACCOUNT_TYPES as readonly string[]).includes(type)) {
    return { error: `type must be one of: ${ACCOUNT_TYPES.join(', ')}` }
  }

  const currency = String(args.currency ?? '').toUpperCase().trim()
  if (!/^[A-Z]{3,8}$/.test(currency)) return { error: 'invalid currency code' }

  const { data: clash } = await supabase
    .from('accounts').select('id').eq('book_id', bookId).ilike('name', name).limit(1)
  if (clash?.[0]) return { error: `an account named "${name}" already exists` }

  const isLiability = LIABILITY_TYPES.has(type)

  const openingMajor = Number(args.opening_balance ?? 0)
  if (!Number.isFinite(openingMajor) || openingMajor < 0) {
    return { error: 'opening_balance must be 0 or more (for a debt, how much is owed)' }
  }
  const magnitude = Math.round(openingMajor * 10 ** decimalsOf(currency))
  if (magnitude > 1e15) return { error: 'opening_balance out of range' }
  // Debts carry a negative balance so they subtract from net worth (same rule as
  // AccountForm).
  const openingBalance = isLiability ? -magnitude : magnitude

  // Credit limit only applies to debts; ignored otherwise.
  let creditLimit: number | null = null
  if (isLiability && args.credit_limit != null) {
    const limitMajor = Number(args.credit_limit)
    if (!Number.isFinite(limitMajor) || limitMajor < 0) return { error: 'credit_limit must be 0 or more' }
    creditLimit = Math.round(limitMajor * 10 ** decimalsOf(currency))
  }

  const { error: insErr } = await supabase.from('accounts').insert({
    user_id: userId,
    book_id: bookId,
    name,
    type,
    currency,
    opening_balance: openingBalance,
    is_liability: isLiability,
    credit_limit: creditLimit,
  })
  if (insErr) return { error: insErr.message }

  ctx.onRecorded()
  return {
    ok: true,
    created: {
      name,
      type,
      currency,
      is_debt: isLiability,
      balance: formatMoney(magnitude, currency),
    },
  }
}

/** The one write the model can perform. Every field is validated here — the
 *  model's claim of "user confirmed" is a prompt rule, but the blast radius is
 *  bounded regardless: one row, own book, own account, sane amount. Account and
 *  category lookups are book-scoped so this is safe under the service role too. */
export async function recordTransaction(ctx: ToolCtx, args: Record<string, unknown>): Promise<unknown> {
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

  // Resolve the account inside this book (RLS also guards on web; on the webhook
  // this .eq('book_id') IS the guard).
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
    source: ctx.source ?? 'web',
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

export type DocumentType = 'receipt' | 'transaction_history' | 'unknown'
export type TransactionDirection = 'debit' | 'credit'

export interface ScannedTransaction {
  date: string | null
  description: string | null
  direction: TransactionDirection | null
  amount: number | null
  currency: string | null
  reference: string | null
  note: string | null
  confidence: number | null
}

export interface ScanDocument {
  document_type: DocumentType
  confidence: number | null
  currency: string | null
  account_name: string | null
  transactions: ScannedTransaction[]
  warnings: string[]
}

/** One vision call: one or more photos in, structured rows out. The scanner
 * deliberately does not write to the database; the caller presents its result
 * for one explicit confirmation first. Throws 'vision-not-configured' when
 * GEMINI_API_KEY is unset. */
export async function extractDocument(imageDataUrls: string[], caption: string): Promise<ScanDocument> {
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

// --- shared limits (client tiles stay under the per-image cap) --------------
export const MAX_STEPS = 6
export const MAX_IMAGES = 6
export const MAX_IMAGE_CHARS = 1_300_000
export const MAX_TOTAL_IMAGE_CHARS = 7_200_000

/** Build the agent system prompt. Every channel shares the same rules; only the
 *  formatting guidance differs. The chat channels also have a server-persisted
 *  history, so the "confirm before write" rule has to span messages there. */
export function buildSystemPrompt(opts: {
  today: string
  baseCurrency: string
  language: string
  channel?: 'web' | 'whatsapp' | 'telegram'
}): string {
  const { today, baseCurrency, language, channel = 'web' } = opts
  const common =
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
    `- Categories: every transaction you record should have one. Check ` +
    `list_categories and pick the closest existing category yourself — do not make ` +
    `the user choose, and do not ask permission to use an existing one. Only when ` +
    `nothing fits, create_category, then use it and mention that you made it. A ` +
    `new category must earn its place: "Coffee" for someone buying coffee weekly, ` +
    `yes; a separate category for one unusual purchase, no — put it in the closest ` +
    `broader one instead.\n` +
    `- Accounts: create_account ONLY when the user has asked for a new account and ` +
    `confirmed its name, type and currency. If you cannot work out which account a ` +
    `transaction belongs to, ask — never invent a new account to hold it.\n` +
    `- Net worth: net_worth already subtracts debts and converts to the base ` +
    `currency. Quote its numbers as given; never add up the per-account balances ` +
    `yourself. If it returns a warning that accounts were left out, pass that on.\n` +
    `- When you receive a [RECEIPT_SCAN] or [DOCUMENT_SCAN] block: it is ` +
    `machine-extracted data from a photo the user sent. Summarize it briefly ` +
    `(merchant, date, total, notable items), point out anything the scanner ` +
    `flagged, then ask whether to record it. If the document could not be read or ` +
    `the total is missing, say so and ask the user to type the amount instead.\n` +
    `- If asked anything unrelated to this user's money, politely decline.`

  const remembers =
    `Earlier messages in this chat are remembered, so a plain "yes" refers to the ` +
    `transaction you just proposed.`

  if (channel === 'whatsapp') {
    return (
      common +
      `\n- This is a WhatsApp chat. Keep replies short (a couple of lines). Do NOT ` +
      `use markdown; WhatsApp uses *single asterisks* for bold. ${remembers}`
    )
  }
  if (channel === 'telegram') {
    return (
      common +
      `\n- This is a Telegram chat. Keep replies short (a couple of lines). Write ` +
      `PLAIN TEXT only — no markdown of any kind, no *asterisks*, _underscores_ or ` +
      `backticks for emphasis, since the message is sent unformatted and the symbols ` +
      `would show up literally. ${remembers}`
    )
  }
  return common
}

export interface AgentResult {
  text: string
  recorded: boolean
  timedOut?: boolean
}

/** Run the tool-calling loop to a final text answer. Mutates `messages` in place
 *  (appends assistant + tool turns). Sets ctx.onRecorded internally so callers
 *  learn whether a write happened. Throws on transport/LLM errors — the caller
 *  wraps it. Returns { timedOut: true } if it never converges within maxSteps. */
export async function runAgentLoop(opts: {
  client: OpenAI
  model: string
  // deno-lint-ignore no-explicit-any
  messages: any[]
  ctx: ToolCtx
  disableThinking: boolean
  maxSteps?: number
}): Promise<AgentResult> {
  const { client, model, messages, ctx, disableThinking, maxSteps = MAX_STEPS } = opts
  let recorded = false
  ctx.onRecorded = () => {
    recorded = true
  }

  for (let step = 0; step < maxSteps; step++) {
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
      return { text: msg?.content ?? '', recorded }
    }

    // Echo the assistant's tool-call turn, then answer each call.
    messages.push(msg)
    for (const call of calls) {
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
  return { text: '', recorded, timedOut: true }
}
