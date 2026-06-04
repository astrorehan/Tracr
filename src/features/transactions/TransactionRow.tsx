import { ArrowDownLeft, ArrowUpRight, ArrowLeftRight, Check, Paperclip, Split, Trash2 } from 'lucide-react'
import { format } from 'date-fns'
import { cn } from '@/lib/utils'
import { formatMoney } from '@/lib/money'
import { TagChip } from '@/features/tags/TagChip'
import type { Account, Category, Tag, Transaction } from '@/types/db'

interface Props {
  tx: Transaction
  accounts: Record<string, Account>
  categories: Record<string, Category>
  tags?: Tag[]
  /** Number of category splits on this transaction (0 = not split). */
  splitCount?: number
  /** Number of attached receipts (0 = none). */
  attachmentCount?: number
  onAttachments?: (id: string) => void
  /** When true, the row toggles selection instead of showing the delete button. */
  selectable?: boolean
  selected?: boolean
  onSelect?: (id: string) => void
  onDelete?: (id: string) => void
}

export function TransactionRow({
  tx,
  accounts,
  categories,
  tags,
  splitCount = 0,
  attachmentCount = 0,
  onAttachments,
  selectable = false,
  selected = false,
  onSelect,
  onDelete,
}: Props) {
  const account = accounts[tx.account_id]
  const counter = tx.counter_account_id ? accounts[tx.counter_account_id] : undefined
  const category = tx.category_id ? categories[tx.category_id] : undefined
  const categoryLabel = splitCount > 0 ? `Split · ${splitCount} categories` : category?.name

  const title =
    tx.type === 'transfer'
      ? `${account?.name ?? '—'} → ${counter?.name ?? '—'}`
      : (tx.note || categoryLabel || (tx.type === 'income' ? 'Income' : 'Expense'))

  const subtitle =
    tx.type === 'transfer'
      ? 'Transfer'
      : [categoryLabel, account?.name].filter(Boolean).join(' · ')

  const Icon =
    tx.type === 'income' ? ArrowDownLeft : tx.type === 'transfer' ? ArrowLeftRight : ArrowUpRight
  const tone =
    tx.type === 'income'
      ? 'text-positive bg-positive/10'
      : tx.type === 'transfer'
        ? 'text-muted-foreground bg-surface-muted'
        : 'text-negative bg-negative/10'
  const sign = tx.type === 'income' ? '+' : tx.type === 'expense' ? '−' : ''

  return (
    <div
      className={cn(
        'group flex items-center gap-3.5 py-3',
        selectable && 'cursor-pointer rounded-xl px-2 -mx-2 transition-colors',
        selectable && selected && 'bg-primary/5',
      )}
      onClick={selectable ? () => onSelect?.(tx.id) : undefined}
    >
      {selectable ? (
        <div
          className={cn(
            'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border-2 transition-colors',
            selected ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-transparent',
          )}
        >
          <Check className="h-5 w-5 stroke-[3]" />
        </div>
      ) : (
        <div className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-xl shadow-sm transition-transform duration-300 group-hover:scale-105', tone)}>
          <Icon className="h-5 w-5 stroke-[2.2]" />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 text-sm font-bold leading-snug text-foreground">
          {splitCount > 0 && <Split className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
          <span className="truncate">{title}</span>
        </p>
        <p className="truncate text-[11px] font-semibold text-muted-foreground mt-0.5">
          {subtitle} · {format(new Date(tx.occurred_at), 'd MMM')}
        </p>
        {tags && tags.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {tags.map((t) => (
              <TagChip key={t.id} tag={t} />
            ))}
          </div>
        )}
      </div>
      <div className="flex items-center gap-2">
        <span
          className={cn(
            'text-[15px] font-bold font-numeric tracking-wide',
            tx.type === 'income' && 'text-positive',
            tx.type === 'expense' && 'text-negative',
          )}
        >
          {sign}
          {formatMoney(tx.amount, tx.currency, { signDisplay: 'never' })}
        </span>
        {attachmentCount > 0 && onAttachments && !selectable && (
          <button
            onClick={() => onAttachments(tx.id)}
            className="inline-flex items-center gap-0.5 rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-surface-muted hover:text-foreground"
            aria-label={`${attachmentCount} attachment(s)`}
          >
            <Paperclip className="h-3.5 w-3.5" />
            <span className="font-numeric text-[11px] font-bold">{attachmentCount}</span>
          </button>
        )}
        {onDelete && !selectable && (
          <button
            onClick={() => onDelete(tx.id)}
            className="rounded-xl p-1.5 text-muted-foreground opacity-0 hover:text-danger hover:bg-danger/10 transition-all duration-200 group-hover:opacity-100"
            aria-label="Delete transaction"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  )
}
