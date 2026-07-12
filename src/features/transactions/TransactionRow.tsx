import {
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpRight,
  Check,
  Copy,
  Lock,
  Paperclip,
  Pencil,
  Split,
  Trash2,
  Undo2,
} from 'lucide-react'
import { format } from 'date-fns'
import { cn } from '@/lib/utils'
import { formatMoney } from '@/lib/money'
import { CategoryIcon } from '@/features/categories/CategoryIcon'
import { TagChip } from '@/features/tags/TagChip'
import { useT } from '@/features/settings/language-context'
import { dateLocale } from '@/i18n'
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
  /** Short label of the transaction this one refunds/reimburses, if linked. */
  linkedLabel?: string
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
  linkedLabel,
  onAttachments,
  selectable = false,
  selected = false,
  onSelect,
  onDelete,
  onDuplicate,
  onEdit,
}: Props) {
  const { t } = useT()
  const account = accounts[tx.account_id]
  const counter = tx.counter_account_id ? accounts[tx.counter_account_id] : undefined
  const category = tx.category_id ? categories[tx.category_id] : undefined
  const categoryLabel = splitCount > 0 ? t('tx.split', { n: splitCount }) : category?.name

  const title =
    tx.type === 'transfer'
      ? `${account?.name ?? '—'} → ${counter?.name ?? '—'}`
      : tx.payee ||
        tx.note ||
        categoryLabel ||
        t(tx.type === 'income' ? 'common.income' : 'common.expense')

  // When the payee leads the title, fold the note into the subtitle so it's not lost.
  const subtitle =
    tx.type === 'transfer'
      ? t('common.transfer')
      : [categoryLabel, tx.payee && tx.note ? tx.note : null, account?.name]
          .filter(Boolean)
          .join(' · ')

  const sign = tx.type === 'income' ? '+' : tx.type === 'expense' ? '−' : ''

  // A tinted category icon chip leads the row — the e-wallet look. The accent is
  // deterministic: the category's own color when there is one, otherwise a
  // sensible default per transaction type.
  const chip = renderChip({ type: tx.type, category, splitCount })

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
        chip
      )}
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 text-sm font-semibold leading-snug text-foreground">
          {splitCount > 0 && <Split className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
          <span className="truncate">{title}</span>
        </p>
        <p className="mt-0.5 truncate text-xs font-medium text-muted-foreground">
          {subtitle} · {format(new Date(tx.occurred_at), 'd MMM', { locale: dateLocale() })}
        </p>
        {linkedLabel && (
          <p className="mt-0.5 inline-flex max-w-full items-center gap-1 text-xs font-medium text-muted-foreground">
            <Undo2 className="h-3 w-3 shrink-0" />
            <span className="truncate">{linkedLabel}</span>
          </p>
        )}
        {tags && tags.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {tags.map((t) => (
              <TagChip key={t.id} tag={t} />
            ))}
          </div>
        )}
      </div>
      <div className="flex items-center gap-2">
        {tx.status !== 'pending' && (
          <span
            className={cn(
              'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold',
              tx.status === 'reconciled'
                ? 'bg-foreground/10 text-foreground'
                : 'bg-surface-muted text-muted-foreground',
            )}
            title={tx.status === 'reconciled' ? t('tx.reconciled') : t('tx.cleared')}
          >
            {tx.status === 'reconciled' ? (
              <Lock className="h-3 w-3" />
            ) : (
              <Check className="h-3 w-3 stroke-[3]" />
            )}
            <span className="hidden sm:inline">
              {tx.status === 'reconciled' ? t('tx.reconciled') : t('tx.cleared')}
            </span>
          </span>
        )}
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
            aria-label={t('tx.attachments', { n: attachmentCount })}
          >
            <Paperclip className="h-3.5 w-3.5" />
            <span className="font-numeric text-xs font-bold">{attachmentCount}</span>
          </button>
        )}
        {onEdit && !selectable && (
          <button
            onClick={() => onEdit(tx.id)}
            className="rounded-xl p-1.5 text-muted-foreground opacity-0 hover:text-primary hover:bg-primary/10 transition-all duration-200 group-hover:opacity-100"
            aria-label={t('tx.editTx')}
          >
            <Pencil className="h-4 w-4" />
          </button>
        )}
        {onDuplicate && !selectable && (
          <button
            onClick={() => onDuplicate(tx.id)}
            className="rounded-xl p-1.5 text-muted-foreground opacity-0 hover:text-primary hover:bg-primary/10 transition-all duration-200 group-hover:opacity-100"
            aria-label={t('tx.duplicateTx')}
          >
            <Copy className="h-4 w-4" />
          </button>
        )}
        {onDelete && !selectable && (
          <button
            onClick={() => onDelete(tx.id)}
            className="rounded-xl p-1.5 text-muted-foreground opacity-0 hover:text-danger hover:bg-danger/10 transition-all duration-200 group-hover:opacity-100"
            aria-label={t('tx.deleteTx')}
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  )
}

/** The leading icon chip: tinted with the category's own color when present,
 *  otherwise a default per transaction type. */
function renderChip({
  type,
  category,
  splitCount,
}: {
  type: Transaction['type']
  category?: Category
  splitCount: number
}) {
  const base = 'flex h-10 w-10 shrink-0 items-center justify-center rounded-full'

  if (splitCount > 0) {
    return (
      <span className={cn(base, 'bg-chip-violet-bg text-chip-violet-fg')}>
        <Split className="h-[18px] w-[18px]" />
      </span>
    )
  }

  if (type === 'transfer') {
    return (
      <span className={cn(base, 'bg-surface-muted text-muted-foreground')}>
        <ArrowLeftRight className="h-[18px] w-[18px]" />
      </span>
    )
  }

  if (category?.color) {
    return (
      <span
        className={base}
        style={{ backgroundColor: `${category.color}22`, color: category.color }}
      >
        <CategoryIcon name={category.icon} className="h-[18px] w-[18px]" />
      </span>
    )
  }

  // No category — colour by direction (money in green, money out neutral).
  return type === 'income' ? (
    <span className={cn(base, 'bg-chip-green-bg text-chip-green-fg')}>
      <ArrowDownLeft className="h-[18px] w-[18px]" />
    </span>
  ) : (
    <span className={cn(base, 'bg-surface-muted text-muted-foreground')}>
      <ArrowUpRight className="h-[18px] w-[18px]" />
    </span>
  )
}
