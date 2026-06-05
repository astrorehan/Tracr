import { supabase } from '@/lib/supabase'
import type { FxRate } from '@/types/db'
import { buildRateTable, convertMinor, rateBetween } from './fx'

export interface FxSnapshot {
  base_amount: number | null
  fx_rate: number | null
}

/**
 * Value a native amount in the user's base currency using the latest known
 * rates, to be frozen on a transaction at create time. Returns nulls when no
 * rate is available — callers store the native amount and fill the snapshot
 * later rather than recording a wrong value.
 */
export async function computeFxSnapshot(amount: number, currency: string): Promise<FxSnapshot> {
  const { data: profile } = await supabase.from('profiles').select('base_currency').single()
  const base = profile?.base_currency
  if (!base) return { base_amount: null, fx_rate: null }
  if (currency === base) return { base_amount: amount, fx_rate: 1 }
  const { data: rates } = await supabase.from('fx_rates').select('*')
  const table = buildRateTable((rates ?? []) as FxRate[], base)
  const baseAmount = convertMinor(amount, currency, base, table)
  if (baseAmount == null) return { base_amount: null, fx_rate: null }
  return { base_amount: baseAmount, fx_rate: rateBetween(currency, base, table) }
}
