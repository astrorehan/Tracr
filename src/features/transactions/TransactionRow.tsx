import { Check, Copy, Paperclip, Pencil, Split, Trash2 } from 'lucide-react'
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
  onDuplicate?: (id: string) => void
  onEdit?: (id: string) => void
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
  onDuplicate,
  onEdit,
}: Props) {
  const account = accounts[tx.account_id]
  const counter = tx.counter_account_id ? accounts[tx.counter_account_id] : undefined
  const category = tx.category_id ? categories[tx.category_id] : undefined
  const categoryLabel = splitCount > 0 ? `Split · ${splitCount} categories` : category?.name

  const title =
    tx.type === 'transfer'
      ? `${account?.name ?? '—'} → ${counter?.name ?? '—'}`
      : (tx.payee || tx.note || categoryLabel || (tx.type === 'income' ? 'Income' : 'Expense'))

  // When the payee leads the title, fold the note into the subtitle so it's not lost.
  const subtitle =
    tx.type === 'transfer'
      ? 'Transfer'
      : [categoryLabel, tx.payee && tx.note ? tx.note : null, account?.name]
          .filter(Boolean)
          .join(' · ')

  // A slim ledger tick marks the row's direction; the amount color carries
  // the rest. (Income gets the strong mark — in a ledger, money in is the event.)
  const tick =
    tx.type === 'income'
      ? 'bg-positive'
      : tx.type === 'transfer'
        ? 'bg-border'
        : 'bg-negative/45'
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
            'flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 transition-colors',
            selected ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-transparent',
          )}
        >
          <Check className="h-3.5 w-3.5 stroke-[3.5]" />
        </div>
      ) : (
        <span aria-hidden className={cn('h-8 w-[3px] shrink-0 rounded-full', tick)} />
      )}
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 text-sm font-semibold leading-snug text-foreground">
          {splitCount > 0 && <Split className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
          <span className="truncate">{title}</span>
        </p>
        <p className="mt-0.5 truncate text-xs font-medium text-muted-foreground">
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
            <span className="font-numeric text-xs font-bold">{attachmentCount}</span>
          </button>
        )}
        {onEdit && !selectable && (
          <button
            onClick={() => onEdit(tx.id)}
            className="rounded-xl p-1.5 text-muted-foreground opacity-0 hover:text-primary hover:bg-primary/10 transition-all duration-200 group-hover:opacity-100"
            aria-label="Edit transaction"
          >
            <Pencil className="h-4 w-4" />
          </button>
        )}
        {onDuplicate && !selectable && (
          <button
            onClick={() => onDuplicate(tx.id)}
            className="rounded-xl p-1.5 text-muted-foreground opacity-0 hover:text-primary hover:bg-primary/10 transition-all duration-200 group-hover:opacity-100"
            aria-label="Duplicate transaction"
          >
            <Copy className="h-4 w-4" />
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
