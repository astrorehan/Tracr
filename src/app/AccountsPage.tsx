import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Pencil, Archive } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { CenterSpinner, EmptyState } from '@/components/ui/States'
import { useConfirm } from '@/components/ui/confirm'
import { formatMoney } from '@/lib/money'
import { cn } from '@/lib/utils'
import { useAuth } from '@/features/auth/useAuth'
import { useAccounts, useArchiveAccount, useBalances } from '@/features/accounts/api'
import { useFxRates } from '@/features/fx/api'
import { buildRateTable, convertMinor, type RateTable } from '@/features/fx/fx'
import { AccountForm } from '@/features/accounts/AccountForm'
import { accountTypeMeta } from '@/features/accounts/meta'
import type { Account } from '@/types/db'

export function AccountsPage() {
  const { profile } = useAuth()
  const base = profile?.base_currency ?? 'IDR'
  const { data: accounts, isLoading } = useAccounts()
  const { data: balances = {} } = useBalances()
  const { data: fxRates = [] } = useFxRates()
  const archive = useArchiveAccount()
  const confirm = useConfirm()
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Account | null>(null)

  const rateTable = useMemo(() => buildRateTable(fxRates, base), [fxRates, base])

  const balanceOf = (a: Account) => balances[a.id] ?? a.opening_balance
  const toBase = (a: Account) => convertMinor(balanceOf(a), a.currency, base, rateTable) ?? 0

  const { assets, liabilities } = useMemo(() => {
    const assets: Account[] = []
    const liabilities: Account[] = []
    for (const a of accounts ?? []) (a.is_liability ? liabilities : assets).push(a)
    return { assets, liabilities }
  }, [accounts])

  // Net worth = assets − debts. Liability balances are already negative, so the
  // plain sum nets out; we also break out the two sides for the header. Accounts
  // flagged exclude_from_stats are left out of every total.
  const { net, assetsTotal, debtsTotal } = useMemo(() => {
    const counted = (a: Account) => !a.exclude_from_stats
    const assetsTotal = assets.filter(counted).reduce((s, a) => s + toBase(a), 0)
    const debtsTotal = liabilities.filter(counted).reduce((s, a) => s + Math.abs(toBase(a)), 0)
    return { net: assetsTotal - debtsTotal, assetsTotal, debtsTotal }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assets, liabilities, balances, rateTable, base])

  function openNew() {
    setEditing(null)
    setFormOpen(true)
  }
  function openEdit(account: Account) {
    setEditing(account)
    setFormOpen(true)
  }
  async function handleArchive(account: Account) {
    if (
      await confirm({
        title: `Archive "${account.name}"?`,
        message: 'It moves out of your active accounts but keeps its history.',
        confirmLabel: 'Archive',
      })
    )
      archive.mutate(account.id)
  }

  const hasLiabilities = liabilities.length > 0

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight lg:text-3xl">Accounts</h1>
          {accounts && accounts.length > 0 && (
            <p className="mt-1.5 text-sm font-medium text-muted-foreground">
              <span className="font-numeric font-bold text-foreground">{formatMoney(net, base)}</span>{' '}
              net worth
              {hasLiabilities && (
                <>
                  {' · '}
                  <span className="font-numeric font-semibold text-foreground">
                    {formatMoney(assetsTotal, base)}
                  </span>{' '}
                  assets ·{' '}
                  <span className="font-numeric font-semibold text-danger">
                    {formatMoney(debtsTotal, base)}
                  </span>{' '}
                  debts
                </>
              )}
            </p>
          )}
        </div>
        <Button size="md" onClick={openNew}>
          <Plus className="h-4 w-4 stroke-[2.5]" /> New account
        </Button>
      </header>

      {isLoading ? (
        <CenterSpinner />
      ) : !accounts || accounts.length === 0 ? (
        <EmptyState
          title="No accounts yet"
          description="Add your cash, bank cards, e-wallets, crypto, stocks — even credit cards and loans — to start tracking."
          action={<Button onClick={openNew}>Add your first account</Button>}
        />
      ) : (
        <div className="space-y-7">
          <Section title={hasLiabilities ? 'Assets' : null}>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {assets.map((account) => (
                <AccountCard
                  key={account.id}
                  account={account}
                  balance={balanceOf(account)}
                  base={base}
                  rateTable={rateTable}
                  onEdit={() => openEdit(account)}
                  onArchive={() => handleArchive(account)}
                />
              ))}
              <NewAccountTile onClick={openNew} />
            </div>
          </Section>

          {hasLiabilities && (
            <Section title="Liabilities">
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {liabilities.map((account) => (
                  <AccountCard
                    key={account.id}
                    account={account}
                    balance={balanceOf(account)}
                    base={base}
                    rateTable={rateTable}
                    onEdit={() => openEdit(account)}
                    onArchive={() => handleArchive(account)}
                  />
                ))}
              </div>
            </Section>
          )}
        </div>
      )}

      <AccountForm open={formOpen} onClose={() => setFormOpen(false)} account={editing} />
    </div>
  )
}

