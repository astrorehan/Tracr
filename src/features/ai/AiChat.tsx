import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { endOfMonth, format, startOfMonth, startOfYear, subMonths } from 'date-fns'
import { ArrowUp, Download, FileText, ImagePlus, RotateCcw, Sparkles, X } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { useT } from '@/features/settings/language-context'
import { useActiveBook } from '@/features/books/useActiveBook'
import { qk } from '@/lib/queryClient'
import { cn } from '@/lib/utils'
import { AiMarkdown } from './Markdown'
import { prepareScanImages } from './image'
import type { MsgKey } from '@/i18n'
import {
  callAi,
  requestReport,
  loadChat,
  saveChat,
  HISTORY_LIMIT,
  STARTERS,
  type AiFile,
  type ChatMsg,
  type ScanDocument,
} from './api'
import { ScanImportModal } from './ScanImportModal'

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
  const queryClient = useQueryClient()

  const [messages, setMessages] = useState<ChatMsg[]>(() => loadChat(activeBookId))
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  // Prepared scan tiles staged in the dock, how many photos the user picked
  // (for the thumbnail badge), and a preview of the first tile.
  const [pendingScan, setPendingScan] = useState<string[]>([])
  const [pendingCount, setPendingCount] = useState(0)
  const [imageError, setImageError] = useState(false)
  // Whether a scan is in flight (drives the typing label).
  const [readingReceipt, setReadingReceipt] = useState(false)
  // Extracted document awaiting the one bulk-confirm in the review modal.
  const [scan, setScan] = useState<ScanDocument | null>(null)
  // Index of the reply currently being "typed out" (only ever the newest one).
  const [animIdx, setAnimIdx] = useState<number | null>(null)
  // PDF-report affordance: the period menu, its custom-range fields, and whether
  // a report is being built (drives the typing label).
  const [reportOpen, setReportOpen] = useState(false)
  const [customOpen, setCustomOpen] = useState(false)
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [buildingReport, setBuildingReport] = useState(false)

  // A book switch swaps in that book's conversation before paint, so the old
  // book's messages never flash or get saved under the new key.
  const [prevBook, setPrevBook] = useState(activeBookId)
  if (prevBook !== activeBookId) {
    setPrevBook(activeBookId)
    setAnimIdx(null)
    setPendingScan([])
    setPendingCount(0)
    setScan(null)
    setReportOpen(false)
    setCustomOpen(false)
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
        const data = await callAi({
          mode: 'chat',
          book_id: activeBookId,
          lang,
          question,
          history,
        })
        const files = data.files?.length ? data.files : undefined
        const msg: ChatMsg = data.limited
          ? { role: 'model', content: t('ai.limit'), kind: 'limit' }
          : data.text || files
            ? { role: 'model', content: data.text ?? '', ...(files ? { files } : {}) }
            : { role: 'model', content: t('ai.error'), kind: 'error' }
        setMessages((m) => [...m, msg])
        if (!msg.kind) setAnimIdx(replyAt)
        // A credit was spent (or the block was recorded) either way — refresh the
        // balance chip/Billing page rather than leaving them stale until the next
        // natural refetch.
        if (data.credits_remaining !== undefined) {
          void queryClient.invalidateQueries({ queryKey: qk.creditsBalance })
          void queryClient.invalidateQueries({ queryKey: qk.creditLedger })
        }
        // The assistant wrote something — refresh everything its tools can touch
        // (transactions, but also created categories/accounts/tags/recurring).
        if (data.recorded) {
          void queryClient.invalidateQueries({ queryKey: ['transactions'] })
          void queryClient.invalidateQueries({ queryKey: qk.balances })
          void queryClient.invalidateQueries({ queryKey: qk.payees })
          void queryClient.invalidateQueries({ queryKey: qk.tags })
          void queryClient.invalidateQueries({ queryKey: qk.transactionTags })
          void queryClient.invalidateQueries({ queryKey: qk.categories })
          void queryClient.invalidateQueries({ queryKey: qk.accounts })
          void queryClient.invalidateQueries({ queryKey: qk.recurring })
        }
      } catch {
        setMessages((m) => [...m, { role: 'model', content: t('ai.error'), kind: 'error' }])
      } finally {
        setBusy(false)
        inputRef.current?.focus()
      }
    },
    [busy, activeBookId, messages, lang, t, queryClient],
  )

  // Photos/screenshots take a separate path: extract the rows, then show ONE
  // review-and-confirm modal instead of a back-and-forth chat exchange.
  const runScan = useCallback(async () => {
    if (pendingScan.length === 0 || busy || !activeBookId) return
    const caption = input.trim()
    const images = pendingScan
    // Record the upload in the thread and clear the dock up front (mirrors
    // send()), so the sheet never looks blank while the scan is in flight.
    setMessages((m) => [...m, { role: 'user', content: caption, image: images[0] }])
    setPendingScan([])
    setPendingCount(0)
    setInput('')
    setBusy(true)
    setReadingReceipt(true)
    try {
      const data = await callAi({
        mode: 'scan',
        book_id: activeBookId,
        lang,
        images,
        ...(caption ? { question: caption } : {}),
      })
      if (data.credits_remaining !== undefined) {
        void queryClient.invalidateQueries({ queryKey: qk.creditsBalance })
        void queryClient.invalidateQueries({ queryKey: qk.creditLedger })
      }
      if (data.limited) {
        setMessages((m) => [...m, { role: 'model', content: t('ai.limit'), kind: 'limit' }])
      } else if (data.scan) {
        // Hand off to the review modal — close the sheet so it isn't left
        // stacked behind it looking like the conversation was wiped.
        setScan(data.scan)
        onClose()
      } else {
        setMessages((m) => [...m, { role: 'model', content: t('ai.scanFailed'), kind: 'error' }])
      }
    } catch {
      setMessages((m) => [...m, { role: 'model', content: t('ai.scanFailed'), kind: 'error' }])
    } finally {
      setBusy(false)
      setReadingReceipt(false)
    }
  }, [pendingScan, busy, activeBookId, lang, input, t, onClose])

  // Fixed report periods, resolved to plain calendar dates with `format` (local
  // time) — NOT toISOString, which would shift the month boundary a day in
  // timezones ahead of UTC (e.g. WIB) and quietly report the wrong month.
  const reportPeriods = useMemo<{ key: MsgKey; start: string; end: string }[]>(() => {
    const now = new Date()
    const iso = (d: Date) => format(d, 'yyyy-MM-dd')
    const lastMonth = subMonths(now, 1)
    return [
      { key: 'ai.periodThisMonth', start: iso(startOfMonth(now)), end: iso(endOfMonth(now)) },
      { key: 'ai.periodLastMonth', start: iso(startOfMonth(lastMonth)), end: iso(endOfMonth(lastMonth)) },
      { key: 'ai.periodThisYear', start: iso(startOfYear(now)), end: iso(now) },
      { key: 'ai.periodLast12', start: iso(subMonths(now, 12)), end: iso(now) },
    ]
  }, [])

  // Build a PDF report for an explicit period. This is the deterministic server
  // path (mode 'report') — no LLM, not metered — so it never spends the user's
  // monthly assistant quota. Mirrors send() for the busy/scroll bookkeeping.
  const runReport = useCallback(
    async (start: string, end: string, periodLabel: string) => {
      if (buildingReport || busy || !activeBookId) return
      setReportOpen(false)
      setCustomOpen(false)
      setMessages((m) => [...m, { role: 'user', content: t('ai.reportRequest', { period: periodLabel }) }])
      setBusy(true)
      setBuildingReport(true)
      setAnimIdx(null)
      stickRef.current = true
      try {
        const data = await requestReport({ book_id: activeBookId, start, end, lang })
        if (data.files?.length) {
          setMessages((m) => [...m, { role: 'model', content: t('ai.reportReady'), files: data.files }])
        } else if (data.empty) {
          setMessages((m) => [...m, { role: 'model', content: t('ai.reportEmpty') }])
        } else {
          setMessages((m) => [...m, { role: 'model', content: t('ai.reportFailed'), kind: 'error' }])
        }
      } catch {
        setMessages((m) => [...m, { role: 'model', content: t('ai.reportFailed'), kind: 'error' }])
      } finally {
        setBusy(false)
        setBuildingReport(false)
      }
    },
    [buildingReport, busy, activeBookId, lang, t],
  )

  useImperativeHandle(ref, () => ({ ask: (q: string) => void send(q) }), [send])

  function submit(e: FormEvent) {
    e.preventDefault()
    if (pendingScan.length > 0) void runScan()
    else void send(input)
  }

  function reset() {
    setAnimIdx(null)
    setPendingScan([])
    setPendingCount(0)
    setMessages([])
  }

  const fileRef = useRef<HTMLInputElement>(null)

  async function pickImages(files: FileList | null) {
    if (!files || files.length === 0) return
    setImageError(false)
    try {
      setPendingScan(await prepareScanImages(files))
      setPendingCount(files.length)
      inputRef.current?.focus()
    } catch {
      setImageError(true)
    }
  }

  function handleScroll() {
    const el = scrollRef.current
    if (el) stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120
  }

  // Portalled to <body>: the page shell wraps routes in a z-10 stacking
  // context, so a fixed overlay rendered in place would sit under the z-40
  // bottom tab bar. The review modal stays mounted even when the sheet is
  // closed, so a scan already in review is never lost.
  return (
    <>
      {open &&
        createPortal(
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
              {busy && (
                <TypingRow
                  label={
                    buildingReport
                      ? t('ai.buildingReport')
                      : readingReceipt
                        ? t('ai.readingReceipt')
                        : t('ai.thinking')
                  }
                />
              )}
            </div>
          )}
        </div>

        {/* ── Input dock ── */}
        <form
          onSubmit={submit}
          className="border-t border-border bg-surface px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3"
        >
          {/* Staged receipt / screenshot photos */}
          {pendingScan.length > 0 && (
            <div className="animate-msg mb-2.5 flex items-center gap-2.5 px-1">
              <span className="relative inline-block">
                <img
                  src={pendingScan[0]}
                  alt=""
                  className="h-14 w-14 rounded-xl border border-border object-cover shadow-sm"
                />
                {pendingCount > 1 && (
                  <span className="absolute -left-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-white shadow-sm">
                    {pendingCount}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setPendingScan([])
                    setPendingCount(0)
                  }}
                  aria-label={t('ai.removeImage')}
                  className="pressable absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full border border-border bg-surface text-muted-foreground shadow-sm hover:text-foreground"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
              <p className="text-xs font-semibold text-muted-foreground">{t('ai.attachHint')}</p>
            </div>
          )}
          {imageError && (
            <p className="mb-2 px-1 text-xs font-semibold text-danger">{t('ai.imageInvalid')}</p>
          )}

          {/* PDF report — free, deterministic path (no AI call). Hidden while a
              photo is staged so the dock doesn't get crowded. */}
          {pendingScan.length === 0 && (
            <div className="mb-2">
              {!reportOpen ? (
                <button
                  type="button"
                  onClick={() => setReportOpen(true)}
                  disabled={busy || !activeBookId}
                  className="pressable inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-muted/60 px-3 py-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
                >
                  <FileText className="h-3.5 w-3.5" />
                  {t('ai.report')}
                </button>
              ) : (
                <div className="animate-msg space-y-2 rounded-2xl border border-border bg-surface-muted/40 p-2.5">
                  <div className="flex items-center justify-between px-1">
                    <span className="text-xs font-bold text-foreground">{t('ai.reportPick')}</span>
                    <button
                      type="button"
                      onClick={() => setReportOpen(false)}
                      aria-label={t('common.close')}
                      className="pressable text-muted-foreground hover:text-foreground"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {reportPeriods.map((p) => (
                      <button
                        key={p.key}
                        type="button"
                        disabled={busy}
                        onClick={() => void runReport(p.start, p.end, t(p.key))}
                        className="pressable rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-foreground transition-colors hover:border-primary/40 hover:bg-primary-soft/50 disabled:opacity-40"
                      >
                        {t(p.key)}
                      </button>
                    ))}
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => setCustomOpen((v) => !v)}
                      className={cn(
                        'pressable rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-40',
                        customOpen
                          ? 'border-primary/50 bg-primary-soft text-primary'
                          : 'border-border bg-surface text-foreground hover:border-primary/40',
                      )}
                    >
                      {t('ai.periodCustom')}
                    </button>
                  </div>
                  {customOpen && (
                    <div className="flex flex-wrap items-center gap-2 px-1 pt-0.5">
                      <input
                        type="date"
                        value={customFrom}
                        max={customTo || undefined}
                        onChange={(e) => setCustomFrom(e.target.value)}
                        aria-label={t('ai.reportFrom')}
                        className="h-9 rounded-lg border border-border bg-surface px-2 text-xs text-foreground focus-visible:border-primary/70 focus-visible:outline-none"
                      />
                      <span className="text-xs text-muted-foreground">–</span>
                      <input
                        type="date"
                        value={customTo}
                        min={customFrom || undefined}
                        onChange={(e) => setCustomTo(e.target.value)}
                        aria-label={t('ai.reportTo')}
                        className="h-9 rounded-lg border border-border bg-surface px-2 text-xs text-foreground focus-visible:border-primary/70 focus-visible:outline-none"
                      />
                      <button
                        type="button"
                        disabled={busy || !customFrom || !customTo || customFrom > customTo}
                        onClick={() => void runReport(customFrom, customTo, `${customFrom} – ${customTo}`)}
                        className="brand-gradient pressable h-9 rounded-lg px-3 text-xs font-bold text-white disabled:pointer-events-none disabled:opacity-40"
                      >
                        {t('ai.reportCreate')}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="flex items-center gap-2">
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              className="hidden"
              onChange={(e) => {
                void pickImages(e.target.files)
                e.target.value = '' // same file can be picked again
              }}
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={busy || !activeBookId}
              aria-label={t('ai.attach')}
              title={t('ai.attach')}
              className={cn(
                'pressable flex h-12 w-12 shrink-0 items-center justify-center rounded-full border transition-colors disabled:pointer-events-none disabled:opacity-40',
                pendingScan.length > 0
                  ? 'border-primary/50 bg-primary-soft text-primary'
                  : 'border-border bg-surface-muted/60 text-muted-foreground hover:text-foreground',
              )}
            >
              <ImagePlus className="h-5 w-5" />
            </button>
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={pendingScan.length > 0 ? t('ai.captionPlaceholder') : t('ai.askPlaceholder')}
              disabled={!activeBookId}
              aria-label={t('ai.chatTitle')}
              className="h-12 w-full flex-1 rounded-full border border-border bg-surface-muted/60 px-5 text-[15px] text-foreground placeholder:text-muted-foreground focus-visible:border-primary/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35 disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={busy || (!input.trim() && pendingScan.length === 0) || !activeBookId}
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
        )}
      <ScanImportModal
        scan={scan}
        onClose={() => setScan(null)}
        onImported={(imported, skipped) =>
          setMessages((m) => [
            ...m,
            {
              role: 'model',
              content:
                skipped > 0
                  ? t('ai.scanSavedDup', { count: imported, skipped })
                  : t('ai.scanSaved', { count: imported }),
            },
          ])
        }
      />
    </>
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
      <p className="stagger-5 animate-rise mt-4 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
        <ImagePlus className="h-3.5 w-3.5" />
        {t('ai.attachHint')}
      </p>
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
  const { t } = useT()
  if (msg.role === 'user') {
    return (
      <div className="animate-msg flex justify-end">
        <div className="max-w-[85%] overflow-hidden rounded-[20px] rounded-br-md bg-primary text-primary-foreground shadow-sm">
          {msg.image && (
            <img src={msg.image} alt="" className="max-h-56 w-full object-cover" />
          )}
          {msg.content ? (
            <p className="whitespace-pre-wrap px-4 py-2.5 text-sm font-medium leading-relaxed">
              {msg.content}
            </p>
          ) : (
            !msg.image && <PhotoPlaceholder />
          )}
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
        {msg.kind === 'limit' && typing == null && (
          <Link
            to="/billing"
            className="mt-2 inline-block text-xs font-bold text-primary hover:underline"
          >
            {t('billing.goToBilling')}
          </Link>
        )}
        {/* File attachments land once the text has finished typing out. */}
        {msg.files && msg.files.length > 0 && typing == null && (
          <div className={cn('space-y-1.5', msg.content && 'mt-2.5')}>
            {msg.files.map((f, i) => (
              <FileChip key={i} file={f} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

/** Turn the base64 payload into a real download. The object URL is revoked on
 *  a delay — revoking synchronously can cancel the save in some browsers. */
function downloadAiFile(file: AiFile) {
  if (!file.data) return
  const bin = atob(file.data)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  const url = URL.createObjectURL(new Blob([bytes], { type: file.mime }))
  const a = document.createElement('a')
  a.href = url
  a.download = file.name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

/** A generated file (PDF report) in the thread: tap to download. Restored
 *  conversations keep the chip but not the payload — those render as expired. */
function FileChip({ file }: { file: AiFile }) {
  const { t } = useT()
  const expired = !file.data
  const kind = file.mime.split('/')[1]?.toUpperCase() ?? 'FILE'
  return (
    <button
      type="button"
      disabled={expired}
      onClick={() => downloadAiFile(file)}
      className={cn(
        'pressable flex w-full items-center gap-2.5 rounded-xl border border-border bg-surface-muted/60 px-3 py-2.5 text-left transition-colors',
        expired ? 'opacity-60' : 'hover:border-primary/40 hover:bg-primary-soft/50',
      )}
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
        <FileText className="h-[18px] w-[18px]" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-bold text-foreground">{file.name}</span>
        <span className="block text-[11px] font-medium text-muted-foreground">
          {expired ? t('ai.fileGone') : kind}
        </span>
      </span>
      {!expired && <Download className="h-4 w-4 shrink-0 text-primary" />}
    </button>
  )
}

/** Stand-in for a photo-only message restored from storage (photos aren't
 *  persisted — see saveChat). */
function PhotoPlaceholder() {
  const { t } = useT()
  return (
    <p className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium leading-relaxed">
      <ImagePlus className="h-4 w-4" /> {t('ai.photo')}
    </p>
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
