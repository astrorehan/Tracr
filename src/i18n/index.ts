import { id as idDateLocale } from 'date-fns/locale'
import type { Locale } from 'date-fns'
import { MESSAGES, type MsgKey } from './messages'

export type Lang = 'id' | 'en'

export const LANGS: { value: Lang; label: string }[] = [
  { value: 'id', label: 'Bahasa Indonesia' },
  { value: 'en', label: 'English' },
]

const STORAGE_KEY = 'lang'

export function readInitialLang(): Lang {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === 'id' || stored === 'en') return stored
  } catch {
    // localStorage unavailable (private mode) — fall through to default.
  }
  return 'id'
}

// Module-level mirror of the active language so plain helpers (schedule
// labels, CSV headers, account-type meta) can translate without a hook.
// The LanguageProvider is the only writer; components read via context so
// they re-render on change, and helpers called during render stay in sync.
let current: Lang = readInitialLang()

export function getLang(): Lang {
  return current
}

export function setCurrentLang(lang: Lang) {
  current = lang
  try {
    localStorage.setItem(STORAGE_KEY, lang)
  } catch {
    // Ignore — preference just won't persist.
  }
}

export type TVars = Record<string, string | number>

export function translate(key: MsgKey, vars?: TVars): string {
  let s: string = MESSAGES[key]?.[current] ?? key
  if (vars) {
    for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v))
  }
  return s
}

/** date-fns locale for the active language (undefined = date-fns default English). */
export function dateLocale(): Locale | undefined {
  return current === 'id' ? idDateLocale : undefined
}

export type { MsgKey }
