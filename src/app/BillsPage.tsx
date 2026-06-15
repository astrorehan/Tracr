import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { format } from 'date-fns'
import {
  ArrowLeft,
  Check,
  Pause,
  Pencil,
  Play,
  Plus,
  Receipt,
  SkipForward,
  Trash2,
  Zap,
} from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { CenterSpinner, EmptyState } from '@/components/ui/States'
import { useConfirm } from '@/components/ui/confirm'
import { CategoryIcon } from '@/features/categories/CategoryIcon'
import { useAccounts } from '@/features/accounts/api'
import { useCategories } from '@/features/categories/api'
import {
  useDeleteRecurring,
  useMarkRecurringPaid,
  useRecurring,
  useSkipRecurring,
  useUpdateRecurring,
} from '@/features/recurring/api'
import { RecurringForm } from '@/features/recurring/RecurringForm'
import { dueInfo, dueText, frequencyText, type DueStatus } from '@/features/recurring/schedule'
import { indexById } from '@/lib/collections'
import { formatMoney } from '@/lib/money'
import { cn } from '@/lib/utils'
import type { Account, Category, RecurringTransaction } from '@/types/db'

const STATUS_ORDER: DueStatus[] = ['overdue', 'due_soon', 'upcoming']
const STATUS_TITLE: Record<DueStatus, string> = {
  overdue: 'Overdue',
  due_soon: 'Due soon',
  upcoming: 'Upcoming',
}

export function BillsPage() {
  const { data: recurring = [], isLoading } = useRecurring()
  const { data: accounts = [] } = useAccounts(true)
  const { data: categories = [] } = useCategories()

  const accountMap = useMemo(() => indexById(accounts), [accounts])
  const categoryMap = useMemo(() => indexById(categories), [categories])

  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<RecurringTransaction | null>(null)

  const { active, paused } = useMemo(() => {
    const active = recurring.filter((r) => r.is_active)
    const paused = recurring.filter((r) => !r.is_active)
    return { active, paused }
  }, [recurring])

  const grouped = useMemo(() => {
    const today = new Date()
    const map: Record<DueStatus, RecurringTransaction[]> = { overdue: [], due_soon: [], upcoming: [] }
    for (const r of active) map[dueInfo(r.next_due, today).status].push(r)
    return map
  }, [active])

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center gap-3 py-1">
        <Link
          to="/settings"
          className="rounded-xl border border-transparent p-2 text-muted-foreground transition-all hover:border-border hover:bg-surface-muted hover:text-foreground"
          aria-label="Back to settings"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="flex-1 text-2xl font-extrabold tracking-tight lg:text-3xl">
          Bills &amp; subscriptions
        </h1>
        {recurring.length > 0 && (
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" /> New
          </Button>
        )}
      </div>

      {isLoading ? (
        <CenterSpinner />
      ) : recurring.length === 0 ? (
        <EmptyState
          icon={<Receipt className="h-8 w-8" />}
          title="No bills yet"
          description="Add recurring bills, subscriptions or income. We’ll remind you when they’re due — tap Mark paid to log it, or turn on Auto-post to have it logged for you."
          action={
            <Button size="sm" onClick={() => setCreating(true)}>
              <Plus className="h-4 w-4" /> Add a bill
            </Button>
          }
        />
      ) : (
        <div className="space-y-6">
          {STATUS_ORDER.map((status) =>
            grouped[status].length === 0 ? null : (
              <Section key={status} title={STATUS_TITLE[status]} count={grouped[status].length}>
                {grouped[status].map((rec) => (
                  <BillCard
                    key={rec.id}
                    rec={rec}
                    account={accountMap[rec.account_id]}
                    category={rec.category_id ? categoryMap[rec.category_id] : null}
                    onEdit={() => setEditing(rec)}
                  />
                ))}
              </Section>
            ),
          )}

          {paused.length > 0 && (
            <Section title="Paused" count={paused.length}>
              {paused.map((rec) => (
                <BillCard
                  key={rec.id}
                  rec={rec}
                  account={accountMap[rec.account_id]}
                  category={rec.category_id ? categoryMap[rec.category_id] : null}
                  onEdit={() => setEditing(rec)}
                />
              ))}
            </Section>
          )}
        </div>
      )}

      <RecurringForm
        open={creating || Boolean(editing)}
        onClose={() => {
          setCreating(false)
          setEditing(null)
        }}
        recurring={editing}
      />
    </div>
  )
}

