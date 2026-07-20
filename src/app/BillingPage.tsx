import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { Coins, Gift, Loader2, MinusCircle, PlusCircle, Settings2, TimerOff } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { PageHeader, Section, ListCard, ListRow, IconChip } from '@/components/ui/list'
import { useT } from '@/features/settings/language-context'
import { qk } from '@/lib/queryClient'
import { dateLocale, type MsgKey } from '@/i18n'
import { formatMoney } from '@/lib/money'
import { cn } from '@/lib/utils'
import {
  useCreditBalance,
  useBillingPlans,
  useCreditPacks,
  useCreditLedger,
  useStartTopup,
} from '@/features/billing/api'
import { midtransConfigured, loadSnapJs, snapPay } from '@/features/billing/snap'
import type { CreditLedgerEntry, CreditLedgerReason, CreditPack } from '@/types/db'

const LEDGER_META: Record<CreditLedgerReason, { icon: typeof Coins; labelKey: MsgKey }> = {
  monthly_grant: { icon: Gift, labelKey: 'billing.ledger.monthly_grant' },
  consume: { icon: MinusCircle, labelKey: 'billing.ledger.consume' },
  topup_purchase: { icon: PlusCircle, labelKey: 'billing.ledger.topup_purchase' },
  expire: { icon: TimerOff, labelKey: 'billing.ledger.expire' },
  admin_adjustment: { icon: Settings2, labelKey: 'billing.ledger.admin_adjustment' },
}

