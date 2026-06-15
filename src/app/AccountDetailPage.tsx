import { useMemo, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { format } from 'date-fns'
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis } from 'recharts'
import { Archive, ArrowLeft, Pencil, Scale } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Field, Input } from '@/components/ui/Input'
import { CenterSpinner, EmptyState } from '@/components/ui/States'
import { useConfirm } from '@/components/ui/confirm'
import { useAuth } from '@/features/auth/useAuth'
import { useAccounts, useArchiveAccount, useBalances } from '@/features/accounts/api'
import { useFxRates } from '@/features/fx/api'
import { buildRateTable, convertMinor } from '@/features/fx/fx'
import { useCategories, useEnsureAdjustmentCategory } from '@/features/categories/api'
import { useDeleteTransaction, useCreateTransaction, useTransactions } from '@/features/transactions/api'
import { useTransactionSplits } from '@/features/transactions/splits'
import { TransactionRow } from '@/features/transactions/TransactionRow'
import { AccountForm } from '@/features/accounts/AccountForm'
import { accountTypeMeta } from '@/features/accounts/meta'
import { indexById } from '@/lib/collections'
import { chartTooltipStyle } from '@/lib/chartTheme'
import { amountToMinor, formatMoney, fromMinorUnits } from '@/lib/money'
import { cn } from '@/lib/utils'
import type { Transaction } from '@/types/db'

/** Signed effect of a transaction on one specific account's balance. */
function deltaFor(tx: Transaction, accountId: string): number {
  if (tx.type === 'income') return tx.account_id === accountId ? tx.amount : 0
  if (tx.type === 'expense') return tx.account_id === accountId ? -tx.amount : 0
  // transfer: source loses its amount, counter gains its own-currency amount
  if (tx.account_id === accountId) return -tx.amount
  if (tx.counter_account_id === accountId) return tx.counter_amount ?? tx.amount
  return 0
}

