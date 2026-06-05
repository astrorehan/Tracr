import { supabase } from '@/lib/supabase'
import { CURRENCIES, CURRENCY_CODES, getCurrency } from '@/lib/currencies'

/**
 * Optional live exchange-rate sync. Two keyless, free endpoints:
 *   - Fiat:   https://open.er-api.com/v6/latest/{BASE}  (exchangerate-api open access)
 *   - Crypto: https://api.coingecko.com/api/v3/simple/price (CoinGecko)
 * Rates are written into the same `fx_rates` table as manual entries, tagged via
 * `source`. We never overwrite a rate the user already has for today, so manual
 * overrides win. Runs client-side; failures (offline / rate-limited) are silent —
 * manually-entered rates keep working.
 */

const COINGECKO_IDS: Record<string, string> = {
  BTC: 'bitcoin',
  ETH: 'ethereum',
  USDT: 'tether',
}

const today = () => new Date().toISOString().slice(0, 10)

interface RateRow {
  base: string
  quote: string
  rate: number
  source: string
}

/** Fiat: er-api returns rates[FOREIGN] = how many FOREIGN per 1 base. We store
 *  base=FOREIGN, quote=base, rate=baseUnits per 1 FOREIGN (the inverse). */
async function fetchFiatRates(base: string, wanted: string[]): Promise<RateRow[]> {
  if (wanted.length === 0) return []
  const res = await fetch(`https://open.er-api.com/v6/latest/${base}`)
  if (!res.ok) throw new Error(`fiat rates ${res.status}`)
  const json = (await res.json()) as { rates?: Record<string, number> }
  const rates = json.rates ?? {}
  const out: RateRow[] = []
  for (const code of wanted) {
    const perBase = rates[code]
    if (typeof perBase === 'number' && perBase > 0) {
      out.push({ base: code, quote: base, rate: 1 / perBase, source: 'erapi' })
    }
  }
  return out
}

/** Crypto: CoinGecko gives the price of 1 coin directly in the base currency. */
async function fetchCryptoRates(base: string, wanted: string[]): Promise<RateRow[]> {
  const ids = wanted.map((c) => COINGECKO_IDS[c]).filter(Boolean)
  if (ids.length === 0) return []
  const vs = base.toLowerCase()
  const res = await fetch(
    `https://api.coingecko.com/api/v3/simple/price?ids=${ids.join(',')}&vs_currencies=${vs}`,
  )
  if (!res.ok) throw new Error(`crypto rates ${res.status}`)
  const json = (await res.json()) as Record<string, Record<string, number>>
  const out: RateRow[] = []
  for (const code of wanted) {
    const price = json[COINGECKO_IDS[code]]?.[vs]
    if (typeof price === 'number' && price > 0) {
      out.push({ base: code, quote: base, rate: price, source: 'coingecko' })
    }
  }
  return out
}

/**
 * Fetch today's rates and store them. By default (`force: false`) only fills in
 * currencies that have no rate yet for today; with `force: true` it re-fetches
 * and overwrites today's live rates (a manual "Refresh now"). A user's own
 * manually-entered rate for today is ALWAYS preserved either way. Returns the
 * number of rates written.
 */
export async function syncLiveRates(
  baseCurrency: string,
  { force = false }: { force?: boolean } = {},
): Promise<number> {
  // The fiat source can't use a crypto base; skip the live sync entirely then.
  if (getCurrency(baseCurrency).crypto) return 0

  const { data: userData } = await supabase.auth.getUser()
  const userId = userData.user?.id
  if (!userId) return 0

  const day = today()
  const { data: existing } = await supabase
    .from('fx_rates')
    .select('base, source')
    .eq('quote', baseCurrency)
    .eq('as_of', day)
  const rows_ = (existing ?? []) as { base: string; source: string }[]
  const have = new Set(rows_.map((r) => r.base))
  const manual = new Set(rows_.filter((r) => r.source === 'manual').map((r) => r.base))

  // Forcing: refetch everything except the user's manual overrides. Otherwise:
  // only currencies still missing a rate today.
  const wanted = CURRENCY_CODES.filter((c) =>
    c === baseCurrency ? false : force ? !manual.has(c) : !have.has(c),
  )
  if (wanted.length === 0) return 0

  const fiatWanted = wanted.filter((c) => !CURRENCIES[c]?.crypto)
  const cryptoWanted = wanted.filter((c) => CURRENCIES[c]?.crypto)

  // Independent sources — one failing shouldn't block the other.
  const results = await Promise.allSettled([
    fetchFiatRates(baseCurrency, fiatWanted),
    fetchCryptoRates(baseCurrency, cryptoWanted),
  ])
  const rows = results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []))
  if (rows.length === 0) return 0

  const payload = rows.map((r) => ({ ...r, as_of: day, user_id: userId }))
  // When forcing we overwrite the prior live value; otherwise skip conflicts so
  // an existing same-day rate (incl. manual) is never clobbered.
  const { error } = await supabase
    .from('fx_rates')
    .upsert(payload, { onConflict: 'user_id,base,quote,as_of', ignoreDuplicates: !force })
  if (error) throw error
  return rows.length
}
