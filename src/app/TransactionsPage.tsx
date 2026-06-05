import { useMemo, useState } from 'react'
import { format } from 'date-fns'
import { ArrowLeftRight, ListChecks } from 'lucide-react'
import { CenterSpinner, EmptyState } from '@/components/ui/States'
import { useAccounts } from '@/features/accounts/api'
import { useCategories } from '@/features/categories/api'
import {
  useDeleteTransaction,
  useDuplicateTransaction,
  useTransactions,
} from '@/features/transactions/api'
import { useTags, useTransactionTags } from '@/features/tags/api'
import { useTransactionSplits } from '@/features/transactions/splits'
import { useTransactionAttachments } from '@/features/attachments/api'
import { AttachmentsModal } from '@/features/attachments/AttachmentsModal'
import { TransactionRow } from '@/features/transactions/TransactionRow'
import { BulkBar } from '@/features/transactions/BulkBar'
import { FilterPanel } from '@/features/transactions/FilterPanel'
import { defaultFilter, isFilterEmpty, resolveDateRange } from '@/features/transactions/filters'
import { indexById } from '@/lib/collections'
import { fromMinorUnits, formatMoney } from '@/lib/money'
import { cn } from '@/lib/utils'
import type { Tag, Transaction } from '@/types/db'

export function TransactionsPage() {
  const [filter, setFilter] = useState(defaultFilter)
  const [selectMode, setSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [attachmentsTxId, setAttachmentsTxId] = useState<string | null>(null)

  const { data: accounts = [] } = useAccounts(true)
  const { data: categories = [] } = useCategories()
  const { data: tags = [] } = useTags()
  const { data: txTags = {} } = useTransactionTags()
  const { data: splitsByTx = {} } = useTransactionSplits()
  const { data: attByTx = {} } = useTransactionAttachments()
  // Push down what the server filters cheaply (account, type, date range);
  // tags, amount, category, source, text search & sort are applied client-side.
  const { data: transactions, isLoading } = useTransactions({
    accountId: filter.accountId || undefined,
    type: filter.type || undefined,
    ...resolveDateRange(filter),
    limit: 500,
  })
  const del = useDeleteTransaction()
  const duplicate = useDuplicateTransaction()

  const accountMap = useMemo(() => indexById(accounts), [accounts])
  const categoryMap = useMemo(() => indexById(categories), [categories])
  const tagMap = useMemo(() => indexById(tags), [tags])

  // A selected category also matches its direct subcategories.
  const categoryMatchIds = useMemo(() => {
    if (!filter.categoryId) return null
    const ids = new Set<string>([filter.categoryId])
    for (const c of categories) if (c.parent_id === filter.categoryId) ids.add(c.id)
    return ids
  }, [filter.categoryId, categories])

  const visible = useMemo(() => {
    const q = filter.search.trim().toLowerCase()
    const payeeQ = filter.payee.trim().toLowerCase()
    const min = filter.amountMin ? parseFloat(filter.amountMin) : null
    const max = filter.amountMax ? parseFloat(filter.amountMax) : null

    const rows = (transactions ?? []).filter((tx) => {
      if (categoryMatchIds && !(tx.category_id && categoryMatchIds.has(tx.category_id))) return false
      if (filter.source && tx.source !== filter.source) return false
      if (payeeQ && !(tx.payee ?? '').toLowerCase().includes(payeeQ)) return false

      const txt = txTags[tx.id] ?? []
      if (filter.tagIds.length) {
        const ok =
          filter.tagMatch === 'all'
            ? filter.tagIds.every((id) => txt.includes(id))
            : filter.tagIds.some((id) => txt.includes(id))
        if (!ok) return false
      }

      if (min !== null || max !== null) {
        const major = fromMinorUnits(tx.amount, tx.currency)
        if (min !== null && major < min) return false
        if (max !== null && major > max) return false
      }

      if (q) {
        const haystack = [
          tx.note,
          tx.payee,
          tx.category_id ? categoryMap[tx.category_id]?.name : '',
          accountMap[tx.account_id]?.name,
          ...txt.map((id) => tagMap[id]?.name ?? ''),
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
        if (!haystack.includes(q)) return false
      }
      return true
    })

    return rows.sort((a, b) => {
      switch (filter.sort) {
        case 'date_asc':
          return a.occurred_at.localeCompare(b.occurred_at)
        case 'amount_desc':
          return b.amount - a.amount
        case 'amount_asc':
          return a.amount - b.amount
        case 'date_desc':
        default:
          return b.occurred_at.localeCompare(a.occurred_at)
      }
    })
  }, [transactions, txTags, categoryMatchIds, filter, categoryMap, accountMap, tagMap])

  function tagsFor(txId: string): Tag[] {
    return (txTags[txId] ?? []).map((id) => tagMap[id]).filter(Boolean)
  }

  function handleDuplicate(tx: Transaction) {
    duplicate.mutate({
      tx,
      tagIds: txTags[tx.id] ?? [],
      splits: (splitsByTx[tx.id] ?? []).map((s) => ({
        category_id: s.category_id,
        amount: s.amount,
        note: s.note,
      })),
    })
  }

  function toggleSelect(id: string) {
    setSelectedIds((cur) => {
      const next = new Set(cur)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function exitSelect() {
    setSelectMode(false)
    setSelectedIds(new Set())
  }

  function renderRow(tx: Transaction) {
    return (
      <TransactionRow
        key={tx.id}
        tx={tx}
        accounts={accountMap}
        categories={categoryMap}
        tags={tagsFor(tx.id)}
        splitCount={splitsByTx[tx.id]?.length ?? 0}
        attachmentCount={attByTx[tx.id]?.length ?? 0}
        onAttachments={setAttachmentsTxId}
        selectable={selectMode}
        selected={selectedIds.has(tx.id)}
        onSelect={toggleSelect}
        onDuplicate={() => handleDuplicate(tx)}
        onDelete={(id) => {
          if (confirm('Delete this transaction?')) del.mutate(id)
        }}
      />
    )
  }

  // Day grouping only makes sense for date sorts; amount sorts get a flat list.
  const flat = filter.sort.startsWith('amount')
  const groups = useMemo(() => {
    const byDay = new Map<string, Transaction[]>()
    for (const tx of visible) {
      const key = format(new Date(tx.occurred_at), 'EEEE, d MMM yyyy')
      const arr = byDay.get(key) ?? []
      arr.push(tx)
      byDay.set(key, arr)
    }
    return Array.from(byDay.entries())
  }, [visible])

  const selectedTxns = useMemo(
    () => visible.filter((tx) => selectedIds.has(tx.id)),
    [visible, selectedIds],
  )
  const allVisibleSelected = visible.length > 0 && visible.every((tx) => selectedIds.has(tx.id))

  function toggleSelectAll() {
    setSelectedIds(allVisibleSelected ? new Set() : new Set(visible.map((tx) => tx.id)))
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <header className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-extrabold tracking-tight lg:text-3xl">Activity</h1>
        {selectMode ? (
          <div className="flex items-center gap-3 text-xs font-semibold">
            <button onClick={toggleSelectAll} className="text-primary hover:underline">
              {allVisibleSelected ? 'Clear all' : 'Select all'}
            </button>
            <button onClick={exitSelect} className="text-muted-foreground hover:text-foreground">
              Done
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <span className="font-numeric text-sm font-semibold text-muted-foreground">
              {visible.length} transaction{visible.length === 1 ? '' : 's'}
            </span>
            {visible.length > 0 && (
              <button
                onClick={() => setSelectMode(true)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs font-semibold text-foreground shadow-sm transition hover:bg-surface-muted"
              >
                <ListChecks className="h-3.5 w-3.5" /> Select
              </button>
            )}
          </div>
        )}
      </header>

      <FilterPanel
        filter={filter}
        onChange={setFilter}
        accounts={accounts}
        categories={categories}
        tags={tags}
      />

      {isLoading ? (
        <CenterSpinner />
      ) : visible.length === 0 ? (
        <EmptyState
          icon={<ArrowLeftRight className="h-7 w-7" />}
          title="No transactions"
          description={
            isFilterEmpty(filter)
              ? 'Tap the + button to log your first one.'
              : 'No transactions match these filters.'
          }
        />
      ) : flat ? (
        <div className="animate-fade-in divide-y divide-border rounded-2xl border border-border bg-surface px-4 py-1 shadow-sm">
          {visible.map(renderRow)}
        </div>
      ) : (
        <div className="animate-fade-in space-y-5">
          {groups.map(([day, txs]) => {
            const dayTotal = txs.reduce(
              (sum, tx) =>
                tx.type === 'income'
                  ? sum + tx.amount
                  : tx.type === 'expense'
                    ? sum - tx.amount
                    : sum,
              0,
            )
            return (
              <div key={day} className="space-y-2">
                <div className="flex items-center justify-between px-1">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                    {day}
                  </p>
                  <span className={cnTone(dayTotal)}>
                    {dayTotal > 0 ? '+' : ''}
                    {dayTotal !== 0 ? formatDayTotal(dayTotal, txs[0].currency) : ''}
                  </span>
                </div>
                <div className="divide-y divide-border rounded-2xl border border-border bg-surface px-4 py-1 shadow-sm">
                  {txs.map(renderRow)}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {selectMode && selectedTxns.length > 0 && (
        <BulkBar selected={selectedTxns} onClear={exitSelect} />
      )}

      <AttachmentsModal transactionId={attachmentsTxId} onClose={() => setAttachmentsTxId(null)} />
    </div>
  )
}

function formatDayTotal(amount: number, currency: string) {
  return formatMoney(Math.abs(amount), currency, { signDisplay: 'never' })
}

function cnTone(total: number) {
  return cn(
    'font-numeric text-[11px] font-bold tracking-wide',
    total > 0 && 'text-positive',
    total < 0 && 'text-negative',
    total === 0 && 'text-muted-foreground',
  )
}
