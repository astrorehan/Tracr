import { useMemo, useState } from 'react'
import { Pencil, PiggyBank, Repeat, Target, Trash2 } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { CenterSpinner } from '@/components/ui/States'
import { useConfirm } from '@/components/ui/confirm-context'
import { CategoryIcon } from '@/features/categories/CategoryIcon'
import { useCategories } from '@/features/categories/api'
import { useAuth } from '@/features/auth/useAuth'
import { useT } from '@/features/settings/language-context'
import { useDeleteBudget } from '@/features/budgets/api'
import { BudgetForm, type BudgetPreset } from '@/features/budgets/BudgetForm'
import { type BudgetStatus } from '@/features/budgets/progress'
import { useBudgetStatuses } from '@/features/budgets/useBudgetStatuses'
import type { MsgKey, TVars } from '@/i18n'
import { indexById } from '@/lib/collections'
import { formatMoney } from '@/lib/money'
import { cn } from '@/lib/utils'
import type { Budget, Category } from '@/types/db'
import { periodLabel } from './format'
import { EmptyPreview, ProgressBar, SectionHeader } from './parts'

type Translate = (key: MsgKey, vars?: TVars) => string

export function BudgetSection() {
  const { t } = useT()
  const { profile } = useAuth()
  const base = profile?.base_currency ?? 'IDR'
  const { items, isLoading } = useBudgetStatuses()
  const { data: categories = [] } = useCategories()
  const del = useDeleteBudget()
  const confirm = useConfirm()

  const categoryMap = useMemo(() => indexById(categories), [categories])

  const [editing, setEditing] = useState<Budget | null>(null)
  const [creating, setCreating] = useState(false)
  const [preset, setPreset] = useState<BudgetPreset | undefined>()

  function startTemplate(p: BudgetPreset) {
    setPreset(p)
    setEditing(null)
    setCreating(true)
  }

  const rows = useMemo(() => [...items].sort((a, b) => b.status.pct - a.status.pct), [items])

  async function remove(b: Budget, label: string) {
    if (
      await confirm({
        title: t('planning.budget.deleteTitle', { period: periodLabel(t, b.period).toLowerCase() }),
        message: t('planning.budget.deleteMsg', { name: label }),
        tone: 'danger',
        confirmLabel: t('planning.common.delete'),
      })
    )
      del.mutate(b.id)
  }

  return (
    <section id="anggaran" className="scroll-mt-6 space-y-3.5">
      <SectionHeader
        icon={Target}
        color="orange"
        title={t('nav.budgets')}
        count={items.length}
        addLabel={t('planning.add')}
        onAdd={() => {
          setPreset(undefined)
          setEditing(null)
          setCreating(true)
        }}
      />

      {isLoading ? (
        <Card className="grid place-items-center py-10">
          <CenterSpinner />
        </Card>
      ) : items.length === 0 ? (
        <EmptyPreview
          blurb={t('planning.budget.empty')}
          ctaLabel={t('planning.budget.cta')}
          onCreate={() => setCreating(true)}
          templates={[
            { label: t('planning.budget.overall'), onClick: () => startTemplate({ period: 'monthly' }) },
            { label: t('planning.tpl.groceries'), onClick: () => startTemplate({ period: 'monthly', categoryNames: ['Groceries', 'Food', 'Food & Drink'] }) },
            { label: t('planning.tpl.dining'), onClick: () => startTemplate({ period: 'monthly', categoryNames: ['Dining', 'Dining out', 'Restaurants'] }) },
            { label: t('planning.tpl.transport'), onClick: () => startTemplate({ period: 'monthly', categoryNames: ['Transport', 'Transportation', 'Travel'] }) },
          ]}
          sample={<SampleBudget base={base} t={t} />}
        />
      ) : (
        <div className="space-y-3">
          {rows.map((row, i) => {
            const category = row.budget.category_id ? categoryMap[row.budget.category_id] ?? null : null
            return (
              <div key={row.budget.id} className={cn('animate-rise', i < 5 && `stagger-${i + 1}`)}>
                <BudgetCard
                  budget={row.budget}
                  status={row.status}
                  category={category}
                  onEdit={() => setEditing(row.budget)}
                  onDelete={() => remove(row.budget, category?.name ?? 'overall spending')}
                />
              </div>
            )
          })}
        </div>
      )}

      <BudgetForm
        open={creating || Boolean(editing)}
        onClose={() => {
          setCreating(false)
          setEditing(null)
          setPreset(undefined)
        }}
        budget={editing}
        preset={preset}
      />
    </section>
  )
}

