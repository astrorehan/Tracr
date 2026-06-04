import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Pencil, Archive } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { CenterSpinner, EmptyState } from '@/components/ui/States'
import { formatMoney } from '@/lib/money'
import { useAuth } from '@/features/auth/useAuth'
import { useAccounts, useArchiveAccount, useBalances } from '@/features/accounts/api'
import { AccountForm } from '@/features/accounts/AccountForm'
import { accountTypeMeta } from '@/features/accounts/meta'
import type { Account } from '@/types/db'

export function AccountsPage() {
  const { profile } = useAuth()
  const base = profile?.base_currency ?? 'IDR'
  const { data: accounts, isLoading } = useAccounts()
  const { data: balances = {} } = useBalances()
  const archive = useArchiveAccount()
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Account | null>(null)

  // Headline total: base-currency accounts only (no FX yet).
  const baseTotal = useMemo(() => {
    if (!accounts) return 0
    return accounts
      .filter((a) => a.currency === base)
      .reduce((sum, a) => sum + (balances[a.id] ?? a.opening_balance), 0)
  }, [accounts, balances, base])

  function openNew() {
    setEditing(null)
    setFormOpen(true)
  }
  function openEdit(account: Account) {
    setEditing(account)
    setFormOpen(true)
  }

  return (
    <div className="space-y-6">
      {/* Header with unified balance metric */}
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight lg:text-3xl">Accounts</h1>
          {accounts && accounts.length > 0 && (
            <p className="mt-1.5 text-sm font-medium text-muted-foreground">
              <span className="font-numeric font-bold text-foreground">
                {formatMoney(baseTotal, base)}
              </span>{' '}
              across {accounts.length} account{accounts.length > 1 ? 's' : ''}
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
          description="Add your cash, bank cards, e-wallets, crypto or stock accounts to start tracking."
          action={<Button onClick={openNew}>Add your first account</Button>}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {accounts.map((account) => {
            const meta = accountTypeMeta(account.type)
            const Icon = meta.icon
            const balance = balances[account.id] ?? account.opening_balance
            const color = account.color ?? '#9a8c74'
            return (
              <Card key={account.id} hoverable className="group p-0">
                <Link to={`/accounts/${account.id}`} className="block p-5">
                <div className="flex items-start justify-between">
                  <div
                    className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border transition-transform duration-300 group-hover:scale-105"
                    style={{ backgroundColor: `${color}1f`, color, borderColor: `${color}33` }}
                  >
                    <Icon className="h-5 w-5 stroke-[2.2]" />
                  </div>
                  <span className="rounded-lg border border-border bg-surface-muted/60 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                    {meta.label}
                  </span>
                </div>

                <div className="mt-4">
                  <p className="truncate text-base font-bold leading-tight text-foreground">
                    {account.name}
                  </p>
                  <p className="mt-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {account.currency}
                  </p>
                </div>

                <div className="mt-4 flex items-end justify-between">
                  <p className="font-numeric text-xl font-extrabold leading-none tracking-tight text-foreground">
                    {formatMoney(balance, account.currency)}
                  </p>
                  <div className="flex gap-1.5 opacity-0 transition-opacity duration-200 group-hover:opacity-100 max-sm:opacity-100">
                    <button
                      onClick={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        openEdit(account)
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
                        if (confirm(`Archive "${account.name}"?`)) archive.mutate(account.id)
                      }}
                      className="rounded-lg border border-transparent p-1.5 text-muted-foreground transition-colors hover:border-danger/20 hover:bg-danger/10 hover:text-danger"
                      aria-label="Archive"
                    >
                      <Archive className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
                </Link>
              </Card>
            )
          })}

          {/* Create-account tile, always last */}
          <button
            onClick={openNew}
            className="pressable group flex min-h-[168px] flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border bg-surface/40 p-5 text-muted-foreground transition-all duration-300 hover:border-primary/40 hover:bg-primary/5 hover:text-primary"
          >
            <span className="flex h-12 w-12 items-center justify-center rounded-xl border border-border bg-surface-muted/60 transition-colors group-hover:border-primary/30 group-hover:bg-primary/10">
              <Plus className="h-5 w-5 stroke-[2.2] transition-transform duration-300 group-hover:rotate-90" />
            </span>
            <span className="text-sm font-bold">New account</span>
          </button>
        </div>
      )}

      <AccountForm open={formOpen} onClose={() => setFormOpen(false)} account={editing} />
    </div>
  )
}
