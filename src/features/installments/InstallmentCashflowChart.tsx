import { useMemo } from 'react'
import { addMonths, format } from 'date-fns'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { TrendingDown } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { formatMoney } from '@/lib/money'
import { dateLocale } from '@/i18n'
import { chartCursor, chartTooltipStyle } from '@/lib/chartTheme'
import type { Installment } from './types'

interface Props {
  installments: Installment[]
}

export function InstallmentCashflowChart({ installments }: Props) {
  const activeInstallments = useMemo(
    () => installments.filter((i) => i.status === 'active' && i.paid_months < i.tenor_months),
    [installments],
  )

  const { chartData, maxTenorLeft, currentMonthlyTotal } = useMemo(() => {
    if (activeInstallments.length === 0) {
      return { chartData: [], maxTenorLeft: 0, currentMonthlyTotal: 0 }
    }

    let maxLeft = 0
    let currentTotal = 0

    activeInstallments.forEach((inst) => {
      const left = inst.tenor_months - inst.paid_months
      if (left > maxLeft) maxLeft = left
      currentTotal += inst.monthly_amount
    })

    // Project for min 12 months up to max 24 months
    const horizon = Math.min(24, Math.max(12, maxLeft))
    const today = new Date()
    const data = []

    for (let m = 0; m < horizon; m++) {
      const futureDate = addMonths(today, m)
      const monthLabel = format(futureDate, "MMM ''yy", { locale: dateLocale() })

      let totalBurden = 0
      activeInstallments.forEach((inst) => {
        const remainingMonths = inst.tenor_months - inst.paid_months
        if (m < remainingMonths) {
          totalBurden += inst.monthly_amount
        }
      })

      data.push({
        month: monthLabel,
        burden: totalBurden,
        formattedBurden: formatMoney(totalBurden, 'IDR'),
      })
    }

    return { chartData: data, maxTenorLeft: maxLeft, currentMonthlyTotal: currentTotal }
  }, [activeInstallments])

  if (activeInstallments.length === 0) {
    return null
  }

  return (
    <Card className="p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-base font-bold text-foreground">
              Proyeksi Beban Cashflow Bulanan
            </h3>
            <span className="inline-flex items-center gap-1 rounded-full bg-cyan-500/10 px-2 py-0.5 text-xs font-bold text-cyan-600 dark:text-cyan-400">
              <TrendingDown className="h-3.5 w-3.5" />
              Estimasi Penurunan
            </span>
          </div>
          <p className="mt-0.5 text-xs font-medium text-muted-foreground">
            Grafik komitmen tagihan cicilan bulanan hingga {maxTenorLeft} bulan ke depan.
          </p>
        </div>

        <div className="text-right">
          <span className="text-[11px] font-semibold text-muted-foreground">Beban Saat Ini</span>
          <p className="font-numeric text-base font-extrabold text-cyan-600 dark:text-cyan-400">
            {formatMoney(currentMonthlyTotal, 'IDR')}/bln
          </p>
        </div>
      </div>

      <div className="h-56 w-full pt-2">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="cashflowGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.4} />
                <stop offset="95%" stopColor="#06b6d4" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(150, 150, 150, 0.15)" />
            <XAxis
              dataKey="month"
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 11, fill: 'currentColor', opacity: 0.6 }}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 11, fill: 'currentColor', opacity: 0.6 }}
              tickFormatter={(v) => (v === 0 ? '0' : `${Math.round(v / 1000000)}jt`)}
            />
            <Tooltip
              cursor={chartCursor}
              contentStyle={chartTooltipStyle}
              formatter={(val: unknown) => [
                formatMoney(Number(val) || 0, 'IDR'),
                'Total Tagihan Bulanan',
              ]}
              labelFormatter={(lbl) => `Bulan: ${lbl}`}
            />
            <Area
              type="monotone"
              dataKey="burden"
              stroke="#06b6d4"
              strokeWidth={2.5}
              fillOpacity={1}
              fill="url(#cashflowGradient)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </Card>
  )
}
