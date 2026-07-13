import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type FormEvent,
} from 'react'
import { createPortal } from 'react-dom'
import { ArrowUp, RotateCcw, Sparkles, X } from 'lucide-react'
import { useT } from '@/features/settings/language-context'
import { useActiveBook } from '@/features/books/useActiveBook'
import { cn } from '@/lib/utils'
import { AiMarkdown } from './Markdown'
import { callAi, loadChat, saveChat, HISTORY_LIMIT, STARTERS, type ChatMsg } from './api'

/** The assistant's face: a gradient sparkle chip, same everywhere it appears. */
export function AiAvatar({
  className,
  iconClassName,
}: {
  className?: string
  iconClassName?: string
}) {
  return (
    <span
      aria-hidden
      className={cn(
        'brand-gradient flex shrink-0 items-center justify-center rounded-xl text-white shadow-sm',
        className ?? 'h-9 w-9',
      )}
    >
      <Sparkles className={iconClassName ?? 'h-[18px] w-[18px]'} />
    </span>
  )
}

/** Progressive reveal of the newest reply — chunked so any length lands in
 *  ~1.5s. Under prefers-reduced-motion the first tick reveals everything. */
function useTypewriter(text: string | null) {
  const [shown, setShown] = useState(0)
  // Reset synchronously when a new reply starts (render-phase state adjust).
  const [prevText, setPrevText] = useState(text)
  if (prevText !== text) {
    setPrevText(text)
    setShown(0)
  }

  useEffect(() => {
    if (text == null) return
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const step = reduced ? text.length : Math.max(2, Math.ceil(text.length / 90))
    const id = setInterval(() => {
      setShown((n) => {
        const next = n + step
        if (next >= text.length) {
          clearInterval(id)
          return text.length
        }
        return next
      })
    }, 16)
    return () => clearInterval(id)
  }, [text])

  const finish = useCallback(() => {
    if (text != null) setShown(text.length)
  }, [text])

  return { shown, done: text == null || shown >= text.length, finish }
}

export interface ChatSheetHandle {
  /** Send a question programmatically (launcher chips). Opens mid-thought. */
  ask: (question: string) => void
}

interface ChatSheetProps {
  open: boolean
  onClose: () => void
}

/**
 * The assistant surface: full-screen sheet on mobile, floating bottom-right
 * panel on desktop. Stays mounted while closed so the conversation (and its
 * scroll position) survives open/close.
 */