function Section({ title, children }: { title: string | null; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      {title && (
        <h2 className="section-head px-1 text-[17px] text-foreground">{title}</h2>
      )}
      {children}
    </section>
  )
}

function AccountCard({
  account,
  balance,
  base,
  rateTable,
  onEdit,
  onArchive,
}: {
  account: Account
  balance: number
  base: string
  rateTable: RateTable
  onEdit: () => void
  onArchive: () => void
}) {
  const meta = accountTypeMeta(account.type)
  const Icon = meta.icon
  const isLiability = account.is_liability
  const baseEstimate =
    account.currency === base ? null : convertMinor(balance, account.currency, base, rateTable)
  const color = account.color ?? '#9a8c74'

  // Credit-card utilization: how much of the limit is used, and what's left.
  const limit = account.credit_limit ?? 0
  const owed = Math.abs(balance)
  const showUtil = isLiability && limit > 0
  const utilPct = showUtil ? Math.min(100, (owed / limit) * 100) : 0
  const available = limit - owed
  const utilColor = utilPct >= 90 ? 'var(--danger)' : utilPct >= 70 ? '#f59e0b' : color

  return (
    <Card hoverable className="group p-0">
      <Link to={`/accounts/${account.id}`} className="block p-5">
        <div className="flex items-start justify-between">
          <div
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border transition-transform duration-300 group-hover:scale-105"
            style={{ backgroundColor: `${color}1f`, color, borderColor: `${color}33` }}
          >
            <Icon className="h-5 w-5 stroke-[2.2]" />
          </div>
          <span
            className={cn(
              'rounded-lg border px-2 py-0.5 text-xs font-bold uppercase tracking-wide',
              isLiability
                ? 'border-danger/30 bg-danger/10 text-danger'
                : 'border-border bg-surface-muted/60 text-muted-foreground',
            )}
          >
            {meta.label}
          </span>
        </div>

        <div className="mt-4">
          <p className="truncate text-base font-bold leading-tight text-foreground">{account.name}</p>
          <p className="mt-0.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {account.currency}
            {isLiability ? ' · owed' : ''}
            {account.exclude_from_stats ? ' · excluded' : ''}
          </p>
        </div>

        <div className="mt-4 flex items-end justify-between">
          <div>
            <p
              className={cn(
                'font-numeric text-xl font-extrabold leading-none tracking-tight',
                isLiability ? 'text-danger' : 'text-foreground',
              )}
            >
              {formatMoney(balance, account.currency)}
            </p>
            {baseEstimate != null && (
              <p className="mt-1 font-numeric text-xs font-semibold text-muted-foreground">
                ≈ {formatMoney(baseEstimate, base)}
              </p>
            )}
          </div>
          <div className="flex gap-1.5 opacity-0 transition-opacity duration-200 group-hover:opacity-100 max-sm:opacity-100">
            <button
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                onEdit()
              }}
              className="rounded-lg border border-transparent p-1.5 text-muted-foreground transition-colors hover:border-border hover:bg-surface-muted hover:text-foreground"
              aria-label="Edit"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                onArchive()
              }}
              className="rounded-lg border border-transparent p-1.5 text-muted-foreground transition-colors hover:border-danger/20 hover:bg-danger/10 hover:text-danger"
              aria-label="Archive"
            >
              <Archive className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {showUtil && (
          <div className="mt-3.5">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-muted">
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${utilPct}%`, backgroundColor: utilColor }}
              />
            </div>
            <p className="mt-1.5 text-xs font-semibold text-muted-foreground">
              {utilPct.toFixed(0)}% of {formatMoney(limit, account.currency, { signDisplay: 'never' })}{' '}
              ·{' '}
              {available >= 0
                ? `${formatMoney(available, account.currency, { signDisplay: 'never' })} available`
                : `over by ${formatMoney(-available, account.currency, { signDisplay: 'never' })}`}
            </p>
          </div>
        )}
      </Link>
    </Card>
  )
}

function NewAccountTile({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="pressable group flex min-h-[168px] flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border bg-surface/40 p-5 text-muted-foreground transition-all duration-300 hover:border-primary/40 hover:bg-primary/5 hover:text-primary"
    >
      <span className="flex h-12 w-12 items-center justify-center rounded-xl border border-border bg-surface-muted/60 transition-colors group-hover:border-primary/30 group-hover:bg-primary/10">
        <Plus className="h-5 w-5 stroke-[2.2] transition-transform duration-300 group-hover:rotate-90" />
      </span>
      <span className="text-sm font-bold">New account</span>
    </button>
  )
}
