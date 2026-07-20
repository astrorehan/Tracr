import { TrendingDown } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { AnimatedNumber } from '@/components/ui/AnimatedNumber'
import { formatMoney } from '@/lib/money'
import { useT } from '@/features/settings/language-context'
import { cn } from '@/lib/utils'
import type { MonthEndForecast } from './health'

/**
 * "Where's this heading?" — spendable cash projected to month end at the
 * steady 90-day burn rate, plus whatever's still due to arrive or go out.
 *
 * Renders nothing until the burn rate has enough history to trust — a
 * forecast built on three days of data would be a guess wearing a confident
 * font, and WalletScoreCard already tells the runway story for thin books.
 */
export function ForecastCard({
  forecast,
  base,
}: {
  forecast: MonthEndForecast & { confident: boolean }
  base: string
}) {
  const { t } = useT()
  if (!forecast.confident) return null

  const { current, projected, shortfall } = forecast
  const money = (v: number) => formatMoney(v, base, { signDisplay: 'never' })
  const delta = projected - current

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between gap-3">
        <p className="flex items-center gap-1.5 text-sm font-semibold text-muted-foreground">
          <TrendingDown className={cn('h-4 w-4', shortfall ? 'text-warning' : 'rotate-180')} />
          {t('forecast.title')}
        </p>
        {shortfall && (
          <span className="shrink-0 rounded-full bg-warning/12 px-2.5 py-1 text-xs font-bold text-warning">
            {t('forecast.shortBadge')}
          </span>
        )}
      </div>

      <p
        className={cn(
          'mt-1.5 font-numeric text-[26px] font-extrabold leading-none tracking-tight',
          shortfall ? 'text-warning' : 'text-foreground',
        )}
      >
        {shortfall ? `−${money(Math.abs(projected))}` : <AnimatedNumber value={projected} format={money} />}
      </p>

      <p className="mt-2 text-xs font-medium leading-relaxed text-muted-foreground">
        {shortfall
          ? t('forecast.shortBody', { amount: money(Math.abs(projected)) })
          : delta >= 0
            ? t('forecast.upBody', { amount: money(current) })
            : t('forecast.downBody', { amount: money(current) })}
      </p>
    </Card>
  )
}
