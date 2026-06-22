import { useEffect, useRef } from 'react'

interface ShortcutHandlers {
  openPalette: () => void
  quickAdd: () => void
  openHelp: () => void
  navigate: (to: string) => void
}

/** `g`-prefixed jump targets (vim/Gmail style). */
const GO_TO: Record<string, string> = {
  d: '/',
  a: '/accounts',
  t: '/transactions',
  r: '/reports',
  b: '/budgets',
  i: '/bills',
  g: '/goals',
  s: '/settings',
  c: '/categories',
}

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false
  const tag = el.tagName
  return (
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    tag === 'SELECT' ||
    el.isContentEditable
  )
}

/**
 * Global keyboard shortcuts for the app shell. Cmd/Ctrl-K works everywhere;
 * the single-key and `g`-prefixed shortcuts are suppressed while the user is
 * typing in a field so they never swallow real input.
 */
export function useAppShortcuts(handlers: ShortcutHandlers) {
  // Keep the latest handlers without re-binding the listener every render.
  const ref = useRef(handlers)
  useEffect(() => {
    ref.current = handlers
  })

  useEffect(() => {
    let goPending = false
    let goTimer: ReturnType<typeof setTimeout> | undefined

    function clearGo() {
      goPending = false
      if (goTimer) clearTimeout(goTimer)
    }

    function onKey(e: KeyboardEvent) {
      const { openPalette, quickAdd, openHelp, navigate } = ref.current

      // Command palette — available even inside inputs.
      if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        openPalette()
        return
      }

      // Everything below is plain typing — ignore with modifiers or in fields.
      if (e.metaKey || e.ctrlKey || e.altKey || isTypingTarget(e.target)) return

      if (goPending) {
        const dest = GO_TO[e.key.toLowerCase()]
        clearGo()
        if (dest) {
          e.preventDefault()
          navigate(dest)
        }
        return
      }

      if (e.key === 'g' || e.key === 'G') {
        goPending = true
        goTimer = setTimeout(clearGo, 1200)
        return
      }
      if (e.key === 'n' || e.key === 'N') {
        e.preventDefault()
        quickAdd()
      } else if (e.key === '?') {
        e.preventDefault()
        openHelp()
      }
    }

    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      clearGo()
    }
  }, [])
}
