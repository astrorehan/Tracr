import { useMemo, useState } from 'react'
import { startOfMonth, startOfYear, subMonths, addMonths, addYears } from 'date-fns'
import { Store, TrendingUp } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { PageHeader } from '@/components/ui/list'
import { Segmented } from '@/components/ui/Segmented'
import { CenterSpinner } from '@/components/ui/States'
import { useAuth } from '@/features/auth/useAuth'
import { useActiveBook } from '@/features/books/useActiveBook'
import { formatMoney } from '@/lib/money'
import { cn } from '@/lib/utils'
import { useProfitData } from '@/features/profit/api'
import { computeProfit } from '@/features/profit/compute'

type PeriodKey = 'month' | 'last' | 'year'

/** [from, to) ISO bounds for a preset — `to` is exclusive (start of next period). */
function periodRange(key: PeriodKey): { from: string; to: string } {
  const now = new Date()
  if (key === 'last') {
    const start = startOfMonth(subMonths(now, 1))
    return { from: start.toISOString(), to: startOfMonth(now).toISOString() }
  }
  if (key === 'year') {
    const start = startOfYear(now)
    return { from: start.toISOString(), to: addYears(start, 1).toISOString() }
  }
  const start = startOfMonth(now)
  return { from: start.toISOString(), to: addMonths(start, 1).toISOString() }
}

export function ProfitPage() {
  const { profile } = useAuth()
  const base = profile?.base_currency ?? 'IDR'
  const { activeBook } = useActiveBook()

  const [period, setPeriod] = useState<PeriodKey>('month')
  const { from, to } = useMemo(() => periodRange(period), [period])
  const { data, isLoading } = useProfitData(from, to)

  const summary = useMemo(
    () => computeProfit(data?.lines ?? [], data?.expenses ?? []),
    [data],
  )

  // Guard: the profit report only makes sense inside a business book.
  if (activeBook && activeBook.type !== 'business') {
    return (
      <div className="mx-auto max-w-3xl">
        <PageHeader title="Profit" />
        <Card className="flex flex-col items-center gap-3 p-8 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-soft text-primary">
            <Store className="h-6 w-6" />
          </span>
          <p className="text-sm font-medium text-muted-foreground">
            The profit report (laba-rugi) is part of a{' '}
            <span className="font-bold text-foreground">business</span> book. Switch to or create a
            business book to see what you earn.
          </p>
        </Card>
      </div>
    )
  }

  const hasData = summary.penjualan > 0 || summary.biaya > 0

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title="Laba-Rugi" subtitle="What you sold, what it cost, what you kept." />

      <Segmented
        value={period}
        onChange={setPeriod}
        options={[
          { value: 'month', label: 'This month' },
          { value: 'last', label: 'Last month' },
          { value: 'year', label: 'This year' },
        ]}
        aria-label="Period"
      />

      {isLoading ? (
        <CenterSpinner />
      ) : !hasData ? (
        <Card className="flex flex-col items-center gap-3 p-8 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-soft text-primary">
            <TrendingUp className="h-6 w-6" />
          </span>
          <p className="text-sm font-medium text-muted-foreground">
            No sales or costs in this period yet. Record a sale to see your profit here.
          </p>
        </Card>
      ) : (
        <>
          {/* P&L card */}
          <Card className="divide-y divide-border p-0">
            <PLRow label="Penjualan" hint="Sales / omzet" value={summary.penjualan} currency={base} />
            <PLRow
              label="Modal terjual"
              hint="Cost of goods sold"
              value={-summary.cogs}
              currency={base}
            />
            <PLRow
              label="Laba kotor"
              hint="Gross profit"
              value={summary.labaKotor}
              currency={base}
              strong
              tone={summary.labaKotor >= 0 ? 'positive' : 'danger'}
            />
            <PLRow
              label="Biaya operasional"
              hint="Rent, wages, electricity…"
              value={-summary.biaya}
              currency={base}
            />
            <PLRow
              label="Laba bersih"
              hint="Net profit — what you keep"
              value={summary.labaBersih}
              currency={base}
              strong
              tone={summary.labaBersih >= 0 ? 'positive' : 'danger'}
            />
          </Card>

          {/* Top products */}
          {summary.topProducts.length > 0 && (
            <div className="space-y-3">
              <h2 className="section-head px-1 text-[17px] text-foreground">Top produk</h2>
              <Card className="divide-y divide-border p-0">
                {summary.topProducts.slice(0, 10).map((p) => (
                  <div key={p.key} className="flex items-center gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-foreground">{p.name}</p>
                      <p className="text-xs font-semibold text-muted-foreground">
                        {p.qty} sold · profit{' '}
                        <span className={p.profit >= 0 ? 'text-positive' : 'text-danger'}>
                          {formatMoney(p.profit, base, { signDisplay: 'never' })}
                        </span>
                      </p>
                    </div>
                    <span className="font-numeric text-sm font-bold text-foreground">
                      {formatMoney(p.revenue, base, { signDisplay: 'never' })}
                    </span>
                  </div>
                ))}
              </Card>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function PLRow({
  label,
  hint,
  value,
  currency,
  strong,
  tone,
}: {
  label: string
  hint: string
  value: number
  currency: string
  strong?: boolean
  tone?: 'positive' | 'danger'
}) {
  return (
    <div className="flex items-center justify-between px-4 py-3">
      <div className="min-w-0">
        <p className={cn('text-sm text-foreground', strong ? 'font-bold' : 'font-semibold')}>{label}</p>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>
      <span
        className={cn(
          'font-numeric shrink-0',
          strong ? 'text-lg font-bold' : 'text-sm font-semibold',
          tone === 'positive'
            ? 'text-positive'
            : tone === 'danger'
              ? 'text-danger'
              : value < 0
                ? 'text-muted-foreground'
                : 'text-foreground',
        )}
      >
        {formatMoney(value, currency)}
      </span>
    </div>
  )
}
