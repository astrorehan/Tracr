import { useMemo, useState } from 'react'
import { Pencil, PiggyBank, Plus, Repeat, Target, Trash2 } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { PageHeader, Pill } from '@/components/ui/list'
import { CenterSpinner } from '@/components/ui/States'
import { useConfirm } from '@/components/ui/confirm-context'
import { StarterGuide } from '@/components/ui/StarterGuide'
import { CategoryIcon } from '@/features/categories/CategoryIcon'
import { useAuth } from '@/features/auth/useAuth'
import { useCategories } from '@/features/categories/api'
import { useTransactions } from '@/features/transactions/api'
import { useTransactionSplits } from '@/features/transactions/splits'
import { useBudgets, useDeleteBudget } from '@/features/budgets/api'
import { BudgetForm, type BudgetPreset } from '@/features/budgets/BudgetForm'
import {
  budgetStatus,
  PERIOD_LABEL,
  periodBounds,
  previousPeriodBounds,
  spentInPeriod,
  type BudgetStatus,
} from '@/features/budgets/progress'
import { indexById } from '@/lib/collections'
import { formatMoney } from '@/lib/money'
import { cn } from '@/lib/utils'
import type { Budget, Category } from '@/types/db'

export function BudgetsPage() {
  const { profile } = useAuth()
  const base = profile?.base_currency ?? 'IDR'

  const { data: budgets = [], isLoading: lb } = useBudgets()
  const { data: categories = [] } = useCategories()
  const del = useDeleteBudget()
  const confirm = useConfirm()

  const [editing, setEditing] = useState<Budget | null>(null)
  const [creating, setCreating] = useState(false)
  const [preset, setPreset] = useState<BudgetPreset | undefined>()

  function startTemplate(p: BudgetPreset) {
    setPreset(p)
    setEditing(null)
    setCreating(true)
  }

  const categoryMap = useMemo(() => indexById(categories), [categories])
  const childIdsByParent = useMemo(() => {
    const m = new Map<string, string[]>()
    for (const c of categories) {
      if (!c.parent_id) continue
      const arr = m.get(c.parent_id) ?? []
      arr.push(c.id)
      m.set(c.parent_id, arr)
    }
    return m
  }, [categories])

  // Pull enough history to cover the current (and previous, for rollover) period.
  const fromIso = useMemo(() => {
    if (!budgets.length) return undefined
    let earliest = Infinity
    for (const b of budgets) {
      const start = (b.rollover ? previousPeriodBounds(b.period) : periodBounds(b.period)).start.getTime()
      if (start < earliest) earliest = start
    }
    return new Date(earliest).toISOString()
  }, [budgets])

  const { data: transactions = [], isLoading: lt } = useTransactions({ from: fromIso, limit: 5000 })
  const { data: splitsByTx = {} } = useTransactionSplits()

  const rows = useMemo(() => {
    const now = new Date()
    const list = budgets.map((budget) => {
      const bounds = periodBounds(budget.period, now)
      const matchIds = budget.category_id
        ? new Set([budget.category_id, ...(childIdsByParent.get(budget.category_id) ?? [])])
        : null
      const spent = spentInPeriod(transactions, matchIds, bounds, budget.currency, splitsByTx)
      let carry = 0
      if (budget.rollover) {
        const prevSpent = spentInPeriod(
          transactions,
          matchIds,
          previousPeriodBounds(budget.period, now),
          budget.currency,
          splitsByTx,
        )
        carry = Math.max(0, budget.amount - prevSpent)
      }
      const status = budgetStatus(budget.amount, spent, bounds, carry, now)
      return { budget, status, category: budget.category_id ? categoryMap[budget.category_id] : null }
    })
    // Surface the most-used budgets first.
    return list.sort((a, b) => b.status.pct - a.status.pct)
  }, [budgets, transactions, childIdsByParent, categoryMap, splitsByTx])

  async function remove(b: Budget) {
    const name = b.category_id ? (categoryMap[b.category_id]?.name ?? 'this category') : 'overall spending'
    if (
      await confirm({
        title: `Delete this ${PERIOD_LABEL[b.period].toLowerCase()} budget?`,
        message: `The budget for ${name} will be removed. Your transactions stay untouched.`,
        tone: 'danger',
        confirmLabel: 'Delete',
      })
    )
      del.mutate(b.id)
  }

  const loading = lb || (budgets.length > 0 && lt)

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title="Budgets"
        action={
          budgets.length > 0 ? (
            <Pill variant="tint" icon={Plus} onClick={() => setCreating(true)}>
              New
            </Pill>
          ) : undefined
        }
      />

      {loading ? (
        <CenterSpinner />
      ) : budgets.length === 0 ? (
        <StarterGuide
          icon={<Target className="h-6 w-6" />}
          title="Tell your money where to go"
          intro="Set a spending limit and Tracr keeps a running tally against it."
          points={[
            {
              title: 'Pick a limit',
              body: 'Per category (like Food or Transport) or one overall cap on all spending.',
            },
            {
              title: 'Choose how often it resets',
              body: 'Weekly, monthly, or yearly — the bar refills each new period.',
            },
            {
              title: 'Watch the bar',
              body: 'It fills as you spend, warns near the limit, and can roll unused budget forward.',
            },
          ]}
          templates={[
            { label: 'Overall monthly limit', hint: 'One cap on all spending', onClick: () => startTemplate({ period: 'monthly' }) },
            { label: 'Groceries', hint: 'Monthly food budget', onClick: () => startTemplate({ period: 'monthly', categoryNames: ['Groceries', 'Food', 'Food & Drink', 'Groceries & Food'] }) },
            { label: 'Dining out', hint: 'Cafés & restaurants', onClick: () => startTemplate({ period: 'monthly', categoryNames: ['Dining', 'Dining out', 'Eating out', 'Restaurants'] }) },
            { label: 'Transport', hint: 'Fuel, rides, transit', onClick: () => startTemplate({ period: 'monthly', categoryNames: ['Transport', 'Transportation', 'Travel'] }) },
            { label: 'Shopping', hint: 'Monthly shopping cap', onClick: () => startTemplate({ period: 'monthly', categoryNames: ['Shopping'] }) },
            { label: 'Weekly spending cap', hint: 'Reset every week', onClick: () => startTemplate({ period: 'weekly' }) },
          ]}
        />
      ) : (
        <div className="space-y-3">
          {rows.map((row) => (
            <BudgetCard
              key={row.budget.id}
              budget={row.budget}
              status={row.status}
              category={row.category}
              onEdit={() => setEditing(row.budget)}
              onDelete={() => remove(row.budget)}
            />
          ))}
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

      {budgets.length > 0 && (
        <p className="px-1 text-center text-xs text-muted-foreground">
          Budgets track expenses in your base currency ({base}). A selected category includes its
          subcategories.
        </p>
      )}
    </div>
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
  const currency = budget.currency
  const name = category?.name ?? 'Overall spending'
  const accent = category?.color ?? 'var(--primary)'
  const barColor =
    status.level === 'over' ? 'var(--danger)' : status.level === 'near' ? 'var(--warning)' : accent
  const pctText = `${Math.round(status.pct)}%`
  const willExceed = status.level !== 'over' && status.projected > status.limit

  return (
    <Card className="space-y-3 p-4">
      <div className="flex items-center gap-3">
        <span
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
          style={{ backgroundColor: `${accent}1f`, color: accent }}
        >
          {category ? (
            <CategoryIcon name={category.icon} className="h-5 w-5" />
          ) : (
            <PiggyBank className="h-5 w-5" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-foreground">{name}</p>
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
            <span className="rounded-md bg-surface-muted px-1.5 py-0.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">
              {PERIOD_LABEL[budget.period]}
            </span>
            {budget.rollover && (
              <span className="inline-flex items-center gap-1 rounded-md bg-surface-muted px-1.5 py-0.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                <Repeat className="h-2.5 w-2.5" /> Rollover
                {status.carry > 0 ? ` +${formatMoney(status.carry, currency, { signDisplay: 'never' })}` : ''}
              </span>
            )}
          </div>
        </div>
        <div className="flex gap-1">
          <button
            onClick={onEdit}
            className="rounded-lg border border-transparent p-1.5 text-muted-foreground transition-colors hover:border-border hover:bg-surface-muted hover:text-foreground"
            aria-label={`Edit ${name} budget`}
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={onDelete}
            className="rounded-lg border border-transparent p-1.5 text-muted-foreground transition-colors hover:border-danger/10 hover:bg-danger/10 hover:text-danger"
            aria-label={`Delete ${name} budget`}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-surface-muted">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${Math.min(100, status.pct)}%`, backgroundColor: barColor }}
        />
      </div>

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
            {pctText}
          </p>
          <p className="text-xs font-medium text-muted-foreground">
            {status.remaining >= 0
              ? `${formatMoney(status.remaining, currency, { signDisplay: 'never' })} left`
              : `Over by ${formatMoney(-status.remaining, currency, { signDisplay: 'never' })}`}
          </p>
        </div>
      </div>

      {willExceed && (
        <p className="text-xs font-semibold text-warning">
          On track to spend {formatMoney(status.projected, currency, { signDisplay: 'never' })} —
          over budget.
        </p>
      )}
    </Card>
  )
}
