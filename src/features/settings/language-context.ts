import { createContext, useContext } from 'react'
import type { Lang, MsgKey, TVars } from '@/i18n'

export interface LanguageCtx {
  lang: Lang
  setLang: (l: Lang) => void
  t: (key: MsgKey, vars?: TVars) => string
}

export const LanguageContext = createContext<LanguageCtx | undefined>(undefined)

export function useT() {
  const ctx = useContext(LanguageContext)
  if (!ctx) throw new Error('useT must be used within a LanguageProvider')
  return ctx
}
