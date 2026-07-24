import { getCurrency } from '@/lib/currencies'
import type { Account, Category } from '@/types/db'

/**
 * Deterministic natural-language parser for the express-entry bar. Turns a line
 * like "25k kopi bca" or "gaji 5jt bank" into a ready-to-save draft — no AI, no
 * network, works offline. The AI path (chat + receipt scan) stays for the hard
 * cases; this is the fast lane for the 80% "amount + what + which wallet" entry.
 *
 * Everything here is pure so it can be unit-tested without React or Supabase.
 */

export interface QuickParseContext {
  /** Active accounts, in display order — the first is the default wallet. */
  accounts: Account[]
  /** Active categories (both kinds); matched by name against the text. */
  categories: Category[]
}

export interface QuickDraft {
  type: 'expense' | 'income'
  /** Amount in the resolved account's minor units, or null when none was found. */
  amountMinor: number | null
  /** The amount exactly as typed (e.g. "25k"), for echoing back in the preview. */
  amountText: string
  currency: string
  accountId: string | null
  /** True when a wallet name was recognised in the text (vs. falling back to the default). */
  accountMatched: boolean
  categoryId: string | null
  categoryMatched: boolean
  /** Leftover words after amount / wallet / category were removed — the payee/note. */
  note: string
  /** Enough parsed to offer a one-tap save (amount + a wallet to put it in). */
  confident: boolean
}

// Amount suffixes people actually type in Indonesian money shorthand. `k`, `rb`,
// `ribu` = thousand; `jt`, `juta` = million. `m` is deliberately left out — too
// easily "meter"/"menit" to trust.
const MULTIPLIERS: Record<string, number> = {
  k: 1_000,
  rb: 1_000,
  ribu: 1_000,
  jt: 1_000_000,
  juta: 1_000_000,
}

// A number, optionally signed, optionally carrying one of the suffixes above.
const AMOUNT_TOKEN = /^([+-]?)(\d[\d.,]*)(k|rb|ribu|jt|juta)?$/i

// The same suffixes as a standalone word, so "50 ribu" and "2 juta" (spaced)
// work as well as the glued "50rb" / "2jt".
const MULTIPLIER_WORD = /^(k|rb|ribu|jt|juta)$/i

// Words that flip an entry to income. Everything else defaults to expense, which
// is what the overwhelming majority of quick entries are.
const INCOME_WORDS = new Set([
  'gaji',
  'gajian',
  'salary',
  'income',
  'bonus',
  'thr',
  'refund',
  'cashback',
  'bunga',
  'masuk',
  'terima',
  'diterima',
  'dapat',
  'dapet',
  'honor',
  'kiriman',
  'transferan',
  'untung',
])

/** Escape a string for safe use as a literal inside a RegExp. */
function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// Generic words that must never, on their own, resolve a wallet or category —
// they'd swallow ordinary note text (e.g. a "Other expense" category eating the
// word "other"). Full-name matches are still allowed to contain them.
const NAME_STOPWORDS = new Set([
  'and',
  'dan',
  'the',
  'for',
  'other',
  'lain',
  'lainnya',
  'expense',
  'income',
  'dari',
  'untuk',
])

/**
 * Names a text span can resolve to an entity: the full name always, plus each
 * significant word of a multi-word name (so "livin" matches "Livin Mandiri").
 * Single-word names rely on the full-name entry alone.
 */
function aliasesOf(name: string): string[] {
  const full = name.trim()
  const out = [full]
  const words = full.split(/\s+/)
  if (words.length > 1) {
    for (const w of words) {
      if (w.length >= 3 && !NAME_STOPWORDS.has(w.toLowerCase())) out.push(w)
    }
  }
  return out
}

/**
 * Parse the numeric part of an amount token into a major-unit number.
 * `decimalMode` (a suffix like 1.5jt, or a following "juta") always reads a lone
 * separator as the decimal point. Otherwise the separators are locale-driven: a
 * zero-decimal currency (IDR/JPY) reads "25.000" as grouping → 25000, while a
 * 2-decimal one reads the last separator as the decimal point.
 */
function parseNumber(digits: string, decimals: number, decimalMode: boolean): number {
  if (decimalMode) return parseFloat(digits.replace(',', '.'))

  if (decimals === 0) {
    // No fractional part exists — every separator is a thousands grouping.
    return parseFloat(digits.replace(/[.,]/g, ''))
  }

  const hasComma = digits.includes(',')
  const hasDot = digits.includes('.')
  let s = digits
  if (hasComma && hasDot) {
    s =
      digits.lastIndexOf(',') > digits.lastIndexOf('.')
        ? digits.replace(/\./g, '').replace(',', '.')
        : digits.replace(/,/g, '')
  } else if (hasComma) {
    s = digits.replace(',', '.')
  }
  return parseFloat(s)
}

interface AmountHit {
  amountMajor: number
  sign: -1 | 0 | 1
  /** True when a following standalone multiplier word (e.g. "juta") was consumed. */
  ateNextWord: boolean
}

/**
 * Try to read `token` as an amount. `nextToken` lets a bare multiplier word that
 * follows a plain number apply (so "2 juta" == "2jt").
 */
