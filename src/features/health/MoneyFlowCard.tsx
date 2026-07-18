import { Link } from 'react-router-dom'
import { ArrowDownLeft, ArrowUpRight } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { AnimatedNumber } from '@/components/ui/AnimatedNumber'
import { formatMoney } from '@/lib/money'
import { ACCOUNT_COLORS } from '@/features/accounts/meta'
import { pctChange } from '@/features/reports/reports'
import { useT } from '@/features/settings/language-context'
import { cn } from '@/lib/utils'
import type { FlowDetail } from './useWalletHealth'

/** Categories listed before the rest is rolled into an "other" row. */
const TOP_N = 3
/** `categoryBreakdown`'s sentinel id for contributions with no category. */
const UNCATEGORIZED_ID = '__uncat'
/** The grey `categoryBreakdown` falls back to when a category has no colour set. */
const NO_COLOUR = '#94a3b8'

/**
 * Categories created before the colour picker existed (or via import/the bot)
 * have `color: null`, and the breakdown gives every one of them the same grey —
 * which turns the split bar into a meaningless block. Give those a stable
 * stand-in keyed off the category id so the same category keeps the same colour
 * between renders. Genuinely uncategorised money stays grey, because that's
 * information rather than a gap.
 */
function sliceColour(id: string, colour: string): string {
  if (id === UNCATEGORIZED_ID || colour !== NO_COLOUR) return colour
  let hash = 0
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0
  return ACCOUNT_COLORS[hash % ACCOUNT_COLORS.length]
}

/**
 * A month's money in — or money out — as a card of its own.
 *
 * The old three-cell strip could only say *how much*. Given a whole card the
 * useful thing to add is *where from* / *what on*, so the split bar and the
 * ranked categories are the point; the headline figure is just the label.
 */
export function MoneyFlowCard({
  kind,
  flow,
  base,
  month,
}: {
  kind: 'income' | 'expense'
  flow: FlowDetail
  base: string
  /** Month name for the header, already localised. */
  month: string
}) {
  const { t } = useT()
  const income = kind === 'income'
  const money = (v: number) => formatMoney(v, base, { signDisplay: 'never' })

  const delta = pctChange(flow.total, flow.prevTotal)
  // For money in, more is better; for money out, less is.
  const deltaGood = delta == null ? false : income ? delta >= 0 : delta <= 0

  const top = flow.slices.slice(0, TOP_N)
  const restTotal = flow.slices.slice(TOP_N).reduce((s, x) => s + x.total, 0)

  return (
    <Card className="flex flex-col p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground">
          <span
            className={cn(
              'flex h-5 w-5 items-center justify-center rounded-full',
              income ? 'bg-chip-green-bg text-chip-green-fg' : 'bg-chip-orange-bg text-chip-orange-fg',
            )}
          >
            {income ? <ArrowDownLeft className="h-3 w-3 stroke-[2.6]" /> : <ArrowUpRight className="h-3 w-3 stroke-[2.6]" />}
          </span>
          {t(income ? 'dash.moneyIn' : 'dash.moneyOut')}
        </p>
        <span className="shrink-0 text-[11px] font-semibold text-muted-foreground">{month}</span>
      </div>

      <p className="mt-2 font-numeric text-[22px] font-extrabold leading-none tracking-tight text-foreground">
        <AnimatedNumber value={flow.total} format={money} />
      </p>

      <p className="mt-1.5 h-4 text-[11px] font-semibold">
        {delta != null && (
          <>
            <span className={deltaGood ? 'text-positive' : 'text-negative'}>
              {delta >= 0 ? '▲' : '▼'} {Math.abs(delta).toFixed(0)}%
            </span>{' '}
            <span className="font-medium text-muted-foreground">{t('flow.vsLast')}</span>
          </>
        )}
      </p>

      {flow.slices.length === 0 ? (
        <p className="mt-3 text-xs font-medium text-muted-foreground">
          {t(income ? 'flow.emptyIn' : 'flow.emptyOut')}
        </p>
      ) : (
        <>
          {/* Proportions at a glance, before any reading happens. */}
          <div
            className="mt-3 flex h-1.5 gap-0.5 overflow-hidden rounded-full bg-surface-muted"
            role="presentation"
          >
            {flow.slices.map((s) => (
              <span
                key={s.id}
                className="h-full first:rounded-l-full last:rounded-r-full"
                style={{ width: `${Math.max(1, s.pct)}%`, backgroundColor: sliceColour(s.id, s.color) }}
              />
            ))}
          </div>

          <ul className="mt-3 space-y-1.5">
            {top.map((s) => (
              <li key={s.id} className="flex items-center gap-2">
                <span
                  aria-hidden
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: sliceColour(s.id, s.color) }}
                />
                <span className="min-w-0 flex-1 truncate text-xs font-semibold text-foreground">
                  {s.id === UNCATEGORIZED_ID ? t('flow.uncategorized') : s.name}
                </span>
                <span className="shrink-0 font-numeric text-xs font-bold text-muted-foreground">
                  {money(s.total)}
                </span>
              </li>
            ))}
            {restTotal > 0 && (
              <li className="flex items-center gap-2">
                <span aria-hidden className="h-2 w-2 shrink-0 rounded-full bg-border" />
                <span className="min-w-0 flex-1 truncate text-xs font-semibold text-muted-foreground">
                  {t('flow.otherCategories', { n: flow.slices.length - TOP_N })}
                </span>
                <span className="shrink-0 font-numeric text-xs font-bold text-muted-foreground">
                  {money(restTotal)}
                </span>
              </li>
            )}
          </ul>
        </>
      )}

      <Link
        to="/reports"
        className="mt-3 flex items-center justify-between gap-2 border-t border-border pt-2.5 text-[11px] font-semibold text-muted-foreground transition-colors hover:text-primary"
      >
        <span>{t('flow.count', { n: flow.count })}</span>
        <span className="text-primary">{t('dash.seeAll')}</span>
      </Link>
    </Card>
  )
}

/**
 * What the two cards add up to. Kept deliberately slim — it's the punchline of
 * the pair above it, not a third thing to study.
 */
export function NetStrip({ net, prevNet, base }: { net: number; prevNet: number; base: string }) {
  const { t } = useT()
  const delta = pctChange(net, prevNet)
  const positive = net >= 0

  return (
    <div className="card-surface flex items-center justify-between gap-3 rounded-[20px] px-4 py-3">
      <p className="text-xs font-bold text-muted-foreground">{t('flow.keptLabel')}</p>
      <div className="flex items-baseline gap-2">
        {delta != null && (
          <span className={cn('text-[11px] font-semibold', delta >= 0 ? 'text-positive' : 'text-negative')}>
            {delta >= 0 ? '▲' : '▼'} {Math.abs(delta).toFixed(0)}%
          </span>
        )}
        <p
          className={cn(
            'font-numeric text-lg font-extrabold tracking-tight',
            positive ? 'text-positive' : 'text-negative',
          )}
        >
          <AnimatedNumber
            value={net}
            format={(v) => formatMoney(v, base, { signDisplay: 'always' })}
          />
        </p>
      </div>
    </div>
  )
}
