import { useEffect, useState } from 'react'
import { format } from 'date-fns'
import { RotateCcw, Sparkles } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Skeleton } from '@/components/ui/States'
import { useT } from '@/features/settings/language-context'
import { useActiveBook } from '@/features/books/useActiveBook'
import { dateLocale, type MsgKey } from '@/i18n'
import { AiAvatar } from './AiChat'
import { AiMarkdown } from './Markdown'
import { callAi, loadInsight, saveInsight } from './api'

const LOADING_STEPS: MsgKey[] = ['ai.analyzing', 'ai.analyzing2', 'ai.analyzing3']

/**
 * Reports-page AI analysis: one tap reads the current month (totals, top
 * categories, budgets) and writes a short plain-words summary. The result is
 * cached per book+month in sessionStorage so tab hops don't re-spend quota.
 */
export function AiInsightCard() {
  const { t, lang } = useT()
  const { activeBookId } = useActiveBook()

  const month = format(new Date(), 'yyyy-MM')
  const monthLabel = format(new Date(), 'MMMM yyyy', { locale: dateLocale() })

  const [text, setText] = useState<string | null>(() => loadInsight(activeBookId, month))
  const [state, setState] = useState<'idle' | 'loading' | 'error' | 'limited'>('idle')
  const [step, setStep] = useState(0)

  // Swap in the cached summary before paint when the book (or month) changes.
  const cacheKey = `${activeBookId}:${month}`
  const [prevKey, setPrevKey] = useState(cacheKey)
  if (prevKey !== cacheKey) {
    setPrevKey(cacheKey)
    setText(loadInsight(activeBookId, month))
    setState('idle')
  }

  // Rotate the "what I'm doing" line while the model reads the ledger.
  useEffect(() => {
    if (state !== 'loading') return
    const id = setInterval(() => setStep((n) => n + 1), 2200)
    return () => clearInterval(id)
  }, [state])

  async function analyze() {
    if (!activeBookId || state === 'loading') return
    setState('loading')
    setStep(0)
    try {
      const data = await callAi({ mode: 'insights', book_id: activeBookId, lang })
      if (data.limited) {
        setState('limited')
      } else if (data.text) {
        setText(data.text)
        saveInsight(activeBookId, month, data.text)
        setState('idle')
      } else {
        setState('error')
      }
    } catch {
      setState('error')
    }
  }

  return (
    <Card className="ai-rim relative overflow-hidden p-0">
      <div
        aria-hidden
        className="pointer-events-none absolute -left-12 -top-14 h-40 w-40 rounded-full bg-primary/10 blur-2xl"
      />

      {/* Header */}
      <div className="relative flex items-center gap-3 px-5 pt-5">
        <AiAvatar className="h-10 w-10 rounded-[14px]" iconClassName="h-5 w-5" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <h2 className="section-head text-[17px] text-foreground">{t('ai.insightTitle')}</h2>
            <span className="rounded-md bg-primary-soft px-1.5 py-px text-[10px] font-extrabold tracking-wide text-primary">
              AI
            </span>
          </div>
          <p className="truncate text-xs font-semibold text-muted-foreground">{monthLabel}</p>
        </div>
        {text && state !== 'loading' && (
          <button
            type="button"
            onClick={analyze}
            className="pressable inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-border bg-surface px-3 text-xs font-bold text-foreground transition-colors hover:bg-surface-muted sm:px-3.5 print:hidden"
            aria-label={t('ai.reanalyze')}
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{t('ai.reanalyze')}</span>
          </button>
        )}
      </div>

      {/* Body */}
      <div className="relative px-5 pb-5 pt-4">
        {state === 'loading' ? (
          <div className="space-y-2.5" role="status" aria-label={t('ai.analyzing')}>
            <Skeleton className="h-3.5 w-[85%]" />
            <Skeleton className="h-3.5 w-[70%]" />
            <Skeleton className="h-3.5 w-[78%]" />
            <Skeleton className="h-3.5 w-[55%]" />
            <p className="flex items-center gap-2 pt-1 text-xs font-bold text-primary">
              <Sparkles className="h-3.5 w-3.5 animate-pulse" />
              {t(LOADING_STEPS[step % LOADING_STEPS.length])}
            </p>
          </div>
        ) : text ? (
          <>
            {state === 'error' && (
              <p className="mb-3 rounded-xl border border-danger/30 bg-danger/5 px-3.5 py-2.5 text-xs font-semibold text-danger">
                {t('ai.error')}
              </p>
            )}
            {state === 'limited' && (
              <p className="mb-3 rounded-xl border border-warning/40 bg-warning/10 px-3.5 py-2.5 text-xs font-semibold text-foreground">
                {t('ai.limit')}
              </p>
            )}
            <div key={text.slice(0, 24)} className="animate-rise">
              <AiMarkdown text={text} />
            </div>
            <p className="mt-4 border-t border-border pt-3 text-[11px] font-medium text-muted-foreground">
              {t('ai.disclaimer')}
            </p>
          </>
        ) : state === 'limited' ? (
          <p className="rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm font-medium text-foreground">
            {t('ai.limit')}
          </p>
        ) : (
          <div className="flex flex-col items-start gap-3.5">
            <p className="max-w-[520px] text-sm font-medium leading-relaxed text-muted-foreground">
              {state === 'error' ? t('ai.error') : t('ai.insightDesc')}
            </p>
            <Button onClick={analyze} disabled={!activeBookId} className="rounded-full print:hidden">
              <Sparkles className="h-4 w-4" />
              {state === 'error' ? t('common.retry') : t('ai.analyze')}
            </Button>
          </div>
        )}
      </div>
    </Card>
  )
}
