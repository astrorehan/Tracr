import { X, Check } from 'lucide-react'
import { useT } from '@/features/settings/language-context'

export function BeforeAfterComparison() {
  const { t } = useT()

  const comparisonRows = [
    {
      old: t('land.compRow1Old'),
      new: t('land.compRow1New'),
    },
    {
      old: t('land.compRow2Old'),
      new: t('land.compRow2New'),
    },
    {
      old: t('land.compRow3Old'),
      new: t('land.compRow3New'),
    },
    {
      old: t('land.compRow4Old'),
      new: t('land.compRow4New'),
    },
  ]

  return (
    <section className="border-t border-border bg-surface/50 py-20 sm:py-24">
      <div className="mx-auto max-w-5xl px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="font-display text-3xl font-extrabold tracking-tight sm:text-4xl">
            {t('land.compTitle')}
          </h2>
          <p className="mt-3 text-base font-medium leading-relaxed text-muted-foreground">
            {t('land.compSub')}
          </p>
        </div>

        {/* Comparison Table / Grid */}
        <div className="mt-12 overflow-hidden rounded-3xl border border-border shadow-xl bg-background">
          {/* Table Header */}
          <div className="grid grid-cols-2 border-b border-border bg-muted/40 text-center font-bold text-sm sm:text-base">
            <div className="p-4 text-rose-600 dark:text-rose-400 border-r border-border flex items-center justify-center gap-1.5">
              <span>{t('land.compOldHead')}</span>
            </div>
            <div className="p-4 text-emerald-600 dark:text-emerald-400 flex items-center justify-center gap-1.5">
              <span>{t('land.compNewHead')}</span>
            </div>
          </div>

          {/* Rows */}
          <div className="divide-y divide-border">
            {comparisonRows.map((row, idx) => (
              <div key={idx} className="grid grid-cols-2 text-xs sm:text-sm font-medium">
                {/* Old way */}
                <div className="p-4 sm:p-5 border-r border-border bg-rose-500/5 text-muted-foreground flex items-center gap-2.5">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-rose-500/20 text-rose-600 dark:text-rose-400">
                    <X className="h-3 w-3" />
                  </span>
                  <span>{row.old}</span>
                </div>

                {/* Tracr way */}
                <div className="p-4 sm:p-5 bg-emerald-500/5 text-foreground font-semibold flex items-center gap-2.5">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-600 dark:text-emerald-400">
                    <Check className="h-3 w-3" />
                  </span>
                  <span>{row.new}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
