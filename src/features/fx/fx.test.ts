import { describe, it, expect } from 'vitest'
import { buildRateTable, rateBetween, convertMinor } from './fx'
import type { FxRate } from '@/types/db'

function rate(base: string, quote: string, rate: number, as_of: string): FxRate {
  return {
    id: `${base}-${quote}-${as_of}`,
    user_id: 'u1',
    base,
    quote,
    rate,
    as_of,
    source: 'manual',
    created_at: as_of,
  }
}

describe('buildRateTable', () => {
  it('derives the inverse of each given pair', () => {
    const table = buildRateTable([rate('USD', 'IDR', 15000, '2024-01-01')], 'IDR')
    expect(rateBetween('USD', 'IDR', table)).toBe(15000)
    expect(rateBetween('IDR', 'USD', table)).toBeCloseTo(1 / 15000, 12)
  })

  it('keeps the latest rate per directed pair', () => {
    const table = buildRateTable(
      [rate('USD', 'IDR', 15000, '2024-01-01'), rate('USD', 'IDR', 16000, '2024-06-01')],
      'IDR',
    )
    expect(rateBetween('USD', 'IDR', table)).toBe(16000)
  })

  it('ignores rows dated after the asOf cutoff', () => {
    const table = buildRateTable(
      [rate('USD', 'IDR', 15000, '2024-01-01'), rate('USD', 'IDR', 16000, '2024-06-01')],
      'IDR',
      '2024-03-01',
    )
    expect(rateBetween('USD', 'IDR', table)).toBe(15000)
  })

  it('does not overwrite an explicitly-given inverse', () => {
    const table = buildRateTable(
      [rate('USD', 'EUR', 0.9, '2024-01-01'), rate('EUR', 'USD', 1.2, '2024-01-01')],
      'USD',
    )
    expect(rateBetween('EUR', 'USD', table)).toBe(1.2) // given, not 1/0.9
  })
})

describe('rateBetween', () => {
  it('returns 1 for identical currencies', () => {
    const table = buildRateTable([], 'USD')
    expect(rateBetween('USD', 'USD', table)).toBe(1)
  })

  it('triangulates through the base currency', () => {
    const table = buildRateTable(
      [rate('USD', 'EUR', 0.9, '2024-01-01'), rate('USD', 'IDR', 15000, '2024-01-01')],
      'USD',
    )
    // EUR -> USD (1/0.9) -> IDR (15000)
    expect(rateBetween('EUR', 'IDR', table)).toBeCloseTo((1 / 0.9) * 15000, 6)
  })

  it('returns null when no path exists', () => {
    const table = buildRateTable([rate('USD', 'EUR', 0.9, '2024-01-01')], 'USD')
    expect(rateBetween('JPY', 'GBP', table)).toBeNull()
  })
})

describe('convertMinor', () => {
  it('passes through identical currencies untouched', () => {
    const table = buildRateTable([], 'USD')
    expect(convertMinor(1234, 'USD', 'USD', table)).toBe(1234)
  })

  it('accounts for differing decimal places', () => {
    const table = buildRateTable([rate('USD', 'JPY', 150, '2024-01-01')], 'USD')
    // $1.00 (100 minor, 2dp) -> ¥150 (150 minor, 0dp)
    expect(convertMinor(100, 'USD', 'JPY', table)).toBe(150)
  })

  it('returns null when the rate is unknown', () => {
    const table = buildRateTable([], 'USD')
    expect(convertMinor(100, 'USD', 'JPY', table)).toBeNull()
  })
})
