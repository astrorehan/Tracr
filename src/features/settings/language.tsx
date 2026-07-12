import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { readInitialLang, setCurrentLang, translate, type Lang, type MsgKey, type TVars } from '@/i18n'
import { LanguageContext } from './language-context'

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(readInitialLang)

  useEffect(() => {
    document.documentElement.lang = lang
  }, [lang])

  const setLang = useCallback((l: Lang) => {
    setCurrentLang(l) // keep the module store + localStorage in sync first
    setLangState(l)
  }, [])

  // `t` is recreated when `lang` changes so consumers re-render with new copy.
  const t = useCallback((key: MsgKey, vars?: TVars) => translate(key, vars), [lang]) // eslint-disable-line react-hooks/exhaustive-deps

  const value = useMemo(() => ({ lang, setLang, t }), [lang, setLang, t])

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
}
