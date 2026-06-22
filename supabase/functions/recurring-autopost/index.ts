// Recurring auto-generator. Invoked daily by a pg_cron job (see migration 0013).
// For every active schedule with `auto_post = true` whose `next_due` has arrived,
// it posts the real transaction(s) — catching up any missed periods — and advances
// the schedule. This mirrors the client `useMarkRecurringPaid` flow exactly:
// transaction dated at the due date (noon), an FX snapshot frozen at post time,
// then next_due advanced + last_paid_at stamped.
//
// Auth: pg_cron sends a shared secret (stored in public.app_secrets) as a Bearer
// token; we compare it via the service role. verify_jwt is disabled because the
// caller is the cron job, not an end user.
import { createClient } from 'jsr:@supabase/supabase-js@2'

// ---------------------------------------------------------------------------
// Currency decimals — mirror of src/lib/currencies.ts (minor-unit places).
// ---------------------------------------------------------------------------
const DECIMALS: Record<string, number> = {
  IDR: 0, USD: 2, EUR: 2, SGD: 2, MYR: 2, JPY: 0, GBP: 2, AUD: 2,
  BTC: 8, ETH: 8, USDT: 2,
}
const decimalsOf = (code: string) => DECIMALS[code] ?? 2

// ---------------------------------------------------------------------------
// FX core — mirror of src/features/fx/fx.ts (display-only, triangulate via base).
// ---------------------------------------------------------------------------
interface FxRate { user_id: string; base: string; quote: string; rate: number; as_of: string }
interface RateTable { pairs: Map<string, number>; base: string }
const pairKey = (from: string, to: string) => `${from}>${to}`

function buildRateTable(rates: FxRate[], base: string): RateTable {
  const best = new Map<string, FxRate>()
  for (const r of rates) {
    const k = pairKey(r.base, r.quote)
    const cur = best.get(k)
    if (!cur || r.as_of > cur.as_of) best.set(k, r)
  }
  const pairs = new Map<string, number>()
  for (const r of best.values()) {
    pairs.set(pairKey(r.base, r.quote), r.rate)
    const inv = pairKey(r.quote, r.base)
    if (!best.has(inv)) pairs.set(inv, 1 / r.rate)
  }
  return { pairs, base }
}

function rateBetween(from: string, to: string, t: RateTable): number | null {
  if (from === to) return 1
  const direct = t.pairs.get(pairKey(from, to))
  if (direct != null) return direct
  const fromBase = from === t.base ? 1 : t.pairs.get(pairKey(from, t.base))
  const baseTo = to === t.base ? 1 : t.pairs.get(pairKey(t.base, to))
  if (fromBase != null && baseTo != null) return fromBase * baseTo
  return null
}

function convertMinor(minor: number, from: string, to: string, t: RateTable): number | null {
  if (from === to) return minor
  const rate = rateBetween(from, to, t)
  if (rate == null) return null
  const major = minor / 10 ** decimalsOf(from)
  return Math.round(major * rate * 10 ** decimalsOf(to))
}

function computeSnapshot(amount: number, currency: string, base: string | undefined, table: RateTable | undefined) {
  if (!base || !table) return { base_amount: null as number | null, fx_rate: null as number | null }
  if (currency === base) return { base_amount: amount, fx_rate: 1 }
  const baseAmount = convertMinor(amount, currency, base, table)
  if (baseAmount == null) return { base_amount: null, fx_rate: null }
  return { base_amount: baseAmount, fx_rate: rateBetween(currency, base, table) }
}

// ---------------------------------------------------------------------------
// Schedule advance — mirror of src/features/recurring/schedule.ts (date-fns
// semantics: month/year math clamps to the last day of the target month).
// ---------------------------------------------------------------------------
type Freq = 'weekly' | 'monthly' | 'yearly'

function addMonthsUTC(dt: Date, n: number): Date {
  const day = dt.getUTCDate()
  const r = new Date(dt)
  r.setUTCDate(1)
  r.setUTCMonth(r.getUTCMonth() + n)
  const lastDay = new Date(Date.UTC(r.getUTCFullYear(), r.getUTCMonth() + 1, 0)).getUTCDate()
  r.setUTCDate(Math.min(day, lastDay))
  return r
}