export function AccountDetailPage() {
  const { id = '' } = useParams()
  const { profile } = useAuth()
  const base = profile?.base_currency ?? 'IDR'
  const { data: accounts = [], isLoading: la } = useAccounts(true)
  const { data: balances = {} } = useBalances()
  const { data: fxRates = [] } = useFxRates()
  const { data: categories = [] } = useCategories()
  const { data: transactions = [], isLoading: lt } = useTransactions({ accountId: id, limit: 1000 })
  const { data: splitsByTx = {} } = useTransactionSplits()

  const create = useCreateTransaction()
  const ensureAdjustmentCategory = useEnsureAdjustmentCategory()
  const del = useDeleteTransaction()
  const archive = useArchiveAccount()
  const confirm = useConfirm()

  const [editOpen, setEditOpen] = useState(false)
  const [reconcileOpen, setReconcileOpen] = useState(false)
  const [actual, setActual] = useState('')
  const [reason, setReason] = useState('')

  const account = accounts.find((a) => a.id === id)
  const accountMap = useMemo(() => indexById(accounts), [accounts])
  const categoryMap = useMemo(() => indexById(categories), [categories])

  // Running end-of-day balance series for the chart.
  const series = useMemo(() => {
    if (!account) return []
    const sorted = [...transactions].sort((a, b) => a.occurred_at.localeCompare(b.occurred_at))
    let running = account.opening_balance
    const byDay = new Map<string, number>()
    for (const tx of sorted) {
      running += deltaFor(tx, account.id)
      byDay.set(format(new Date(tx.occurred_at), 'yyyy-MM-dd'), running)
    }
    const points = Array.from(byDay.entries()).map(([date, bal]) => ({
      label: format(new Date(date), 'd MMM'),
      balance: bal,
    }))
    return [{ label: 'Start', balance: account.opening_balance }, ...points]
  }, [account, transactions])

  if (la) return <CenterSpinner />
  if (!account) return <Navigate to="/accounts" replace />

  const meta = accountTypeMeta(account.type)
  const Icon = meta.icon
  const color = account.color ?? '#9a8c74'
  const balance = balances[account.id] ?? account.opening_balance
  const baseEstimate =
    account.currency === base
      ? null
      : convertMinor(balance, account.currency, base, buildRateTable(fxRates, base))

  function closeReconcile() {
    setReconcileOpen(false)
    setActual('')
    setReason('')
  }

  async function reconcile() {
    if (!account) return
    const actualMinor = amountToMinor(actual, account.currency)
    const diff = actualMinor - balance
    if (diff === 0) {
      closeReconcile()
      return
    }
    const kind = diff > 0 ? 'income' : 'expense'
    const trimmed = reason.trim()
    try {
      // File the correction under a dedicated category so it stays out of
      // "Uncategorized" in reports; the optional reason becomes the note.
      const categoryId = await ensureAdjustmentCategory.mutateAsync(kind)
      await create.mutateAsync({
        account_id: account.id,
        counter_account_id: null,
        category_id: categoryId,
        type: kind,
        amount: Math.abs(diff),
        currency: account.currency,
        occurred_at: new Date().toISOString(),
        note: trimmed || 'Balance adjustment',
      })
      closeReconcile()
    } catch {
      // Mutation errors surface via the hooks' state; leave the panel open so
      // the entered values aren't lost and the user can retry.
    }
  }

  const diffPreview = actual.trim() ? amountToMinor(actual, account.currency) - balance : 0

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="flex items-center gap-3 py-1">
        <Link
          to="/accounts"
          className="rounded-xl border border-transparent p-2 text-muted-foreground transition-all hover:border-border hover:bg-surface-muted hover:text-foreground"
          aria-label="Back to accounts"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="flex-1 truncate text-2xl font-extrabold tracking-tight lg:text-3xl">
          {account.name}
        </h1>
        <button
          onClick={() => setEditOpen(true)}
          className="rounded-lg border border-transparent p-2 text-muted-foreground transition-colors hover:border-border hover:bg-surface-muted hover:text-foreground"
          aria-label="Edit account"
        >
          <Pencil className="h-4 w-4" />
        </button>
        {!account.is_archived && (
          <button
            onClick={async () => {
              if (
                await confirm({
                  title: `Archive "${account.name}"?`,
                  message: 'It moves out of your active accounts but keeps its history.',
                  confirmLabel: 'Archive',
                })
              )
                archive.mutate(account.id)
            }}
            className="rounded-lg border border-transparent p-2 text-muted-foreground transition-colors hover:border-danger/20 hover:bg-danger/10 hover:text-danger"
            aria-label="Archive account"
          >
            <Archive className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Balance hero + chart */}
      <Card className="overflow-hidden p-0">
        <div className="flex items-center justify-between p-5">
          <div className="flex items-center gap-3">
            <span
              className="flex h-12 w-12 items-center justify-center rounded-xl border"
              style={{ backgroundColor: `${color}1f`, color, borderColor: `${color}33` }}
            >
              <Icon className="h-5 w-5 stroke-[2.2]" />
            </span>
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                {meta.label} · {account.currency}
                {account.is_liability ? ' · Liability' : ''}
                {account.exclude_from_stats ? ' · Excluded from net worth' : ''}
                {account.is_archived ? ' · Archived' : ''}
              </p>
              <p
                className={cn(
                  'font-numeric text-2xl font-extrabold leading-tight',
                  account.is_liability ? 'text-danger' : 'text-foreground',
                )}
              >
                {formatMoney(balance, account.currency)}
                {account.is_liability && (
                  <span className="ml-1.5 text-xs font-bold uppercase tracking-wide text-danger/70">
                    owed
                  </span>
                )}
              </p>
              {baseEstimate != null && (
                <p className="font-numeric text-xs font-semibold text-muted-foreground">
                  ≈ {formatMoney(baseEstimate, base)}
                </p>
              )}
              {account.is_liability &&
                account.credit_limit != null &&
                account.credit_limit > 0 &&
                (() => {
                  const limit = account.credit_limit
                  const owed = Math.abs(balance)
                  const pct = Math.min(100, (owed / limit) * 100)
                  const available = limit - owed
                  const c = pct >= 90 ? 'var(--danger)' : pct >= 70 ? '#f59e0b' : color
                  return (
                    <div className="mt-2 max-w-[220px]">
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-muted">
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${pct}%`, backgroundColor: c }}
                        />
                      </div>
                      <p className="mt-1 text-xs font-semibold text-muted-foreground">
                        {pct.toFixed(0)}% of{' '}
                        {formatMoney(limit, account.currency, { signDisplay: 'never' })} ·{' '}
                        {available >= 0
                          ? `${formatMoney(available, account.currency, { signDisplay: 'never' })} available`
                          : `over by ${formatMoney(-available, account.currency, { signDisplay: 'never' })}`}
                      </p>
                    </div>
                  )
                })()}
            </div>
          </div>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => (reconcileOpen ? closeReconcile() : setReconcileOpen(true))}
          >
            <Scale className="h-3.5 w-3.5" /> Reconcile
          </Button>
        </div>

        {series.length > 1 && (
          <ResponsiveContainer width="100%" height={140}>
            <AreaChart data={series} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="balGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={color} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={color} stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                fontSize={10}
                stroke="var(--muted-foreground)"
                interval="preserveStartEnd"
                minTickGap={28}
              />
              <Tooltip
                contentStyle={chartTooltipStyle}
                formatter={(value) => [formatMoney(Number(value), account.currency), 'Balance']}
              />
              <Area
                type="monotone"
                dataKey="balance"
                stroke={color}
                strokeWidth={2}
                fill="url(#balGradient)"
              />
            </AreaChart>
          </ResponsiveContainer>
        )}

        {/* Reconcile panel */}
        {reconcileOpen && (
          <div className="space-y-3 border-t border-border bg-surface-muted/40 p-5">
            <p className="text-xs font-medium text-muted-foreground">
              Enter the real balance from your bank/app. We’ll add an adjustment for the difference
              — filed under a “Balance Adjustment” category — so Tracr matches it.
            </p>
            <div className="flex flex-wrap items-end gap-3">
              <Field label="Actual balance">
                <Input
                  type="number"
                  inputMode="decimal"
                  step="any"
                  value={actual}
                  onChange={(e) => setActual(e.target.value)}
                  placeholder={String(fromMinorUnits(balance, account.currency))}
                  className="w-44"
                  autoFocus
                />
              </Field>
              <div className="min-w-[200px] flex-1">
                <Field label="What changed? (optional)">
                  <Input
                    type="text"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="e.g. cash tips, ATM fee, forgot to log groceries"
                  />
                </Field>
              </div>
            </div>
            {actual.trim() !== '' && (
              <p className="text-xs font-semibold">
                {diffPreview === 0 ? (
                  <span className="text-muted-foreground">Already matches — no adjustment needed.</span>
                ) : (
                  <span className={diffPreview > 0 ? 'text-positive' : 'text-negative'}>
                    Adjustment: {diffPreview > 0 ? '+' : '−'}
                    {formatMoney(Math.abs(diffPreview), account.currency, { signDisplay: 'never' })}{' '}
                    ({diffPreview > 0 ? 'income' : 'expense'})
                  </span>
                )}
              </p>
            )}
            <Button
              onClick={() => void reconcile()}
              loading={create.isPending || ensureAdjustmentCategory.isPending}
              disabled={!actual.trim()}
            >
              Apply
            </Button>
          </div>
        )}
      </Card>

      {/* Ledger */}
      <div>
        <div className="mb-2 flex items-center justify-between px-1">
          <h2 className="section-head text-[17px] text-foreground">Transactions</h2>
          <span className="font-numeric text-xs font-semibold text-muted-foreground">
            {transactions.length}
          </span>
        </div>
        {lt ? (
          <CenterSpinner />
        ) : transactions.length === 0 ? (
          <EmptyState title="No transactions yet" description="Activity for this account will show here." />
        ) : (
          <Card className={cn('divide-y divide-border px-4 py-1')}>
            {transactions.map((tx) => (
              <TransactionRow
                key={tx.id}
                tx={tx}
                accounts={accountMap}
                categories={categoryMap}
                splitCount={splitsByTx[tx.id]?.length ?? 0}
                onDelete={async (txId) => {
                  if (await confirm({ title: 'Delete this transaction?', tone: 'danger', confirmLabel: 'Delete' }))
                    del.mutate(txId)
                }}
              />
            ))}
          </Card>
        )}
      </div>

      <AccountForm open={editOpen} onClose={() => setEditOpen(false)} account={account} />
    </div>
  )
}
