export interface CurrencyMeta {
  code: string
  name: string
  symbol: string
  /** Number of minor-unit decimal places (IDR/JPY = 0, USD = 2, BTC = 8). */
  decimals: number
  /** True for crypto/asset units that aren't ISO 4217 currencies. */
  crypto?: boolean
}

/**
 * Currencies we ship with. Amounts everywhere are stored as integer minor
 * units (value * 10^decimals) so money math is always exact — never floats.
 */
export const CURRENCIES: Record<string, CurrencyMeta> = {
  IDR: { code: 'IDR', name: 'Indonesian Rupiah', symbol: 'Rp', decimals: 0 },
  USD: { code: 'USD', name: 'US Dollar', symbol: '$', decimals: 2 },
  EUR: { code: 'EUR', name: 'Euro', symbol: '€', decimals: 2 },
  SGD: { code: 'SGD', name: 'Singapore Dollar', symbol: 'S$', decimals: 2 },
  MYR: { code: 'MYR', name: 'Malaysian Ringgit', symbol: 'RM', decimals: 2 },
  JPY: { code: 'JPY', name: 'Japanese Yen', symbol: '¥', decimals: 0 },
  GBP: { code: 'GBP', name: 'British Pound', symbol: '£', decimals: 2 },
  AUD: { code: 'AUD', name: 'Australian Dollar', symbol: 'A$', decimals: 2 },
  // Crypto / assets (not ISO 4217)
  BTC: { code: 'BTC', name: 'Bitcoin', symbol: '₿', decimals: 8, crypto: true },
  ETH: { code: 'ETH', name: 'Ethereum', symbol: 'Ξ', decimals: 8, crypto: true },
  USDT: { code: 'USDT', name: 'Tether', symbol: '₮', decimals: 2, crypto: true },
}

export const CURRENCY_CODES = Object.keys(CURRENCIES)

const FALLBACK: CurrencyMeta = { code: 'USD', name: 'US Dollar', symbol: '$', decimals: 2 }

export function getCurrency(code: string | null | undefined): CurrencyMeta {
  if (!code) return FALLBACK
  return CURRENCIES[code] ?? { code, name: code, symbol: code, decimals: 2 }
}