function advanceDue(dueISO: string, freq: Freq, interval = 1): string {
  const [y, m, d] = dueISO.split('-').map(Number)
  let dt = new Date(Date.UTC(y, m - 1, d))
  if (freq === 'weekly') dt.setUTCDate(dt.getUTCDate() + 7 * interval)
  else dt = addMonthsUTC(dt, (freq === 'yearly' ? 12 : 1) * interval)
  return dt.toISOString().slice(0, 10)
}

// ---------------------------------------------------------------------------
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

interface Recurring {
  id: string
  user_id: string
  book_id: string
  name: string
  type: 'income' | 'expense'
  account_id: string
  category_id: string | null
  amount: number
  currency: string
  frequency: Freq
  interval: number
  next_due: string
  note: string | null
}

const MAX_CATCHUP = 60 // safety cap on missed periods per schedule

Deno.serve(async (req) => {
  const url = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } })

  // --- authenticate the cron caller against the shared secret ---
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim()
  const { data: secretRow } = await admin
    .from('app_secrets').select('value').eq('key', 'autopost_token').single()
  if (!secretRow || !token || token !== secretRow.value) return json({ error: 'unauthorized' }, 401)

  const today = new Date().toISOString().slice(0, 10)

  const { data: due, error } = await admin
    .from('recurring_transactions')
    .select('id, user_id, book_id, name, type, account_id, category_id, amount, currency, frequency, interval, next_due, note')
    .eq('is_active', true)
    .eq('auto_post', true)
    .lte('next_due', today)
    .returns<Recurring[]>()
  if (error) return json({ error: error.message }, 500)
  if (!due || due.length === 0) return json({ posted: 0, schedules: 0 })

  // --- per-user base currency + rate tables (one round-trip each) ---
  const userIds = [...new Set(due.map((r) => r.user_id))]
  const { data: profiles } = await admin.from('profiles').select('id, base_currency').in('id', userIds)
  const baseByUser = new Map<string, string>()
  for (const p of profiles ?? []) baseByUser.set(p.id, p.base_currency)

  const { data: rates } = await admin
    .from('fx_rates').select('user_id, base, quote, rate, as_of').in('user_id', userIds)
  const ratesByUser = new Map<string, FxRate[]>()
  for (const r of (rates ?? []) as FxRate[]) {
    const arr = ratesByUser.get(r.user_id) ?? []
    arr.push(r)
    ratesByUser.set(r.user_id, arr)
  }
  const tableByUser = new Map<string, RateTable>()
  for (const uid of userIds) {
    const base = baseByUser.get(uid)
    if (base) tableByUser.set(uid, buildRateTable(ratesByUser.get(uid) ?? [], base))
  }

  let posted = 0
  const errors: string[] = []

  for (const rec of due) {
    try {
      const base = baseByUser.get(rec.user_id)
      const table = tableByUser.get(rec.user_id)

      // Catch up every period that has come due (one transaction per occurrence).
      const inserts: Record<string, unknown>[] = []
      let nextDue = rec.next_due
      let guard = 0
      while (nextDue <= today && guard < MAX_CATCHUP) {
        const snap = computeSnapshot(rec.amount, rec.currency, base, table)
        inserts.push({
          user_id: rec.user_id,
          book_id: rec.book_id,
          account_id: rec.account_id,
          category_id: rec.category_id,
          counter_account_id: null,
          type: rec.type,
          amount: rec.amount,
          currency: rec.currency,
          occurred_at: `${nextDue}T12:00:00Z`,
          note: rec.note?.trim() || rec.name,
          base_amount: snap.base_amount,
          fx_rate: snap.fx_rate,
        })
        nextDue = advanceDue(nextDue, rec.frequency, rec.interval)
        guard++
      }
      if (inserts.length === 0) continue

      const { error: insErr } = await admin.from('transactions').insert(inserts)
      if (insErr) { errors.push(`${rec.id}: ${insErr.message}`); continue }

      const { error: updErr } = await admin
        .from('recurring_transactions')
        .update({ next_due: nextDue, last_paid_at: new Date().toISOString() })
        .eq('id', rec.id)
      if (updErr) { errors.push(`${rec.id}: ${updErr.message}`); continue }

      posted += inserts.length
    } catch (e) {
      errors.push(`${rec.id}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  return json({ posted, schedules: due.length, ...(errors.length ? { errors } : {}) })
})