export const ChatSheet = forwardRef<ChatSheetHandle, ChatSheetProps>(function ChatSheet(
  { open, onClose },
  ref,
) {
  const { t, lang } = useT()
  const { activeBookId } = useActiveBook()

  const [messages, setMessages] = useState<ChatMsg[]>(() => loadChat(activeBookId))
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  // Index of the reply currently being "typed out" (only ever the newest one).
  const [animIdx, setAnimIdx] = useState<number | null>(null)

  // A book switch swaps in that book's conversation before paint, so the old
  // book's messages never flash or get saved under the new key.
  const [prevBook, setPrevBook] = useState(activeBookId)
  if (prevBook !== activeBookId) {
    setPrevBook(activeBookId)
    setAnimIdx(null)
    setMessages(loadChat(activeBookId))
  }

  useEffect(() => {
    saveChat(activeBookId, messages)
  }, [activeBookId, messages])

  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  // Follow the bottom only while the user is already there — never yank them
  // back down while they're re-reading something above.
  const stickRef = useRef(true)

  const scrollToBottom = useCallback((smooth = false) => {
    const el = scrollRef.current
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' })
  }, [])

  const { shown, done, finish } = useTypewriter(
    animIdx != null ? (messages[animIdx]?.content ?? null) : null,
  )

  // Keep the newest words on screen while the reply types itself out.
  useEffect(() => {
    if (stickRef.current) scrollToBottom()
  }, [shown, scrollToBottom])

  useEffect(() => {
    if (stickRef.current) scrollToBottom(true)
  }, [messages.length, busy, scrollToBottom])

  // Esc closes; page scroll locks while open (same contract as Modal).
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  // On open: jump to the latest message; focus the input on desktop only (on
  // phones the keyboard would cover the starter questions).
  useEffect(() => {
    if (!open) return
    requestAnimationFrame(() => scrollToBottom())
    if (window.matchMedia('(min-width: 640px)').matches) {
      const id = setTimeout(() => inputRef.current?.focus(), 350)
      return () => clearTimeout(id)
    }
  }, [open, scrollToBottom])

  const send = useCallback(
    async (raw: string) => {
      const question = raw.trim()
      if (!question || busy || !activeBookId) return
      const history = messages.filter((m) => !m.kind).slice(-HISTORY_LIMIT)
      const replyAt = messages.length + 1
      setMessages((m) => [...m, { role: 'user', content: question }])
      setInput('')
      setBusy(true)
      setAnimIdx(null)
      stickRef.current = true
      try {
        const data = await callAi({ mode: 'chat', book_id: activeBookId, lang, question, history })
        const msg: ChatMsg = data.limited
          ? { role: 'model', content: t('ai.limit'), kind: 'limit' }
          : data.text
            ? { role: 'model', content: data.text }
            : { role: 'model', content: t('ai.error'), kind: 'error' }
        setMessages((m) => [...m, msg])
        if (!msg.kind) setAnimIdx(replyAt)
      } catch {
        setMessages((m) => [...m, { role: 'model', content: t('ai.error'), kind: 'error' }])
      } finally {
        setBusy(false)
        inputRef.current?.focus()
      }
    },
    [busy, activeBookId, messages, lang, t],
  )

  useImperativeHandle(ref, () => ({ ask: (q: string) => void send(q) }), [send])

  function submit(e: FormEvent) {
    e.preventDefault()
    void send(input)
  }

  function reset() {
    setAnimIdx(null)
    setMessages([])
  }

  function handleScroll() {
    const el = scrollRef.current
    if (el) stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120
  }

  if (!open) return null

  // Portalled to <body>: the page shell wraps routes in a z-10 stacking
  // context, so a fixed overlay rendered in place would sit under the z-40
  // bottom tab bar.
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:justify-end sm:p-5">
      <div className="absolute inset-0 animate-fade-in bg-black/55" onClick={onClose} aria-hidden />

      <section
        role="dialog"
        aria-modal="true"
        aria-label={t('ai.assistant')}
        className={cn(
          'relative flex h-[100dvh] w-full animate-slide-up flex-col overflow-hidden bg-background',
          'sm:h-[min(700px,calc(100dvh-40px))] sm:w-[440px] sm:animate-pop sm:rounded-[26px] sm:border sm:border-border sm:shadow-lg',
        )}
      >
        {/* ── Header ── */}
        <header className="flex items-center gap-3 border-b border-border bg-surface px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
          <AiAvatar className="h-10 w-10 rounded-[14px]" iconClassName="h-5 w-5" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <p className="truncate text-[15px] font-extrabold text-foreground">
                {t('ai.assistant')}
              </p>
              <span className="rounded-md bg-primary-soft px-1.5 py-px text-[10px] font-extrabold tracking-wide text-primary">
                AI
              </span>
            </div>
            <p className="truncate text-xs font-medium text-muted-foreground">
              {t('settings.aiDesc')}
            </p>
          </div>
          {messages.length > 0 && (
            <button
              type="button"
              onClick={reset}
              className="pressable flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border bg-surface-muted text-muted-foreground transition-colors hover:text-foreground"
              aria-label={t('ai.newChat')}
              title={t('ai.newChat')}
            >
              <RotateCcw className="h-4 w-4" />
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="pressable flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border bg-surface-muted text-muted-foreground transition-colors hover:text-foreground"
            aria-label={t('common.close')}
          >
            <X className="h-[18px] w-[18px]" />
          </button>
        </header>

        {/* ── Messages ── */}
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto overscroll-contain px-4 py-4"
        >
          {messages.length === 0 && !busy ? (
            <EmptyChat onPick={send} disabled={busy || !activeBookId} />
          ) : (
            <div role="log" className="space-y-3.5">
              {messages.map((m, i) => (
                <Bubble
                  key={i}
                  msg={m}
                  typing={i === animIdx && !done ? shown : null}
                  onSkip={finish}
                />
              ))}
              {busy && <TypingRow label={t('ai.thinking')} />}
            </div>
          )}
        </div>

        {/* ── Input dock ── */}
        <form
          onSubmit={submit}
          className="border-t border-border bg-surface px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3"
        >
          <div className="flex items-center gap-2">
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={t('ai.askPlaceholder')}
              disabled={!activeBookId}
              aria-label={t('ai.chatTitle')}
              className="h-12 w-full flex-1 rounded-full border border-border bg-surface-muted/60 px-5 text-[15px] text-foreground placeholder:text-muted-foreground focus-visible:border-primary/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35 disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={busy || !input.trim() || !activeBookId}
              aria-label={t('ai.send')}
              className="brand-gradient btn-sheen pressable flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-white disabled:pointer-events-none disabled:opacity-40"
            >
              <ArrowUp className="h-5 w-5 stroke-[2.6]" />
            </button>
          </div>
          <p className="mt-2 text-center text-[11px] font-medium text-muted-foreground">
            {t('ai.disclaimer')}
          </p>
        </form>
      </section>
    </div>,
    document.body,
  )
})

/** Greeting + tappable starter questions, shown before the first message. */
function EmptyChat({ onPick, disabled }: { onPick: (q: string) => void; disabled: boolean }) {
  const { t } = useT()
  return (
    <div className="flex min-h-full flex-col items-center justify-center px-2 py-6 text-center">
      <AiAvatar className="h-16 w-16 rounded-[22px]" iconClassName="h-8 w-8" />
      <h3 className="mt-4 text-lg font-extrabold tracking-tight text-foreground">
        {t('ai.greetTitle')}
      </h3>
      <p className="mt-1.5 max-w-[300px] text-sm font-medium leading-relaxed text-muted-foreground">
        {t('ai.greetDesc')}
      </p>
      <div className="mt-6 grid w-full gap-2">
        {STARTERS.map((k, i) => (
          <button
            key={k}
            type="button"
            disabled={disabled}
            onClick={() => onPick(t(k))}
            className={cn(
              'pressable animate-rise flex items-center gap-2.5 rounded-2xl border border-border bg-surface px-4 py-3 text-left text-sm font-semibold text-foreground shadow-sm transition-colors hover:border-primary/40 hover:bg-primary-soft/50 disabled:opacity-50',
              `stagger-${i + 1}`,
            )}
          >
            <Sparkles className="h-4 w-4 shrink-0 text-primary" />
            {t(k)}
          </button>
        ))}
      </div>
    </div>
  )
}

function Bubble({
  msg,
  typing,
  onSkip,
}: {
  msg: ChatMsg
  /** Chars revealed so far while this reply is typing out, or null when settled. */
  typing: number | null
  onSkip: () => void
}) {
  if (msg.role === 'user') {
    return (
      <div className="animate-msg flex justify-end">
        <div className="max-w-[85%] whitespace-pre-wrap rounded-[20px] rounded-br-md bg-primary px-4 py-2.5 text-sm font-medium leading-relaxed text-primary-foreground shadow-sm">
          {msg.content}
        </div>
      </div>
    )
  }
  const text = typing != null ? msg.content.slice(0, typing) : msg.content
  return (
    <div className="animate-msg flex items-end gap-2">
      <AiAvatar className="mb-0.5 h-7 w-7 rounded-[9px]" iconClassName="h-3.5 w-3.5" />
      <div
        onClick={typing != null ? onSkip : undefined}
        className={cn(
          'min-w-0 max-w-[85%] rounded-[20px] rounded-bl-md border px-4 py-3 shadow-sm',
          msg.kind === 'limit'
            ? 'border-warning/40 bg-warning/10'
            : msg.kind === 'error'
              ? 'border-danger/30 bg-danger/5'
              : 'border-border bg-surface',
        )}
      >
        <AiMarkdown text={text} className={cn(typing != null && 'ai-caret')} />
      </div>
    </div>
  )
}

/** Three hopping dots while the model works. */
function TypingRow({ label }: { label: string }) {
  return (
    <div className="animate-msg flex items-end gap-2" role="status" aria-label={label}>
      <AiAvatar className="mb-0.5 h-7 w-7 rounded-[9px]" iconClassName="h-3.5 w-3.5" />
      <div className="flex items-center gap-1.5 rounded-[20px] rounded-bl-md border border-border bg-surface px-4 py-[15px] shadow-sm">
        <span className="typing-dot h-2 w-2 rounded-full bg-primary/70" />
        <span className="typing-dot h-2 w-2 rounded-full bg-primary/70" />
        <span className="typing-dot h-2 w-2 rounded-full bg-primary/70" />
      </div>
    </div>
  )
}