export function BillingPage() {
  const { t } = useT()
  const queryClient = useQueryClient()
  const { data: balance, isLoading: balanceLoading } = useCreditBalance()
  const { data: plans = [] } = useBillingPlans()
  const { data: packs = [] } = useCreditPacks()
  const { data: ledger = [] } = useCreditLedger(30)
  const startTopup = useStartTopup()

  const [buyingPackId, setBuyingPackId] = useState<string | null>(null)
  const [buyError, setBuyError] = useState<string | null>(null)

  const proPlan = plans.find((p) => p.plan === 'pro')
  const isPro = balance?.plan === 'pro'
  const granted = balance?.subscription_granted ?? 0
  const used = balance?.subscription_used ?? 0
  const subPct = granted > 0 ? Math.min(100, Math.round((used / granted) * 100)) : 0

  async function buyPack(pack: CreditPack) {
    setBuyError(null)
    setBuyingPackId(pack.id)
    try {
      const { token, error } = await startTopup.mutateAsync(pack.id)
      if (error || !token) throw new Error(error ?? 'no token')
      await loadSnapJs()
      const result = await snapPay(token)
      // The webhook is the source of truth for whether credits actually
      // landed — this just makes the UI catch up once Midtrans is done,
      // instead of waiting for the next natural refetch.
      if (result === 'success' || result === 'pending') {
        void queryClient.invalidateQueries({ queryKey: qk.creditsBalance })
        void queryClient.invalidateQueries({ queryKey: qk.creditLedger })
      }
    } catch (e) {
      setBuyError(e instanceof Error ? e.message : t('billing.buyError'))
    } finally {
      setBuyingPackId(null)
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <PageHeader title={t('billing.title')} />

      {/* Current plan */}
      <Card className="flex items-center justify-between gap-3 p-5">
        <div>
          <p className="text-xs font-bold text-muted-foreground">{t('billing.currentPlan')}</p>
          <p className="text-lg font-extrabold text-foreground">
            {t(isPro ? 'billing.planPro' : 'billing.planFree')}
          </p>
        </div>
        {!isPro && (
          <Button disabled className="rounded-full opacity-60" title={t('billing.comingSoon')}>
            {t('billing.upgrade')}
          </Button>
        )}
      </Card>

      {/* Two separate pools — never merged into one number here */}
      <div className="grid gap-3 sm:grid-cols-2">
        <Card className="space-y-2.5 p-5">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold text-muted-foreground">{t('billing.subscriptionPool')}</p>
            <Coins className="h-4 w-4 text-primary" />
          </div>
          <p className="text-2xl font-extrabold tabular-nums text-foreground">
            {balanceLoading ? '—' : (balance?.subscription_remaining ?? 0)}
          </p>
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-surface-muted">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${subPct}%` }}
            />
          </div>
          {balance && (
            <p className="text-xs font-medium text-muted-foreground">
              {t('billing.usedOfGranted', { used, granted })}
            </p>
          )}
          <p className="text-[11px] font-medium text-muted-foreground">{t('billing.resetsMonthly')}</p>
        </Card>

        <Card className="space-y-2.5 p-5">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold text-muted-foreground">{t('billing.topupPool')}</p>
            <Coins className="h-4 w-4 text-primary" />
          </div>
          <p className="text-2xl font-extrabold tabular-nums text-foreground">
            {balanceLoading ? '—' : (balance?.topup_balance ?? 0)}
          </p>
          <p className="text-[11px] font-medium text-muted-foreground">{t('billing.topupNeverExpires')}</p>
        </Card>
      </div>

      {/* Upgrade teaser — checkout isn't wired up yet (no payment gateway live) */}
      {!isPro && proPlan && (
        <Card className="p-5">
          <p className="text-sm font-bold text-foreground">{t('billing.upgrade')}</p>
          <p className="mt-1 text-xs font-medium leading-relaxed text-muted-foreground">
            {t('billing.upgradeComingSoon', { credits: proPlan.monthly_credits })}
          </p>
        </Card>
      )}

      {/* Top-up packs. Self-gated on midtransConfigured (VITE_MIDTRANS_CLIENT_KEY)
          — stays a read-only "coming soon" preview until real keys are set,
          no code change needed to go live later. */}
      {packs.length > 0 && (
        <Section title={t('billing.buyCredits')}>
          <div className="grid gap-3 sm:grid-cols-3">
            {packs.map((pack) => (
              <Card key={pack.id} className={cn('space-y-1.5 p-4 text-center', !midtransConfigured && 'opacity-70')}>
                <p className="text-lg font-extrabold tabular-nums text-foreground">{pack.credits}</p>
                <p className="text-xs font-semibold text-muted-foreground">
                  {formatMoney(pack.price_idr, 'IDR')}
                </p>
                {midtransConfigured ? (
                  <Button
                    size="sm"
                    className="w-full rounded-full"
                    disabled={buyingPackId !== null}
                    onClick={() => void buyPack(pack)}
                  >
                    {buyingPackId === pack.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      t('billing.buy')
                    )}
                  </Button>
                ) : (
                  <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                    {t('billing.packComingSoon')}
                  </p>
                )}
              </Card>
            ))}
          </div>
          {buyError && (
            <p className="px-1 text-xs font-semibold text-danger">{buyError}</p>
          )}
        </Section>
      )}

      {/* Transparency: every grant/consume/purchase/expiry, one row each */}
      <Section title={t('billing.history')}>
        <ListCard>
          {ledger.length === 0 ? (
            <p className="px-1 py-6 text-center text-sm font-medium text-muted-foreground">
              {t('billing.historyEmpty')}
            </p>
          ) : (
            ledger.map((entry) => <LedgerRow key={entry.id} entry={entry} />)
          )}
        </ListCard>
      </Section>
    </div>
  )
}

function LedgerRow({ entry }: { entry: CreditLedgerEntry }) {
  const { t } = useT()
  const meta = LEDGER_META[entry.reason]
  const positive = entry.delta > 0
  return (
    <ListRow
      leading={<IconChip icon={meta.icon} color={positive ? 'green' : 'slate'} />}
      title={t(meta.labelKey)}
      subtitle={format(new Date(entry.created_at), 'd MMM, HH:mm', { locale: dateLocale() })}
      trailing={
        <span
          className={cn(
            'text-sm font-bold tabular-nums',
            positive ? 'text-positive' : 'text-muted-foreground',
          )}
        >
          {positive ? `+${entry.delta}` : entry.delta}
        </span>
      }
    />
  )
}
