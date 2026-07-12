import { useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Coins, Plus, RefreshCw, Trash2 } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Field, Input, Select } from '@/components/ui/Input'
import { PageHeader } from '@/components/ui/list'
import { EmptyState } from '@/components/ui/States'
import { CURRENCIES, CURRENCY_CODES, getCurrency } from '@/lib/currencies'
import { cn } from '@/lib/utils'
import { qk } from '@/lib/queryClient'
import { useAuth } from '@/features/auth/useAuth'
import { useFxRates, useUpsertFxRate, useDeleteFxRate } from '@/features/fx/api'
import { syncLiveRates } from '@/features/fx/liveRates'
import type { FxRate } from '@/types/db'

const today = () => new Date().toISOString().slice(0, 10)
const order = (c: string) => CURRENCY_CODES.indexOf(c)

/** Format a "base units per 1 foreign" rate with the base symbol and sensible precision. */
function formatRate(rate: number, base: string) {
  const sym = getCurrency(base).symbol
  const digits = rate >= 100 ? 0 : rate >= 1 ? 2 : 6
  return `${sym}${new Intl.NumberFormat(undefined, { maximumFractionDigits: digits }).format(rate)}`
}

export function CurrenciesPage() {
  const { profile } = useAuth()
  const base = profile?.base_currency ?? 'IDR'
  const qc = useQueryClient()

  const { data: rates = [] } = useFxRates()
  const upsert = useUpsertFxRate()
  const del = useDeleteFxRate()

  const foreigns = useMemo(() => CURRENCY_CODES.filter((c) => c !== base), [base])
  const [quote, setQuote] = useState(foreigns[0] ?? 'USD')
  const [rate, setRate] = useState('')
  const [asOf, setAsOf] = useState(today())
  const [refreshing, setRefreshing] = useState(false)

  // Latest rate per foreign currency against the current base.
  const latest = useMemo(() => {
    const byCode = new Map<string, FxRate>()
    for (const r of rates) {
      if (r.quote !== base) continue
      const cur = byCode.get(r.base)
      if (!cur || r.as_of > cur.as_of) byCode.set(r.base, r)
    }
    return [...byCode.values()].sort((a, b) => order(a.base) - order(b.base))
  }, [rates, base])

  const fiat = latest.filter((r) => !CURRENCIES[r.base]?.crypto)
  const crypto = latest.filter((r) => CURRENCIES[r.base]?.crypto)
  const lastUpdated = latest.reduce<string | null>((max, r) => (!max || r.as_of > max ? r.as_of : max), null)

  function parseRate(s: string): number | null {
    const n = parseFloat(s.replace(/[^0-9.]/g, ''))
    return Number.isFinite(n) && n > 0 ? n : null
  }

  async function save() {
    const value = parseRate(rate)
    if (!value || quote === base) return
    await upsert.mutateAsync({ base: quote, quote: base, rate: value, as_of: asOf })
    setRate('')
  }

  async function refresh() {
    setRefreshing(true)
    try {
      const n = await syncLiveRates(base, { force: true })
      if (n > 0) await qc.invalidateQueries({ queryKey: qk.fxRates })
    } catch {
      // offline / rate-limited — silent
    } finally {
      setRefreshing(false)
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <PageHeader title="Currencies" subtitle="Value foreign accounts in your base currency." />

      {/* Base + refresh strip */}
      <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary-soft text-base font-bold text-primary">
            {getCurrency(base).symbol}
          </span>
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
              Base currency
            </p>
            <p className="font-numeric text-lg font-extrabold leading-tight text-foreground">
              {base} · {getCurrency(base).name}
            </p>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <Button variant="secondary" size="sm" onClick={refresh} loading={refreshing}>
            <RefreshCw className={cn('h-3.5 w-3.5', refreshing && 'animate-spin')} /> Refresh
          </Button>
          <span className="text-xs font-medium text-muted-foreground">
            {lastUpdated ? `Updated ${lastUpdated}` : 'Auto-updates daily'}
          </span>
        </div>
      </Card>

      {/* Add / override */}
      <Card className="space-y-3 p-5">
        <p className="flex items-center gap-2 text-sm font-bold text-foreground">
          <Plus className="h-4 w-4 text-primary" /> Add or override a rate
        </p>
        <div className="grid gap-3 sm:grid-cols-[1.1fr_1.3fr_auto]">
          <Field label="1 unit of">
            <Select value={quote} onChange={(e) => setQuote(e.target.value)}>
              {foreigns.map((c) => (
                <option key={c} value={c}>
                  {c} — {getCurrency(c).name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={`equals, in ${base}`}>
            <div className="relative">
              <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm font-semibold text-muted-foreground">
                {getCurrency(base).symbol}
              </span>
              <Input
                inputMode="decimal"
                placeholder="0"
                value={rate}
                onChange={(e) => setRate(e.target.value)}
                className="pl-9"
              />
            </div>
          </Field>
          <Field label="As of">
            <Input type="date" value={asOf} max={today()} onChange={(e) => setAsOf(e.target.value)} />
          </Field>
        </div>
        <Button onClick={save} disabled={upsert.isPending || !parseRate(rate)} className="w-full sm:w-auto">
          Save rate
        </Button>
      </Card>

      {/* Rates list */}
      {latest.length === 0 ? (
        <Card className="p-2">
          <EmptyState
            icon={<Coins className="h-7 w-7" />}
            title="No rates yet"
            description="Rates sync automatically when you open the app, or add one above."
          />
        </Card>
      ) : (
        <Card className="space-y-4 p-5">
          {fiat.length > 0 && (
            <RateGroup
              title="Fiat"
              rows={fiat}
              base={base}
              onDelete={(id) => del.mutate(id)}
              deleting={del.isPending}
            />
          )}
          {crypto.length > 0 && (
            <RateGroup
              title="Crypto"
              rows={crypto}
              base={base}
              onDelete={(id) => del.mutate(id)}
              deleting={del.isPending}
            />
          )}
          <p className="border-t border-border/60 pt-3 text-xs font-medium text-muted-foreground">
            Estimates use the latest rate. Logged transactions keep the rate frozen at their own date,
            so past reports never shift.
          </p>
        </Card>
      )}
    </div>
  )
}

function RateGroup({
  title,
  rows,
  base,
  onDelete,
  deleting,
}: {
  title: string
  rows: FxRate[]
  base: string
  onDelete: (id: string) => void
  deleting: boolean
}) {
  return (
    <div>
      <h2 className="section-head mb-1 px-1 text-[17px] text-foreground">{title}</h2>
      <ul className="divide-y divide-border/60">
        {rows.map((r) => {
          const meta = getCurrency(r.base)
          const live = r.source !== 'manual'
          return (
            <li key={r.id} className="flex items-center gap-3 py-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface-muted text-sm font-bold text-foreground ring-1 ring-border">
                {meta.symbol}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-foreground">{r.base}</span>
                  <span className="truncate text-xs font-medium text-muted-foreground">{meta.name}</span>
                  <span
                    className={cn(
                      'inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-xs font-bold uppercase tracking-wide',
                      live ? 'bg-positive/10 text-positive' : 'bg-primary-soft text-primary',
                    )}
                  >
                    {live && <span className="h-1 w-1 rounded-full bg-positive" />}
                    {live ? 'Live' : 'Manual'}
                  </span>
                </div>
                <p className="text-xs font-medium text-muted-foreground">as of {r.as_of}</p>
              </div>
              <div className="text-right">
                <p className="font-numeric text-sm font-extrabold text-foreground">
                  {formatRate(r.rate, base)}
                </p>
                <p className="text-xs font-medium text-muted-foreground">per 1 {r.base}</p>
              </div>
              <button
                type="button"
                onClick={() => onDelete(r.id)}
                disabled={deleting}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-danger/10 hover:text-danger disabled:opacity-40"
                aria-label={`Delete ${r.base} rate`}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
