import { useMemo, useState } from 'react'
import { format } from 'date-fns'
import { Check, Pause, Pencil, Play, Receipt, SkipForward, Trash2, Zap } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { CenterSpinner } from '@/components/ui/States'
import { useConfirm } from '@/components/ui/confirm-context'
import { CategoryIcon } from '@/features/categories/CategoryIcon'
import { useAccounts } from '@/features/accounts/api'
import { useCategories } from '@/features/categories/api'
import { useT } from '@/features/settings/language-context'
import {
  useDeleteRecurring,
  useMarkRecurringPaid,
  useRecurring,
  useSkipRecurring,
  useUpdateRecurring,
} from '@/features/recurring/api'
import { RecurringForm, type RecurringPreset } from '@/features/recurring/RecurringForm'
import { dueInfo, type DueStatus } from '@/features/recurring/schedule'
import { dateLocale, type MsgKey } from '@/i18n'
import { indexById } from '@/lib/collections'
import { formatMoney } from '@/lib/money'
import { cn } from '@/lib/utils'
import type { Account, Category, RecurringTransaction } from '@/types/db'
import { dueLabel, freqText } from './format'
import { EmptyPreview, SectionHeader } from './parts'

type Translate = (key: MsgKey, vars?: Record<string, string | number>) => string

const STATUS_ORDER: DueStatus[] = ['overdue', 'due_soon', 'upcoming']
const STATUS_TITLE_KEY: Record<DueStatus, MsgKey> = {
  overdue: 'planning.bill.status.overdue',
  due_soon: 'planning.bill.status.due_soon',
  upcoming: 'planning.bill.status.upcoming',
}
// Static class pairs so Tailwind's scanner actually emits them (never build
// class names from runtime strings).
const STATUS_STYLE: Record<DueStatus, { dot: string; text: string }> = {
  overdue: { dot: 'bg-danger', text: 'text-danger' },
  due_soon: { dot: 'bg-warning', text: 'text-warning' },
  upcoming: { dot: 'bg-muted-foreground', text: 'text-muted-foreground' },
}
const PAUSED_STYLE = { dot: 'bg-muted-foreground', text: 'text-muted-foreground' }

