import { useMemo, useState } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { PageHeader, Pill, Section, ListCard, ListRow, IconChip } from '@/components/ui/list'
import { CenterSpinner, EmptyState } from '@/components/ui/States'
import { formatMoney } from '@/lib/money'
import { cn } from '@/lib/utils'
import { useAuth } from '@/features/auth/useAuth'
import { useAccounts, useBalances } from '@/features/accounts/api'
import { useFxRates } from '@/features/fx/api'
import { buildRateTable, convertMinor, type RateTable } from '@/features/fx/fx'
import { AccountForm } from '@/features/accounts/AccountForm'
import { accountTypeMeta } from '@/features/accounts/meta'
import type { Account } from '@/types/db'
import { useT } from '@/features/settings/language-context'

export function AccountsPage() {
  const { profile } = useAuth()
  const { t } = useT()
  const base = profile?.base_currency ?? 'IDR'
  const { data: accounts, isLoading } = useAccounts()
  const { data: balances = {} } = useBalances()
  const { data: fxRates = [] } = useFxRates()
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
  // plain sum nets out; we also break out the two sides for the summary card.
  // Accounts flagged exclude_from_stats are left out of every total.
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

  const hasLiabilities = liabilities.length > 0

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title={t('acc.title')}
        action={
          accounts && accounts.length > 0 ? (
            <Pill variant="tint" icon={Plus} onClick={openNew}>
              {t('acc.new')}
            </Pill>
          ) : undefined
        }
      />

      {isLoading ? (
        <CenterSpinner />
      ) : !accounts || accounts.length === 0 ? (
        <EmptyState
          title={t('acc.emptyTitle')}
          description={t('acc.emptyDesc')}
          action={<Button onClick={openNew}>{t('acc.emptyAction')}</Button>}
        />
      ) : (
        <>
          {/* Net-worth summary */}
          <div className="card-surface rounded-[22px] p-5">
            <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
              {t('acc.netWorth')}
            </p>
            <p className="mt-1.5 font-numeric text-[32px] font-extrabold leading-none tracking-tight text-foreground">
              {formatMoney(net, base)}
            </p>
            {hasLiabilities && (
              <div className="mt-5 flex gap-8">
                <div>
                  <p className="text-xs font-semibold text-muted-foreground">{t('acc.assets')}</p>
                  <p className="mt-0.5 font-numeric text-sm font-extrabold text-foreground">
                    {formatMoney(assetsTotal, base)}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-muted-foreground">{t('acc.debts')}</p>
                  <p className="mt-0.5 font-numeric text-sm font-extrabold text-danger">
                    {formatMoney(debtsTotal, base)}
                  </p>
                </div>
              </div>
            )}
          </div>

          <Section title={hasLiabilities ? t('acc.assets') : undefined}>
            <ListCard>
              {assets.map((account) => (
                <AccountRow
                  key={account.id}
                  account={account}
                  balance={balanceOf(account)}
                  base={base}
                  rateTable={rateTable}
                />
              ))}
            </ListCard>
          </Section>

          {hasLiabilities && (
            <Section title={t('acc.liabilities')}>
              <ListCard>
                {liabilities.map((account) => (
                  <AccountRow
                    key={account.id}
                    account={account}
                    balance={balanceOf(account)}
                    base={base}
                    rateTable={rateTable}
                  />
                ))}
              </ListCard>
            </Section>
          )}
        </>
      )}

      <AccountForm open={formOpen} onClose={() => setFormOpen(false)} account={editing} />
    </div>
  )
}

function AccountRow({
  account,
  balance,
  base,
  rateTable,
}: {
  account: Account
  balance: number
  base: string
  rateTable: RateTable
}) {
  const { t } = useT()
  const meta = accountTypeMeta(account.type)
  const isLiability = account.is_liability
  const color = account.color ?? '#0072BC'
  const baseEstimate =
    account.currency === base ? null : convertMinor(balance, account.currency, base, rateTable)

  const subtitle = [t(meta.label), account.exclude_from_stats ? t('acc.excluded') : null]
    .filter(Boolean)
    .join(' · ')

  return (
    <ListRow
      to={`/accounts/${account.id}`}
      leading={<IconChip icon={meta.icon} color={color} />}
      title={account.name}
      subtitle={subtitle}
      trailing={
        <div className="text-right">
          <p
            className={cn(
              'font-numeric text-sm font-extrabold tracking-tight',
              isLiability ? 'text-danger' : 'text-foreground',
            )}
          >
            {formatMoney(balance, account.currency)}
          </p>
          {baseEstimate != null && (
            <p className="mt-0.5 font-numeric text-xs font-semibold text-muted-foreground">
              ≈ {formatMoney(baseEstimate, base)}
            </p>
          )}
        </div>
      }
    />
  )
}
