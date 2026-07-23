import { useMemo, useState } from 'react'
import { Plus, ChevronLeft, Wallet, List, Pencil, Trash2, PieChart } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Pill, ListCard, ListRow, IconChip } from '@/components/ui/list'
import { CenterSpinner, EmptyState } from '@/components/ui/States'
import { formatMoney } from '@/lib/money'
import { cn } from '@/lib/utils'
import { useAuth } from '@/features/auth/useAuth'
import { useAccounts, useBalances } from '@/features/accounts/api'
import { useFxRates } from '@/features/fx/api'
import { buildRateTable, convertMinor, rateBetween, type RateTable } from '@/features/fx/fx'
import { useTransactions } from '@/features/transactions/api'
import { indexById } from '@/lib/collections'
import { netWorthSeries, pickGranularity, type NetWorthDelta } from '@/features/reports/reports'
import { subMonths } from 'date-fns'
import { AccountForm } from '@/features/accounts/AccountForm'
import { accountTypeMeta } from '@/features/accounts/meta'
import type { Account } from '@/types/db'
import { useT } from '@/features/settings/language-context'
import { AreaChart, Area, ResponsiveContainer, XAxis, Tooltip } from 'recharts'
import { chartTooltipStyle as tooltipStyle } from '@/lib/chartTheme'
import { Link } from 'react-router-dom'