function BudgetCard({
  budget,
  status,
  category,
  onEdit,
  onDelete,
}: {
  budget: Budget
  status: BudgetStatus
  category: Category | null
  onEdit: () => void
  onDelete: () => void
}) {
  const { t } = useT()
  const currency = budget.currency
  const label = category?.name ?? t('planning.budget.overall')
  const accent = category?.color ?? 'var(--primary)'
  const barColor =
    status.level === 'over' ? 'var(--danger)' : status.level === 'near' ? 'var(--warning)' : accent
  const willExceed = status.level !== 'over' && status.projected > status.limit

  return (
    <Card hoverable className="space-y-3 p-4">
      <div className="flex items-center gap-3">
        <span
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
          style={{ backgroundColor: `${accent}1f`, color: accent }}
        >
          {category ? <CategoryIcon name={category.icon} className="h-5 w-5" /> : <PiggyBank className="h-5 w-5" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-foreground">{label}</p>
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
            <span className="rounded-md bg-surface-muted px-1.5 py-0.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">
              {periodLabel(t, budget.period)}
            </span>
            {budget.rollover && (
              <span className="inline-flex items-center gap-1 rounded-md bg-surface-muted px-1.5 py-0.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                <Repeat className="h-2.5 w-2.5" /> {t('planning.budget.rollover')}
                {status.carry > 0 ? ` +${formatMoney(status.carry, currency, { signDisplay: 'never' })}` : ''}
              </span>
            )}
          </div>
        </div>
        <div className="flex gap-1">
          <button
            onClick={onEdit}
            className="rounded-lg border border-transparent p-1.5 text-muted-foreground transition-colors hover:border-border hover:bg-surface-muted hover:text-foreground"
            aria-label={`Edit ${label} budget`}
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={onDelete}
            className="rounded-lg border border-transparent p-1.5 text-muted-foreground transition-colors hover:border-danger/10 hover:bg-danger/10 hover:text-danger"
            aria-label={`Delete ${label} budget`}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <ProgressBar pct={status.pct} color={barColor} />

      <div className="flex items-end justify-between">
        <p className="font-numeric text-sm font-bold text-foreground">
          {formatMoney(status.spent, currency, { signDisplay: 'never' })}
          <span className="font-semibold text-muted-foreground">
            {' / '}
            {formatMoney(status.limit, currency, { signDisplay: 'never' })}
          </span>
        </p>
        <div className="text-right">
          <p
            className={cn(
              'font-numeric text-sm font-bold',
              status.level === 'over'
                ? 'text-danger'
                : status.level === 'near'
                  ? 'text-warning'
                  : 'text-positive',
            )}
          >
            {`${Math.round(status.pct)}%`}
          </p>
          <p className="text-xs font-medium text-muted-foreground">
            {status.remaining >= 0
              ? t('planning.budget.left', { amount: formatMoney(status.remaining, currency, { signDisplay: 'never' }) })
              : t('planning.budget.over', { amount: formatMoney(-status.remaining, currency, { signDisplay: 'never' }) })}
          </p>
        </div>
      </div>

      {willExceed && (
        <p className="text-xs font-semibold text-warning">
          {t('planning.budget.projected', { amount: formatMoney(status.projected, currency, { signDisplay: 'never' }) })}
        </p>
      )}
    </Card>
  )
}

/** Static, believable stand-in shown (faded) in the empty state. */
function SampleBudget({ base, t }: { base: string; t: Translate }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-warning/15 text-warning">
          <Target className="h-5 w-5" />
        </span>
        <div className="flex-1">
          <p className="text-sm font-bold text-foreground">{t('planning.tpl.groceries')}</p>
          <span className="rounded-md bg-surface-muted px-1.5 py-0.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">
            {t('planning.period.monthly')}
          </span>
        </div>
      </div>
      <ProgressBar pct={72} color="var(--warning)" />
      <div className="flex items-end justify-between">
        <p className="font-numeric text-sm font-bold text-foreground">
          {formatMoney(1_440_000, base, { signDisplay: 'never' })}
          <span className="font-semibold text-muted-foreground"> / {formatMoney(2_000_000, base, { signDisplay: 'never' })}</span>
        </p>
        <p className="font-numeric text-sm font-bold text-warning">72%</p>
      </div>
    </div>
  )
}