export function BillSection() {
  const { t } = useT()
  const { data: recurring = [], isLoading } = useRecurring()
  const { data: accounts = [] } = useAccounts(true)
  const { data: categories = [] } = useCategories()

  const accountMap = useMemo(() => indexById(accounts), [accounts])
  const categoryMap = useMemo(() => indexById(categories), [categories])

  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<RecurringTransaction | null>(null)
  const [preset, setPreset] = useState<RecurringPreset | undefined>()

  function startTemplate(p: RecurringPreset) {
    setPreset(p)
    setEditing(null)
    setCreating(true)
  }

  const { grouped, paused } = useMemo(() => {
    const today = new Date()
    const grouped: Record<DueStatus, RecurringTransaction[]> = { overdue: [], due_soon: [], upcoming: [] }
    const paused: RecurringTransaction[] = []
    for (const r of recurring) {
      if (!r.is_active) paused.push(r)
      else grouped[dueInfo(r.next_due, today).status].push(r)
    }
    return { grouped, paused }
  }, [recurring])

  let index = 0

  return (
    <section id="tagihan" className="scroll-mt-6 space-y-3.5">
      <SectionHeader
        icon={Receipt}
        color="blue"
        title={t('nav.bills')}
        count={recurring.length}
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
      ) : recurring.length === 0 ? (
        <EmptyPreview
          blurb={t('planning.bill.empty')}
          ctaLabel={t('planning.bill.cta')}
          onCreate={() => setCreating(true)}
          templates={[
            { label: t('planning.tpl.rent'), onClick: () => startTemplate({ name: t('planning.tpl.rent'), type: 'expense', frequency: 'monthly' }) },
            { label: t('planning.tpl.electricity'), onClick: () => startTemplate({ name: t('planning.tpl.electricity'), type: 'expense', frequency: 'monthly' }) },
            { label: t('planning.tpl.internet'), onClick: () => startTemplate({ name: t('planning.tpl.internet'), type: 'expense', frequency: 'monthly' }) },
            { label: t('planning.tpl.salary'), onClick: () => startTemplate({ name: t('planning.tpl.salary'), type: 'income', frequency: 'monthly' }) },
          ]}
          sample={<SampleBill t={t} />}
        />
      ) : (
        <div className="space-y-5">
          {STATUS_ORDER.map((status) =>
            grouped[status].length === 0 ? null : (
              <div key={status} className="space-y-2.5">
                <StatusLabel style={STATUS_STYLE[status]} title={t(STATUS_TITLE_KEY[status])} count={grouped[status].length} />
                <div className="space-y-3">
                  {grouped[status].map((rec) => (
                    <div key={rec.id} className={cn('animate-rise', index < 5 && `stagger-${(index++ % 5) + 1}`)}>
                      <BillCard
                        rec={rec}
                        account={accountMap[rec.account_id]}
                        category={rec.category_id ? categoryMap[rec.category_id] : null}
                        onEdit={() => setEditing(rec)}
                      />
                    </div>
                  ))}
                </div>
              </div>
            ),
          )}

          {paused.length > 0 && (
            <div className="space-y-2.5">
              <StatusLabel style={PAUSED_STYLE} title={t('planning.bill.paused')} count={paused.length} />
              <div className="space-y-3">
                {paused.map((rec) => (
                  <BillCard
                    key={rec.id}
                    rec={rec}
                    account={accountMap[rec.account_id]}
                    category={rec.category_id ? categoryMap[rec.category_id] : null}
                    onEdit={() => setEditing(rec)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <RecurringForm
        open={creating || Boolean(editing)}
        onClose={() => {
          setCreating(false)
          setEditing(null)
          setPreset(undefined)
        }}
        recurring={editing}
        preset={preset}
      />
    </section>
  )
}

function StatusLabel({ style, title, count }: { style: { dot: string; text: string }; title: string; count: number }) {
  return (
    <div className="flex items-center gap-2 px-1">
      <span className={cn('h-1.5 w-1.5 rounded-full', style.dot)} />
      <span className={cn('text-xs font-bold uppercase tracking-wide', style.text)}>{title}</span>
      <span className="font-numeric text-xs font-bold text-muted-foreground">{count}</span>
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
  const { t } = useT()
  const markPaid = useMarkRecurringPaid()
  const skip = useSkipRecurring()
  const update = useUpdateRecurring()
  const del = useDeleteRecurring()
  const confirm = useConfirm()

  const { status } = dueInfo(rec.next_due)
  const accent = category?.color ?? (rec.type === 'income' ? 'var(--positive)' : 'var(--primary)')
  const dueTone = !rec.is_active
    ? 'text-muted-foreground'
    : status === 'overdue'
      ? 'text-danger'
      : status === 'due_soon'
        ? 'text-warning'
        : 'text-muted-foreground'

  const busy = markPaid.isPending || skip.isPending || update.isPending || del.isPending

  async function remove() {
    if (
      await confirm({
        title: t('planning.bill.deleteTitle', { name: rec.name }),
        message: t('planning.bill.deleteMsg'),
        tone: 'danger',
        confirmLabel: t('planning.common.delete'),
      })
    )
      del.mutate(rec.id)
  }

  return (
    <Card hoverable className="space-y-3 p-4">
      <div className="flex items-center gap-3">
        <span
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
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
            {freqText(t, rec.frequency, rec.interval)}
            {category ? ` · ${category.name}` : ''}
            {account ? ` · ${account.name}` : ''}
          </p>
        </div>
        <div className="text-right">
          <p className={cn('font-numeric text-sm font-bold', rec.type === 'income' ? 'text-positive' : 'text-foreground')}>
            {rec.type === 'income' ? '+' : ''}
            {formatMoney(rec.amount, rec.currency, { signDisplay: 'never' })}
          </p>
          <p className={cn('text-xs font-semibold', dueTone)}>
            {rec.is_active ? dueLabel(t, rec.next_due) : t('planning.bill.paused')} ·{' '}
            {format(new Date(rec.next_due), 'd MMM', { locale: dateLocale() })}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {rec.is_active ? (
          <>
            <Button size="sm" className="flex-1" loading={markPaid.isPending} disabled={busy} onClick={() => markPaid.mutate({ rec })}>
              <Check className="h-3.5 w-3.5" /> {t('planning.bill.markPaid')}
            </Button>
            <Button size="sm" variant="secondary" disabled={busy} onClick={() => skip.mutate(rec)} title={t('planning.bill.skip')}>
              <SkipForward className="h-3.5 w-3.5" /> {t('planning.bill.skip')}
            </Button>
            <button
              onClick={() => update.mutate({ id: rec.id, patch: { is_active: false } })}
              disabled={busy}
              className="rounded-lg border border-transparent p-1.5 text-muted-foreground transition-colors hover:border-border hover:bg-surface-muted hover:text-foreground"
              aria-label={t('planning.bill.pause')}
            >
              <Pause className="h-4 w-4" />
            </button>
          </>
        ) : (
          <Button
            size="sm"
            variant="secondary"
            className="flex-1"
            disabled={busy}
            onClick={() => update.mutate({ id: rec.id, patch: { is_active: true } })}
          >
            <Play className="h-3.5 w-3.5" /> {t('planning.bill.resume')}
          </Button>
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

/** Static, believable stand-in shown (faded) in the empty state. */
function SampleBill({ t }: { t: Translate }) {
  return (
    <div className="flex items-center gap-3">
      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary-soft text-primary">
        <Receipt className="h-5 w-5" />
      </span>
      <div className="flex-1">
        <p className="text-sm font-bold text-foreground">{t('planning.tpl.internet')}</p>
        <p className="text-xs font-semibold text-muted-foreground">{t('planning.freq.monthly')}</p>
      </div>
      <div className="text-right">
        <p className="font-numeric text-sm font-bold text-foreground">Rp 350.000</p>
        <p className="text-xs font-semibold text-warning">{t('planning.due.inDays', { n: 3 })}</p>
      </div>
    </div>
  )
}