export function AccountsPage() {
  const { profile } = useAuth()
  const { t } = useT()
  const base = profile?.base_currency ?? 'IDR'
  const { data: accounts, isLoading } = useAccounts()
  const { data: balances = {} } = useBalances()
  const { data: fxRates = [] } = useFxRates()
  
  const to = useMemo(() => new Date(), [])
  const from = useMemo(() => subMonths(to, 6), [to])
  const { data: historyTxns = [] } = useTransactions({ from: from.toISOString(), limit: 5000 })
  
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

  const { net, assetsTotal, debtsTotal } = useMemo(() => {
    const counted = (a: Account) => !a.exclude_from_stats
    const assetsTotal = assets.filter(counted).reduce((s, a) => s + toBase(a), 0)
    const debtsTotal = liabilities.filter(counted).reduce((s, a) => s + Math.abs(toBase(a)), 0)
    return { net: assetsTotal - debtsTotal, assetsTotal, debtsTotal }
  }, [assets, liabilities, balances, rateTable, base])

  const netWorthHistory = useMemo(() => {
    const table = buildRateTable(fxRates, base)
    const acctById = indexById(accounts ?? [])
    const counts = (a: Account | undefined): a is Account =>
      !!a && !a.exclude_from_stats && rateBetween(a.currency, base, table) != null
    const valueOf = (minor: number, currency: string) => convertMinor(minor, currency, base, table) ?? 0

    const nwNow = (accounts ?? []).reduce(
      (s, a) => (counts(a) ? s + valueOf(balances[a.id] ?? a.opening_balance, a.currency) : s),
      0,
    )

    const deltas: NetWorthDelta[] = []
    for (const tx of historyTxns) {
      const a = acctById[tx.account_id]
      let d = 0
      if (tx.type === 'income') {
        if (counts(a)) d += valueOf(tx.amount, a.currency)
      } else if (tx.type === 'expense') {
        if (counts(a)) d -= valueOf(tx.amount, a.currency)
      } else {
        if (counts(a)) d -= valueOf(tx.amount, a.currency)
        const b = tx.counter_account_id ? acctById[tx.counter_account_id] : undefined
        if (counts(b)) d += valueOf(tx.counter_amount ?? tx.amount, b.currency)
      }
      if (d !== 0) deltas.push({ t: +new Date(tx.occurred_at), d })
    }

    const series = netWorthSeries(nwNow, deltas, from, to, pickGranularity(from, to))
    return series.length > 1 ? series : [{ label: 'Past', value: nwNow }, { label: 'Today', value: nwNow }]
  }, [accounts, balances, historyTxns, fxRates, base, from, to])

  function openNew() {
    setEditing(null)
    setFormOpen(true)
  }

  function handleEdit(e: React.MouseEvent, account: Account) {
    e.preventDefault()
    e.stopPropagation()
    setEditing(account)
    setFormOpen(true)
  }

  function handleDelete(e: React.MouseEvent, account: Account) {
    e.preventDefault()
    e.stopPropagation()
    // In a real app this would call an API or show a confirmation modal
    console.log('Delete account', account.id)
  }

  const hasLiabilities = liabilities.length > 0
  const formattedNet = formatMoney(net, base)
  
  const netParts = formattedNet.split(' ')
  const currencyPart = netParts.length > 1 ? netParts[0] : ''
  const amountPart = netParts.length > 1 ? netParts.slice(1).join(' ') : formattedNet

  return (
    <div className="w-full space-y-6 pb-20">
      <div className="space-y-4">
        <Link to="/" className="flex items-center gap-2 text-muted-foreground hover:text-foreground w-max transition-colors">
          <div className="flex h-6 w-6 items-center justify-center rounded-full border border-border bg-surface">
            <ChevronLeft className="h-4 w-4" />
          </div>
          <span className="text-sm font-semibold">Accounts</span>
        </Link>
        
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-extrabold text-foreground">Accounts</h1>
          <Pill variant="line" icon={Plus} onClick={openNew}>
            New account
          </Pill>
        </div>
      </div>

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
          <div className="card-surface flex flex-col md:flex-row rounded-[24px] gap-6 p-4 shadow-sm sm:p-6 md:gap-8">
            <div className="flex-1 h-[220px] min-w-0">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={netWorthHistory} margin={{ top: 20, right: 0, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorBlue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#4A72B2" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#4A72B2" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 13, fill: '#888', fontWeight: 500 }} dy={10} minTickGap={20} />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    formatter={(value) => [formatMoney(Number(value), base), 'Net Worth']}
                  />
                  <Area type="monotone" dataKey="value" stroke="#4A72B2" strokeWidth={3} fillOpacity={1} fill="url(#colorBlue)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            <div className="flex min-w-0 shrink-0 flex-col justify-center space-y-5 md:w-[360px]">
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-1.5">
                  NET WORTH
                </p>
                <div className="flex items-baseline gap-2 whitespace-normal text-[32px] font-extrabold leading-none tracking-tight text-foreground sm:whitespace-nowrap sm:text-[40px]">
                  {currencyPart && <span className="text-2xl font-bold">{currencyPart}</span>}
                  <span>{amountPart}</span>
                </div>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:gap-4">
                <div className="flex flex-1 flex-col justify-center overflow-hidden rounded-[20px] border border-[#C8E6C9] bg-[#E8F5E9] p-4 dark:border-green-900/50 dark:bg-green-950/40">
                  <p className="flex items-center gap-1.5 text-xs font-bold text-green-900 dark:text-green-300">
                    <PieChart className="h-3.5 w-3.5" /> Total Assets
                  </p>
                  <p className="font-numeric mt-0.5 break-words text-[15px] font-extrabold text-green-900 dark:text-green-300">
                    {formatMoney(assetsTotal, base)}
                  </p>
                </div>

                <div className="flex flex-1 flex-col justify-center overflow-hidden rounded-[20px] border border-[#FFE0B2] bg-[#FFF3E0] p-4 dark:border-orange-900/50 dark:bg-orange-950/40">
                  <p className="text-xs font-bold text-orange-900 dark:text-orange-300">Total Debt</p>
                  <p className="font-numeric mt-0.5 break-words text-[15px] font-extrabold text-orange-900 dark:text-orange-300">
                    {formatMoney(debtsTotal, base)}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div className="flex items-center justify-between px-1">
                <h2 className="text-lg font-bold text-foreground">My Assets</h2>
                <Wallet className="h-[18px] w-[18px] text-muted-foreground" />
              </div>
              <ListCard className="rounded-[24px]">
                {assets.map((account) => (
                  <AccountRow
                    key={account.id}
                    account={account}
                    balance={balanceOf(account)}
                    base={base}
                    rateTable={rateTable}
                    onEdit={handleEdit}
                    onDelete={handleDelete}
                  />
                ))}
              </ListCard>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between px-1">
                <h2 className="text-lg font-bold text-foreground">My Liabilities</h2>
                <List className="h-[18px] w-[18px] text-muted-foreground" />
              </div>
              {hasLiabilities ? (
                <ListCard className="rounded-[24px]">
                  {liabilities.map((account) => (
                    <AccountRow
                      key={account.id}
                      account={account}
                      balance={balanceOf(account)}
                      base={base}
                      rateTable={rateTable}
                      onEdit={handleEdit}
                      onDelete={handleDelete}
                    />
                  ))}
                </ListCard>
              ) : (
                <ListCard className="rounded-[24px] p-8 flex items-center justify-center text-muted-foreground">
                  <span className="text-sm font-medium">No liabilities found.</span>
                </ListCard>
              )}
            </div>
          </div>
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
  onEdit,
  onDelete,
}: {
  account: Account
  balance: number
  base: string
  rateTable: RateTable
  onEdit: (e: React.MouseEvent, account: Account) => void
  onDelete: (e: React.MouseEvent, account: Account) => void
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
      chevron={false}
      leading={<IconChip icon={meta.icon} color={color} />}
      title={account.name}
      subtitle={subtitle}
      trailing={
        <div className="flex items-center gap-3 sm:gap-4">
          <div className="hidden items-center gap-2 sm:flex">
            <button
              onClick={(e) => onEdit(e, account)}
              className="flex h-[32px] w-[32px] items-center justify-center rounded-full bg-surface-muted hover:brightness-95 transition-all"
            >
              <Pencil className="h-[14px] w-[14px] text-muted-foreground" />
            </button>
            <button
              onClick={(e) => onDelete(e, account)}
              className="flex h-[32px] w-[32px] items-center justify-center rounded-full bg-surface-muted hover:bg-danger/10 hover:text-danger transition-all"
            >
              <Trash2 className="h-[14px] w-[14px] text-muted-foreground" />
            </button>
          </div>
          <div className="text-right min-w-[90px]">
            <p
              className={cn(
                'font-numeric text-[15px] font-extrabold tracking-tight',
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
        </div>
      }
    />
  )
}
