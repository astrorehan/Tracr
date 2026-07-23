import { useMemo, useState } from 'react'
import { format } from 'date-fns'
import { Archive, Check, Pencil, PiggyBank, Plus, Sparkles, Trash2 } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { CenterSpinner } from '@/components/ui/States'
import { useConfirm } from '@/components/ui/confirm-context'
import { useT } from '@/features/settings/language-context'
import { useGoals, useGoalContributions, useDeleteGoal, useUpdateGoal } from '@/features/goals/api'
import { GoalForm, type GoalPreset } from '@/features/goals/GoalForm'
import { ContributeForm } from '@/features/goals/ContributeForm'
import { daysToTarget, goalProgress } from '@/features/goals/progress'
import { dateLocale, type MsgKey } from '@/i18n'
import { formatMoney } from '@/lib/money'
import { cn } from '@/lib/utils'
import type { GoalContribution, SavingsGoal } from '@/types/db'
import { EmptyPreview, ProgressBar, SectionHeader } from './parts'

type Translate = (key: MsgKey, vars?: Record<string, string | number>) => string

export function GoalSection() {
  const { t } = useT()
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
    <section id="nabung" className="scroll-mt-6 space-y-3.5">
      <SectionHeader
        icon={PiggyBank}
        color="violet"
        title={t('nav.goals')}
        count={goals.length}
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
      ) : goals.length === 0 ? (
        <EmptyPreview
          blurb={t('planning.goal.empty')}
          ctaLabel={t('planning.goal.cta')}
          onCreate={() => setCreating(true)}
          templates={[
            { label: t('planning.tpl.emergency'), onClick: () => startTemplate({ name: t('planning.tpl.emergency') }) },
            { label: t('planning.tpl.vacation'), onClick: () => startTemplate({ name: t('planning.tpl.vacation') }) },
            { label: t('planning.tpl.phone'), onClick: () => startTemplate({ name: t('planning.tpl.phone') }) },
            { label: t('planning.tpl.car'), onClick: () => startTemplate({ name: t('planning.tpl.car') }) },
          ]}
          sample={<SampleGoal t={t} />}
        />
      ) : (
        <div className="space-y-5">
          <div className="space-y-3">
            {active.map((goal, i) => (
              <div key={goal.id} className={cn('animate-rise', i < 5 && `stagger-${i + 1}`)}>
                <GoalCard
                  goal={goal}
                  contributions={contribByGoal[goal.id] ?? []}
                  onContribute={() => setContributing(goal)}
                  onEdit={() => setEditing(goal)}
                />
              </div>
            ))}
          </div>

          {archived.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 px-1">
                <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground" />
                <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{t('planning.goal.archived')}</span>
                <span className="font-numeric text-xs font-bold text-muted-foreground">{archived.length}</span>
              </div>
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
    </section>
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
  const { t } = useT()
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
        title: t('planning.goal.deleteTitle', { name: goal.name }),
        message: t('planning.goal.deleteMsg'),
        tone: 'danger',
        confirmLabel: t('planning.common.delete'),
      })
    )
      del.mutate(goal.id)
  }

  return (
    <Card hoverable className="space-y-3 p-4">
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
                <Check className="h-2.5 w-2.5" /> {t('planning.goal.reached')}
              </span>
            )}
          </p>
          <p className="truncate text-xs font-semibold text-muted-foreground">
            {t('planning.goal.of', {
              saved: formatMoney(p.saved, goal.currency, { signDisplay: 'never' }),
              target: formatMoney(goal.target_amount, goal.currency, { signDisplay: 'never' }),
            })}
          </p>
        </div>
        <span className="font-numeric text-sm font-bold" style={{ color: accent }}>
          {Math.round(p.pct)}%
        </span>
      </div>

      <ProgressBar pct={p.pct} color={accent} />

      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs font-medium text-muted-foreground">
        <span>
          {p.complete
            ? t('planning.goal.reachedFull')
            : t('planning.goal.toGo', { amount: formatMoney(p.remaining, goal.currency, { signDisplay: 'never' }) })}
        </span>
        <span className="flex items-center gap-2">
          {p.savedThisMonth !== 0 && (
            <span>
              {t('planning.goal.thisMonth', {
                amount: `${p.savedThisMonth > 0 ? '+' : ''}${formatMoney(p.savedThisMonth, goal.currency, { signDisplay: 'never' })}`,
              })}
            </span>
          )}
          {goal.target_date && days !== null && (
            <span className={cn(days < 0 && !p.complete && 'text-danger')}>
              {format(new Date(goal.target_date), 'd MMM yyyy', { locale: dateLocale() })}
              {!p.complete &&
                ` · ${days < 0 ? t('planning.goal.late', { n: Math.abs(days) }) : t('planning.goal.leftDays', { n: days })}`}
            </span>
          )}
          {!goal.target_date && !p.complete && p.etaDate && (
            <span>{t('planning.goal.pace', { month: format(p.etaDate, 'MMM yyyy', { locale: dateLocale() }) })}</span>
          )}
        </span>
      </div>

      <div className="flex items-center gap-2 pt-1">
        <Button size="sm" className="flex-1" onClick={onContribute} disabled={busy}>
          <Plus className="h-3.5 w-3.5" /> {t('planning.goal.addMoney')}
        </Button>
        <button
          onClick={() => update.mutate({ id: goal.id, patch: { is_archived: !goal.is_archived } })}
          disabled={busy}
          className="rounded-lg border border-transparent p-1.5 text-muted-foreground transition-colors hover:border-border hover:bg-surface-muted hover:text-foreground"
          aria-label={goal.is_archived ? t('planning.goal.unarchive') : t('planning.goal.archive')}
          title={goal.is_archived ? t('planning.goal.unarchive') : t('planning.goal.archive')}
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

/** Static, believable stand-in shown (faded) in the empty state. */
function SampleGoal({ t }: { t: Translate }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-chip-violet-bg text-chip-violet-fg">
          <Sparkles className="h-5 w-5" />
        </span>
        <div className="flex-1">
          <p className="text-sm font-bold text-foreground">{t('planning.tpl.emergency')}</p>
          <p className="text-xs font-semibold text-muted-foreground">
            {t('planning.goal.of', { saved: 'Rp 6.000.000', target: 'Rp 15.000.000' })}
          </p>
        </div>
        <span className="font-numeric text-sm font-bold text-chip-violet-fg">40%</span>
      </div>
      <ProgressBar pct={40} color="var(--chip-violet-fg)" />
    </div>
  )
}
