import { useMemo, useState } from 'react'
import { format } from 'date-fns'
import {
  HandCoins,
  Store,
  Plus,
  Trash2,
  MessageCircle,
  ArrowDownLeft,
  ArrowUpRight,
  Check,
} from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { PageHeader, Pill } from '@/components/ui/list'
import { CenterSpinner } from '@/components/ui/States'
import { StarterGuide } from '@/components/ui/StarterGuide'
import { useConfirm } from '@/components/ui/confirm-context'
import { useAuth } from '@/features/auth/useAuth'
import { useActiveBook } from '@/features/books/useActiveBook'
import { formatMoney } from '@/lib/money'
import { cn } from '@/lib/utils'
import { useDebts, useDeleteDebt, type DebtWithContact } from '@/features/debts/api'
import { DebtForm } from '@/features/debts/DebtForm'
import { PaymentForm } from '@/features/debts/PaymentForm'

const today = () => new Date().toISOString().slice(0, 10)

function remainingOf(d: DebtWithContact) {
  return Math.max(0, d.amount - d.paid)
}

/** Normalize an Indonesian phone to wa.me digits: 08xx → 628xx, strip non-digits. */
function waNumber(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  if (digits.startsWith('0')) return '62' + digits.slice(1)
  return digits
}

export function DebtsPage() {
  const { profile } = useAuth()
  const base = profile?.base_currency ?? 'IDR'
  const { activeBook } = useActiveBook()
  const { data: debts = [], isLoading } = useDebts()

  const [creating, setCreating] = useState(false)
  const [paying, setPaying] = useState<DebtWithContact | null>(null)

  const { openDebts, settled, owedToMe, iOwe } = useMemo(() => {
    const open = debts.filter((d) => d.status === 'open')
    const settled = debts.filter((d) => d.status === 'paid')
    const owedToMe = open
      .filter((d) => d.direction === 'receivable')
      .reduce((s, d) => s + remainingOf(d), 0)
    const iOwe = open
      .filter((d) => d.direction === 'payable')
      .reduce((s, d) => s + remainingOf(d), 0)
    return { openDebts: open, settled, owedToMe, iOwe }
  }, [debts])

  // Guard: this ledger only makes sense inside a business book.
  if (activeBook && activeBook.type !== 'business') {
    return (
      <div className="mx-auto max-w-3xl">
        <PageHeader title="Debts" />
        <Card className="flex flex-col items-center gap-3 p-8 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-soft text-primary">
            <Store className="h-6 w-6" />
          </span>
          <p className="text-sm font-medium text-muted-foreground">
            Debts (utang-piutang) are part of a <span className="font-bold text-foreground">business</span>{' '}
            book. Switch to or create a business book to track who owes you and who you owe.
          </p>
        </Card>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title="Debts"
        subtitle="Kasbon — track who owes you and who you owe."
        action={
          debts.length > 0 ? (
            <Pill variant="tint" icon={Plus} onClick={() => setCreating(true)}>
              New
            </Pill>
          ) : undefined
        }
      />

      {isLoading ? (
        <CenterSpinner />
      ) : debts.length === 0 ? (
        <StarterGuide
          icon={<HandCoins className="h-6 w-6" />}
          title="Never lose track of a kasbon"
          intro="Write down every debt — who owes you, who you owe, and how much is left."
          points={[
            {
              title: 'Add a record',
              body: 'Pick “They owe me” or “I owe them”, choose the person, and enter the amount.',
            },
            {
              title: 'Log payments as they come',
              body: 'Each payment chips away at the balance until it’s fully settled.',
            },
            {
              title: 'Send a friendly reminder',
              body: 'One tap opens WhatsApp with a ready-to-send message for that customer.',
            },
          ]}
          templates={[
            { label: 'They owe me', hint: 'A customer bought on credit', onClick: () => setCreating(true) },
            { label: 'I owe them', hint: 'You owe a supplier', onClick: () => setCreating(true) },
          ]}
        />
      ) : (
        <div className="space-y-6">
          {/* Summary tiles */}
          <div className="grid grid-cols-2 gap-3">
            <SummaryTile
              label="They owe me"
              amount={owedToMe}
              currency={base}
              icon={ArrowDownLeft}
              tone="positive"
            />
            <SummaryTile
              label="I owe"
              amount={iOwe}
              currency={base}
              icon={ArrowUpRight}
              tone="danger"
            />
          </div>

          {openDebts.length > 0 && (
            <div className="space-y-3">
              {openDebts.map((debt) => (
                <DebtCard key={debt.id} debt={debt} onPay={() => setPaying(debt)} />
              ))}
            </div>
          )}

          {settled.length > 0 && (
            <div className="space-y-3">
              <h2 className="section-head px-1 text-[17px] text-foreground">Settled</h2>
              {settled.map((debt) => (
                <DebtCard key={debt.id} debt={debt} onPay={() => setPaying(debt)} />
              ))}
            </div>
          )}
        </div>
      )}

      <DebtForm open={creating} onClose={() => setCreating(false)} />
      <PaymentForm open={Boolean(paying)} onClose={() => setPaying(null)} debt={paying} />
    </div>
  )
}

function SummaryTile({
  label,
  amount,
  currency,
  icon: Icon,
  tone,
}: {
  label: string
  amount: number
  currency: string
  icon: React.ComponentType<{ className?: string }>
  tone: 'positive' | 'danger'
}) {
  return (
    <Card className="flex flex-col gap-1.5 p-4">
      <span className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
        <Icon className={cn('h-3.5 w-3.5', tone === 'positive' ? 'text-positive' : 'text-danger')} />
        {label}
      </span>
      <span
        className={cn(
          'font-numeric text-xl font-bold',
          tone === 'positive' ? 'text-positive' : 'text-danger',
        )}
      >
        {formatMoney(amount, currency, { signDisplay: 'never' })}
      </span>
    </Card>
  )
}

function DebtCard({ debt, onPay }: { debt: DebtWithContact; onPay: () => void }) {
  const del = useDeleteDebt()
  const confirm = useConfirm()

  const remaining = remainingOf(debt)
  const pct = debt.amount > 0 ? Math.min(100, (debt.paid / debt.amount) * 100) : 0
  const isReceivable = debt.direction === 'receivable'
  const settled = debt.status === 'paid'
  const overdue = !settled && debt.due_date != null && debt.due_date < today()
  const accent = isReceivable ? 'var(--positive)' : 'var(--danger)'
  const name = debt.contact?.name ?? 'No name'

  const reminderHref =
    isReceivable && debt.contact?.phone
      ? `https://wa.me/${waNumber(debt.contact.phone)}?text=${encodeURIComponent(
          `Halo ${name}, mengingatkan sisa utang ${formatMoney(remaining, debt.currency, { signDisplay: 'never' })}. Terima kasih 🙏`,
        )}`
      : null

  async function remove() {
    if (
      await confirm({
        title: `Delete this record?`,
        message: `The debt with ${name} and its payment history will be removed. This cannot be undone.`,
        tone: 'danger',
        confirmLabel: 'Delete',
      })
    )
      del.mutate(debt.id)
  }

  return (
    <Card className={cn('space-y-3 p-4', settled && 'opacity-70')}>
      <div className="flex items-center gap-3">
        <span
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
          style={{ backgroundColor: `${accent}1f`, color: accent }}
        >
          {isReceivable ? <ArrowDownLeft className="h-5 w-5" /> : <ArrowUpRight className="h-5 w-5" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 truncate text-sm font-bold text-foreground">
            {name}
            {settled && (
              <span className="inline-flex items-center gap-0.5 rounded-md bg-positive/10 px-1.5 py-0.5 text-xs font-bold uppercase text-positive">
                <Check className="h-2.5 w-2.5" /> Paid
              </span>
            )}
          </p>
          <p className="truncate text-xs font-semibold text-muted-foreground">
            {isReceivable ? 'Owes you' : 'You owe'} ·{' '}
            {formatMoney(debt.amount, debt.currency, { signDisplay: 'never' })}
          </p>
        </div>
        {!settled && (
          <span className="font-numeric text-sm font-bold" style={{ color: accent }}>
            {formatMoney(remaining, debt.currency, { signDisplay: 'never' })}
          </span>
        )}
      </div>

      {!settled && debt.paid > 0 && (
        <div className="h-2 w-full overflow-hidden rounded-full bg-surface-muted">
          <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: accent }} />
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs font-medium text-muted-foreground">
        <span>
          {settled
            ? 'Fully settled'
            : debt.paid > 0
              ? `${formatMoney(remaining, debt.currency, { signDisplay: 'never' })} left`
              : 'Nothing paid yet'}
        </span>
        {debt.due_date && (
          <span className={cn(overdue && 'font-semibold text-danger')}>
            Due {format(new Date(debt.due_date), 'd MMM yyyy')}
            {overdue && ' · overdue'}
          </span>
        )}
      </div>

      {debt.note && <p className="text-xs text-muted-foreground">{debt.note}</p>}

      {!settled && (
        <div className="flex items-center gap-2 pt-1">
          <Button size="sm" className="flex-1" onClick={onPay} disabled={del.isPending}>
            <Plus className="h-3.5 w-3.5" /> Record payment
          </Button>
          {reminderHref && (
            <a
              href={reminderHref}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:bg-surface-muted hover:text-foreground"
              title="Remind on WhatsApp"
            >
              <MessageCircle className="h-3.5 w-3.5" /> Remind
            </a>
          )}
          <button
            onClick={remove}
            disabled={del.isPending}
            className="rounded-lg border border-transparent p-1.5 text-muted-foreground transition-colors hover:border-danger/10 hover:bg-danger/10 hover:text-danger"
            aria-label="Delete record"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      )}
      {settled && (
        <div className="flex justify-end pt-1">
          <button
            onClick={remove}
            disabled={del.isPending}
            className="rounded-lg border border-transparent p-1.5 text-muted-foreground transition-colors hover:border-danger/10 hover:bg-danger/10 hover:text-danger"
            aria-label="Delete record"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      )}
    </Card>
  )
}