function parseAmountToken(token: string, nextToken: string | undefined, decimals: number): AmountHit | null {
  const m = AMOUNT_TOKEN.exec(token)
  if (!m) return null
  const [, sign, digits, gluedSuffix] = m

  let mult = 1
  let decimalMode = false
  let ateNextWord = false
  if (gluedSuffix) {
    mult = MULTIPLIERS[gluedSuffix.toLowerCase()]
    decimalMode = true
  } else if (nextToken && MULTIPLIER_WORD.test(nextToken)) {
    mult = MULTIPLIERS[nextToken.toLowerCase()]
    decimalMode = true
    ateNextWord = true
  }

  const n = parseNumber(digits, decimals, decimalMode)
  if (!Number.isFinite(n) || n <= 0) return null
  return {
    amountMajor: n * mult,
    sign: sign === '-' ? -1 : sign === '+' ? 1 : 0,
    ateNextWord,
  }
}

/**
 * Find the longest active name (account or category) that appears in `text` as a
 * whole word, case-insensitively. Returns the matched entity and the text with
 * that span blanked out, so later steps don't re-consume it.
 */
function matchLongestName<T extends { name: string }>(
  text: string,
  items: T[],
): { item: T | null; rest: string } {
  let best: { item: T; start: number; len: number } | null = null
  for (const item of items) {
    for (const alias of aliasesOf(item.name)) {
      if (alias.length < 2) continue // one-letter names are too ambiguous to match
      const re = new RegExp(`(^|\\W)(${escapeRe(alias)})(\\W|$)`, 'i')
      const m = re.exec(text)
      if (!m) continue
      // Longest matched alias wins, so a full name beats one of its words and a
      // specific wallet beats a generic one.
      if (!best || alias.length > best.len)
        best = { item, start: m.index + m[1].length, len: alias.length }
    }
  }
  if (!best) return { item: null, rest: text }
  const rest = text.slice(0, best.start) + ' ' + text.slice(best.start + best.len)
  return { item: best.item, rest }
}

/** Collapse runs of whitespace and trim. */
function tidy(s: string): string {
  return s.replace(/\s+/g, ' ').trim()
}

/**
 * Parse a free-text quick entry into a draft transaction. Order matters: resolve
 * the wallet first (its currency sets how the amount's separators are read), then
 * the amount, then the category (scoped to the entry's income/expense kind).
 */
export function parseQuickEntry(input: string, ctx: QuickParseContext): QuickDraft {
  const text = tidy(input)

  // ── Type ────────────────────────────────────────────────────────────────
  // An explicit leading sign wins; otherwise an income keyword flips it.
  let type: 'expense' | 'income' = 'expense'
  const words = text.toLowerCase().split(/\s+/)
  const hasIncomeWord = words.some((w) => INCOME_WORDS.has(w))
  const hasPlus = /(^|\s)\+\d|\s\+\s/.test(` ${text}`)
  const hasMinus = /(^|\s)-\d/.test(` ${text}`)
  if (hasMinus) type = 'expense'
  else if (hasPlus || hasIncomeWord) type = 'income'

  // ── Account ─────────────────────────────────────────────────────────────
  const accountMatch = matchLongestName(text, ctx.accounts)
  const account = accountMatch.item ?? ctx.accounts[0] ?? null
  const currency = account?.currency ?? 'IDR'
  const { decimals } = getCurrency(currency)
  let rest = accountMatch.rest

  // ── Amount ──────────────────────────────────────────────────────────────
  // First token that reads as a positive amount is the amount. A leading sign on
  // the token also settles the type when no keyword did.
  let amountMinor: number | null = null
  let amountText = ''
  const restTokens = rest.split(/\s+/).filter(Boolean)
  for (let i = 0; i < restTokens.length; i++) {
    const tok = restTokens[i]
    const hit = parseAmountToken(tok, restTokens[i + 1], decimals)
    if (!hit) continue
    amountMinor = Math.round(hit.amountMajor * 10 ** decimals)
    amountText = hit.ateNextWord ? `${tok} ${restTokens[i + 1]}` : tok
    if (hit.sign === -1) type = 'expense'
    else if (hit.sign === 1 && !hasIncomeWord) type = 'income'
    // Blank the amount (and a consumed multiplier word) out of the note.
    rest = rest.replace(new RegExp(`(^|\\s)${escapeRe(tok)}(?=\\s|$)`), ' ')
    if (hit.ateNextWord)
      rest = rest.replace(new RegExp(`(^|\\s)${escapeRe(restTokens[i + 1])}(?=\\s|$)`), ' ')
    break
  }

  // ── Category ────────────────────────────────────────────────────────────
  const kind = type === 'income' ? 'income' : 'expense'
  const catMatch = matchLongestName(
    rest,
    ctx.categories.filter((c) => c.kind === kind && !c.is_archived),
  )
  const categoryId = catMatch.item?.id ?? null
  rest = catMatch.rest

  // Strip a leftover bare sign token, then whatever remains is the note.
  const note = tidy(rest.replace(/(^|\s)[+-](?=\s|$)/g, ' '))

  return {
    type,
    amountMinor,
    amountText,
    currency,
    accountId: account?.id ?? null,
    accountMatched: Boolean(accountMatch.item),
    categoryId,
    categoryMatched: Boolean(catMatch.item),
    note,
    confident: amountMinor != null && amountMinor > 0 && account != null,
  }
}
