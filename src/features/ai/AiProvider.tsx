import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ChatSheet, type ChatSheetHandle } from './AiChat'
import { AiContext, type AiApi } from './ai-context'

/**
 * Mounts the one assistant sheet the whole app shares, and hands every surface
 * a way to open it.
 *
 * The chat used to live inside the home screen's launcher card, which meant
 * the only route that could reach the assistant was Home — and only after
 * scrolling past every other card on it. It lives here now so the header
 * button, the dock button, the `/` shortcut and the `?chat=1` deep link all
 * open the same conversation from anywhere.
 */
export function AiProvider({ children }: { children: ReactNode }) {
  const [opened, setOpened] = useState(false)
  const [params, setParams] = useSearchParams()
  const sheet = useRef<ChatSheetHandle>(null)

  const deepLinked = params.get('chat') === '1'
  const isOpen = opened || deepLinked

  const open = useCallback((question?: string) => {
    setOpened(true)
    // The sheet stays mounted while closed, so the handle is always live.
    if (question) sheet.current?.ask(question)
  }, [])

  const close = useCallback(() => {
    setOpened(false)
    if (params.get('chat') === '1') {
      const next = new URLSearchParams(params)
      next.delete('chat')
      setParams(next, { replace: true })
    }
  }, [params, setParams])

  // Keyboard shortcut: "/" opens the assistant from anywhere on desktop. It is
  // ignored while a field has focus, so typing a slash still types a slash.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return
      const el = document.activeElement as HTMLElement | null
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return
      e.preventDefault()
      setOpened(true)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const api = useMemo<AiApi>(() => ({ open, close, isOpen }), [open, close, isOpen])

  return (
    <AiContext.Provider value={api}>
      {children}
      <ChatSheet ref={sheet} open={isOpen} onClose={close} />
    </AiContext.Provider>
  )
}