function Section({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <div className="space-y-2.5">
      <div className="flex items-baseline gap-2 px-1">
        <h2 className="section-head text-[17px] text-foreground">{title}</h2>
        <span className="font-numeric text-xs font-bold text-muted-foreground">{count}</span>
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  )
}

function BillCard({
  rec,
  account,
  category,
  onEdit,
}: {
  rec: RecurringTransaction
  account?: Account
  category: Category | null
  onEdit: () => void
}) {
  const markPaid = useMarkRecurringPaid()
  const skip = useSkipRecurring()
  const update = useUpdateRecurring()
  const del = useDeleteRecurring()
  const confirm = useConfirm()

  const { status } = dueInfo(rec.next_due)
  const accent = category?.color ?? (rec.type === 'income' ? 'var(--positive)' : 'var(--primary)')
  const dueTone =
    !rec.is_active
      ? 'text-muted-foreground'
      : status === 'overdue'
        ? 'text-danger'
        : status === 'due_soon'
          ? 'text-amber-500'
          : 'text-muted-foreground'

  const busy = markPaid.isPending || skip.isPending || update.isPending || del.isPending

  async function remove() {
    if (
      await confirm({
        title: `Delete "${rec.name}"?`,
        message: 'Past transactions it already created are kept.',
        tone: 'danger',
        confirmLabel: 'Delete',
      })
    )
      del.mutate(rec.id)
  }

  return (
    <Card className="space-y-3 p-4">
      <div className="flex items-center gap-3">
        <span
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
          style={{ backgroundColor: `${accent}1f`, color: accent }}
        >
          {category ? <CategoryIcon name={category.icon} className="h-5 w-5" /> : <Receipt className="h-5 w-5" />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p className="truncate text-sm font-bold text-foreground">{rec.name}</p>
            {rec.auto_post && (
              <span
                className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-primary/15 px-1.5 py-0.5 text-xs font-bold uppercase tracking-wide text-primary"
                title="Auto-posts automatically on its due date"
              >
                <Zap className="h-2.5 w-2.5" /> Auto
              </span>
            )}
          </div>
          <p className="truncate text-xs font-semibold text-muted-foreground">
            {frequencyText(rec.frequency, rec.interval)}
            {category ? ` · ${category.name}` : ''}
            {account ? ` · ${account.name}` : ''}
          </p>
        </div>
        <div className="text-right">
          <p
            className={cn(
              'font-numeric text-sm font-bold',
              rec.type === 'income' ? 'text-positive' : 'text-foreground',
            )}
          >
            {rec.type === 'income' ? '+' : ''}
            {formatMoney(rec.amount, rec.currency, { signDisplay: 'never' })}
          </p>
          <p className={cn('text-xs font-semibold', dueTone)}>
            {rec.is_active ? dueText(rec.next_due) : 'Paused'} · {format(new Date(rec.next_due), 'd MMM')}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {rec.is_active && (
          <>
            <Button
              size="sm"
              className="flex-1"
              loading={markPaid.isPending}
              disabled={busy}
              onClick={() => markPaid.mutate({ rec })}
            >
              <Check className="h-3.5 w-3.5" /> Mark paid
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={busy}
              onClick={() => skip.mutate(rec)}
              title="Skip this occurrence"
            >
              <SkipForward className="h-3.5 w-3.5" /> Skip
            </Button>
          </>
        )}
        {!rec.is_active && (
          <Button
            size="sm"
            variant="secondary"
            className="flex-1"
            disabled={busy}
            onClick={() => update.mutate({ id: rec.id, patch: { is_active: true } })}
          >
            <Play className="h-3.5 w-3.5" /> Resume
          </Button>
        )}
        {rec.is_active && (
          <button
            onClick={() => update.mutate({ id: rec.id, patch: { is_active: false } })}
            disabled={busy}
            className="rounded-lg border border-transparent p-1.5 text-muted-foreground transition-colors hover:border-border hover:bg-surface-muted hover:text-foreground"
            aria-label="Pause"
          >
            <Pause className="h-4 w-4" />
          </button>
        )}
        <button
          onClick={onEdit}
          disabled={busy}
          className="rounded-lg border border-transparent p-1.5 text-muted-foreground transition-colors hover:border-border hover:bg-surface-muted hover:text-foreground"
          aria-label={`Edit ${rec.name}`}
        >
          <Pencil className="h-4 w-4" />
        </button>
        <button
          onClick={remove}
          disabled={busy}
          className="rounded-lg border border-transparent p-1.5 text-muted-foreground transition-colors hover:border-danger/10 hover:bg-danger/10 hover:text-danger"
          aria-label={`Delete ${rec.name}`}
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </Card>
  )
}
