import { useState } from 'react'
import { ChevronDown, HeartPulse, Lightbulb, ShieldCheck } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { useT } from '@/features/settings/language-context'
import type { MsgKey } from '@/i18n'
import { cn } from '@/lib/utils'
import type { Grade, Runway, ScoreKey, ScoreTip, WalletScore } from './health'

/** Semicircle sweep length for r=80 — π × 80, precomputed for the dash offset. */
const ARC = Math.PI * 80

const GRADE_TEXT: Record<Grade, string> = {
  great: 'text-positive',
  good: 'text-primary',
  fair: 'text-warning',
  weak: 'text-danger',
}

const PART_LABEL: Record<ScoreKey, MsgKey> = {
  savings: 'score.part.savings',
  runway: 'score.part.runway',
  debt: 'score.part.debt',
  card: 'score.part.card',
  budget: 'score.part.budget',
  habit: 'score.part.habit',
}

/**
 * One 0-100 read on the whole picture, with its evidence one tap away.
 *
 * Collapsed by default: a score, a plain-language grade, how long the money
 * lasts, and at most one thing to fix. The six sub-scores are there for anyone
 * who wants them, but a home screen that opens with six bars is a chore, not a
 * comfort.
 */
export function WalletScoreCard({
  score,
  runway,
  tip,
}: {
  score: WalletScore
  runway: Runway
  tip: ScoreTip | null
}) {
  const { t } = useT()
  const [open, setOpen] = useState(false)
  const gradeColor = GRADE_TEXT[score.grade]

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-base font-bold text-foreground">
          <HeartPulse className="h-[18px] w-[18px] text-muted-foreground" />
          {t('score.title')}
        </h2>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="pressable flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold text-primary transition-colors hover:bg-primary-soft"
        >
          {t(open ? 'score.hideDetails' : 'score.details')}
          <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', open && 'rotate-180')} />
        </button>
      </div>

      <div className="mt-3 flex items-center gap-4">
        <Gauge score={score.score} colorClass={gradeColor} />
        <div className="min-w-0 flex-1">
          <p className={cn('text-lg font-extrabold leading-tight', gradeColor)}>
            {t(`score.grade.${score.grade}` as MsgKey)}
          </p>
          <p className="mt-1 text-xs font-medium leading-relaxed text-muted-foreground">
            {runway.months == null
              ? t('score.runwayUnknown')
              : runway.months < 1
                ? // Under a month, days are something you can picture.
                  t('score.runwayDays', { n: Math.max(1, Math.round(runway.months * 30)) })
                : t('score.runwayLine', { months: runway.months.toFixed(1) })}
          </p>
        </div>
      </div>

      {/* One thing to do next — or a nod that there's nothing to do. */}
      <div
        className={cn(
          'mt-4 flex items-start gap-2.5 rounded-2xl px-3.5 py-3 text-xs font-semibold leading-relaxed',
          tip ? 'bg-warning/10 text-warning' : 'bg-positive/10 text-positive',
        )}
      >
        {tip ? (
          <>
            <Lightbulb className="mt-px h-4 w-4 shrink-0" />
            <span>{t(`score.tip.${tip.key}` as MsgKey, tip.vars)}</span>
          </>
        ) : (
          <>
            <ShieldCheck className="mt-px h-4 w-4 shrink-0" />
            <span>{t('score.allSteady')}</span>
          </>
        )}
      </div>

      {open && (
        <div className="mt-4 space-y-2.5 border-t border-border pt-4">
          {score.parts.map((p) => (
            <div key={p.key} className="flex items-center gap-3">
              <span className="w-32 shrink-0 text-xs font-semibold text-foreground sm:w-36">
                {t(PART_LABEL[p.key])}
              </span>
              <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-muted">
                {p.value != null && (
                  <span
                    className={cn('block h-full rounded-full', barColor(p.value))}
                    style={{ width: `${p.value}%` }}
                  />
                )}
              </span>
              <span
                className={cn(
                  'w-9 shrink-0 text-right font-numeric text-xs font-bold',
                  p.value == null ? 'text-muted-foreground' : 'text-foreground',
                )}
              >
                {p.value ?? '—'}
              </span>
            </div>
          ))}
          {score.measured < score.parts.length && (
            <p className="pt-1 text-[11px] font-medium leading-relaxed text-muted-foreground">
              {t('score.unmeasuredNote')}
            </p>
          )}
        </div>
      )}
    </Card>
  )
}

function barColor(value: number) {
  if (value >= 80) return 'bg-positive'
  if (value >= 60) return 'bg-primary'
  if (value >= 40) return 'bg-warning'
  return 'bg-danger'
}

/** Half-donut dial. The arc is one stroked path revealed by its dash offset. */
function Gauge({ score, colorClass }: { score: number; colorClass: string }) {
  return (
    <svg viewBox="0 0 200 118" className="h-[76px] w-[130px] shrink-0" role="img" aria-label={`${score}/100`}>
      <path
        d="M 20 100 A 80 80 0 0 1 180 100"
        fill="none"
        strokeWidth="16"
        strokeLinecap="round"
        className="stroke-surface-muted"
      />
      <path
        d="M 20 100 A 80 80 0 0 1 180 100"
        fill="none"
        stroke="currentColor"
        strokeWidth="16"
        strokeLinecap="round"
        strokeDasharray={ARC}
        strokeDashoffset={ARC * (1 - Math.min(100, Math.max(0, score)) / 100)}
        className={cn(colorClass, 'transition-[stroke-dashoffset] duration-700 ease-out')}
      />
      <text
        x="100"
        y="94"
        textAnchor="middle"
        className={cn('fill-current font-numeric text-[44px] font-extrabold', colorClass)}
      >
        {score}
      </text>
    </svg>
  )
}
