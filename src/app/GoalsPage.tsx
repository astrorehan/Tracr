import { useMemo, useState } from 'react'
import { format } from 'date-fns'
import { Archive, Check, PiggyBank, Plus, Pencil, Trash2 } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { PageHeader, Pill } from '@/components/ui/list'
import { CenterSpinner } from '@/components/ui/States'
import { useConfirm } from '@/components/ui/confirm-context'
import { StarterGuide } from '@/components/ui/StarterGuide'
import { useGoals, useGoalContributions, useDeleteGoal, useUpdateGoal } from '@/features/goals/api'
import { GoalForm, type GoalPreset } from '@/features/goals/GoalForm'
import { ContributeForm } from '@/features/goals/ContributeForm'
import { daysToTarget, goalProgress } from '@/features/goals/progress'
import { formatMoney } from '@/lib/money'
import { cn } from '@/lib/utils'
import type { GoalContribution, SavingsGoal } from '@/types/db'

export function GoalsPage() {
  const { data: goals = [], isLoading } = useGoals()
  const { data: contribByGoal = {} } = useGoalContributions()

  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<SavingsGoal | null>(null)
  const [contributing, setContributing] = useState<SavingsGoal | null>(null)
  const [preset, setPreset] = useState<GoalPreset | undefined>()

  function startTemplate(p: GoalPreset) {
    setPreset(p)
    setEditing(null)
    setCreating(true)
  }

  const { active, archived } = useMemo(() => {
    const active = goals.filter((g) => !g.is_archived)
    const archived = goals.filter((g) => g.is_archived)
    return { active, archived }
  }, [goals])

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title="Savings goals"
        action={
          goals.length > 0 ? (
            <Pill variant="tint" icon={Plus} onClick={() => setCreating(true)}>
              New
            </Pill>
          ) : undefined
        }
      />

      {isLoading ? (
        <CenterSpinner />
      ) : goals.length === 0 ? (
        <StarterGuide
          icon={<PiggyBank className="h-6 w-6" />}
          title="Save with a purpose"
          intro="Set a target and watch your savings grow toward it."
          points={[
            {
              title: 'Name your goal & set a target',
              body: 'Pick what you’re saving for and how much you need.',
            },
            {
              title: 'Add money as you go',
              body: 'Each top-up is logged here — it never touches your real account balances.',
            },
            {
              title: 'Watch the pace',
              body: 'Tracr shows progress, what’s left, and roughly when you’ll get there.',
            },
          ]}
          templates={[
            { label: 'Emergency fund', hint: '3–6 months of expenses', onClick: () => startTemplate({ name: 'Emergency fund' }) },
            { label: 'Vacation', hint: 'A trip to look forward to', onClick: () => startTemplate({ name: 'Vacation' }) },
            { label: 'New phone', hint: 'Save up, skip the credit', onClick: () => startTemplate({ name: 'New phone' }) },
            { label: 'New laptop', hint: 'For work or study', onClick: () => startTemplate({ name: 'New laptop' }) },
            { label: 'Car', hint: 'Down payment or full price', onClick: () => startTemplate({ name: 'Car' }) },
            { label: 'Home', hint: 'A down-payment fund', onClick: () => startTemplate({ name: 'Home' }) },
          ]}
        />
      ) : (
        <div className="space-y-6">
          <div className="space-y-3">
            {active.map((goal) => (
              <GoalCard
                key={goal.id}
                goal={goal}
                contributions={contribByGoal[goal.id] ?? []}
                onContribute={() => setContributing(goal)}
                onEdit={() => setEditing(goal)}
              />
            ))}
          </div>

          {archived.length > 0 && (
            <div className="space-y-3">
              <h2 className="section-head px-1 text-[17px] text-foreground">Archived</h2>
              {archived.map((goal) => (
                <GoalCard
                  key={goal.id}
                  goal={goal}
                  contributions={contribByGoal[goal.id] ?? []}
                  onContribute={() => setContributing(goal)}
                  onEdit={() => setEditing(goal)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      <GoalForm
        open={creating || Boolean(editing)}
        onClose={() => {
          setCreating(false)
          setEditing(null)
          setPreset(undefined)
        }}
        goal={editing}
        preset={preset}
      />
      <ContributeForm open={Boolean(contributing)} onClose={() => setContributing(null)} goal={contributing} />
    </div>
  )
}

function GoalCard({
  goal,
  contributions,
  onContribute,
  onEdit,
}: {
  goal: SavingsGoal
  contributions: GoalContribution[]
  onContribute: () => void
  onEdit: () => void
}) {
  const update = useUpdateGoal()
  const del = useDeleteGoal()
  const confirm = useConfirm()

  const p = useMemo(() => goalProgress(goal.target_amount, contributions), [goal.target_amount, contributions])
  const accent = goal.color ?? 'var(--primary)'
  const days = daysToTarget(goal.target_date)
  const busy = update.isPending || del.isPending

  async function remove() {
    if (
      await confirm({
        title: `Delete "${goal.name}"?`,
        message: 'Its contribution history is removed too. This cannot be undone.',
        tone: 'danger',
        confirmLabel: 'Delete',
      })
    )
      del.mutate(goal.id)
  }

  return (
    <Card className="space-y-3 p-4">
      <div className="flex items-center gap-3">
        <span
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
          style={{ backgroundColor: `${accent}1f`, color: accent }}
        >
          <PiggyBank className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 truncate text-sm font-bold text-foreground">
            {goal.name}
            {p.complete && (
              <span className="inline-flex items-center gap-0.5 rounded-md bg-positive/10 px-1.5 py-0.5 text-xs font-bold uppercase text-positive">
                <Check className="h-2.5 w-2.5" /> Reached
              </span>
            )}
          </p>
          <p className="truncate text-xs font-semibold text-muted-foreground">
            {formatMoney(p.saved, goal.currency, { signDisplay: 'never' })} of{' '}
            {formatMoney(goal.target_amount, goal.currency, { signDisplay: 'never' })}
          </p>
        </div>
        <span className="font-numeric text-sm font-bold" style={{ color: accent }}>
          {Math.round(p.pct)}%
        </span>
      </div>

      <div className="h-2.5 w-full overflow-hidden rounded-full bg-surface-muted">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${p.pct}%`, backgroundColor: accent }}
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs font-medium text-muted-foreground">
        <span>
          {p.complete
            ? 'Goal reached 🎉'
            : `${formatMoney(p.remaining, goal.currency, { signDisplay: 'never' })} to go`}
        </span>
        <span className="flex items-center gap-2">
          {p.savedThisMonth !== 0 && (
            <span>
              {p.savedThisMonth > 0 ? '+' : ''}
              {formatMoney(p.savedThisMonth, goal.currency, { signDisplay: 'never' })} this month
            </span>
          )}
          {goal.target_date && days !== null && (
            <span className={cn(days < 0 && !p.complete && 'text-danger')}>
              {format(new Date(goal.target_date), 'd MMM yyyy')}
              {!p.complete && ` · ${days < 0 ? `${Math.abs(days)}d late` : `${days}d left`}`}
            </span>
          )}
          {!goal.target_date && !p.complete && p.etaDate && (
            <span>~{format(p.etaDate, 'MMM yyyy')} at this pace</span>
          )}
        </span>
      </div>

      <div className="flex items-center gap-2 pt-1">
        <Button size="sm" className="flex-1" onClick={onContribute} disabled={busy}>
          <Plus className="h-3.5 w-3.5" /> Add money
        </Button>
        <button
          onClick={() => update.mutate({ id: goal.id, patch: { is_archived: !goal.is_archived } })}
          disabled={busy}
          className="rounded-lg border border-transparent p-1.5 text-muted-foreground transition-colors hover:border-border hover:bg-surface-muted hover:text-foreground"
          aria-label={goal.is_archived ? 'Unarchive goal' : 'Archive goal'}
          title={goal.is_archived ? 'Unarchive' : 'Archive'}
        >
          <Archive className="h-4 w-4" />
        </button>
        <button
          onClick={onEdit}
          disabled={busy}
          className="rounded-lg border border-transparent p-1.5 text-muted-foreground transition-colors hover:border-border hover:bg-surface-muted hover:text-foreground"
          aria-label={`Edit ${goal.name}`}
        >
          <Pencil className="h-4 w-4" />
        </button>
        <button
          onClick={remove}
          disabled={busy}
          className="rounded-lg border border-transparent p-1.5 text-muted-foreground transition-colors hover:border-danger/10 hover:bg-danger/10 hover:text-danger"
          aria-label={`Delete ${goal.name}`}
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </Card>
  )
}
