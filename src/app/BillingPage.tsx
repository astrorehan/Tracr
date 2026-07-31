import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import {
  ArrowUpRight,
  Check,
  Coins,
  Gift,
  Loader2,
  MinusCircle,
  PlusCircle,
  Settings2,
  Sparkles,
  ShieldCheck,
  TimerOff,
  Zap,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { AnimatedNumber } from '@/components/ui/AnimatedNumber'
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
  totalRemaining,
} from '@/features/billing/api'
import { PaymentSoonModal, type SoonItem } from '@/features/billing/PaymentSoonModal'
import { midtransConfigured, loadSnapJs, snapPay } from '@/features/billing/snap'
import type { CreditLedgerEntry, CreditLedgerReason, CreditPack } from '@/types/db'

const LEDGER_META: Record<CreditLedgerReason, { icon: typeof Coins; labelKey: MsgKey }> = {
  monthly_grant: { icon: Gift, labelKey: 'billing.ledger.monthly_grant' },
  consume: { icon: MinusCircle, labelKey: 'billing.ledger.consume' },
  topup_purchase: { icon: PlusCircle, labelKey: 'billing.ledger.topup_purchase' },
  expire: { icon: TimerOff, labelKey: 'billing.ledger.expire' },
  admin_adjustment: { icon: Settings2, labelKey: 'billing.ledger.admin_adjustment' },
}

/** The payment methods the checkout will offer. Names, not logos — no borrowed
 *  brand marks sitting in the UI. */
const PAY_METHODS = ['QRIS', 'GoPay', 'OVO', 'DANA', 'ShopeePay', 'Transfer bank', 'Kartu']

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
  // Non-null while the "payment isn't switched on yet" dialog is up.
  const [soon, setSoon] = useState<SoonItem | null>(null)

  const proPlan = plans.find((p) => p.plan === 'pro')
  const freePlan = plans.find((p) => p.plan === 'free')
  const isPro = balance?.plan === 'pro'
  const freeCredits = freePlan?.monthly_credits ?? 10
  const proCredits = proPlan?.monthly_credits ?? 0
  const proPrice = proPlan?.price_monthly_idr ?? 0

  // Cheapest per credit wins the loud button — one obvious pick per row.
  const bestPackId = packs.reduce<CreditPack | null>(
    (best, p) =>
      !best || p.price_idr / p.credits < best.price_idr / best.credits ? p : best,
    null,
  )?.id

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

  /** Buy buttons stay live and look it. Until a real Midtrans key is set they
   *  open the dialog instead of Snap; the moment one is set, the same button
   *  goes through to checkout with no code change. */
  function handleBuyPack(pack: CreditPack) {
    if (midtransConfigured) return void buyPack(pack)
    setSoon({
      title: t('billing.packTitle', { n: pack.credits }),
      meta: t('billing.packMeta'),
      price: formatMoney(pack.price_idr, 'IDR'),
    })
  }

  /** Pro is a recurring subscription — that checkout isn't built at all yet, so
   *  this always lands in the dialog. */
  function handleUpgrade() {
    setSoon({
      title: t('billing.planPro'),
      meta: t('billing.proCreditsMeta', { n: proCredits }),
      price: t('billing.perMonth', { price: formatMoney(proPrice, 'IDR') }),
    })
  }

  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader title={t('billing.title')} subtitle={t('billing.subtitle')} />

      <CreditWallet balance={balance} loading={balanceLoading} isPro={isPro} />

      {/* Plans, side by side — what you're on vs what you'd move to */}
      <Section title={t('billing.plansHead')}>
        <div className="grid gap-3.5 sm:grid-cols-2">
          <FreePlanCard credits={freeCredits} current={!isPro} />
          <ProPlanCard
            credits={proCredits}
            price={proPrice}
            freeCredits={freeCredits}
            current={isPro}
            onUpgrade={handleUpgrade}
          />
        </div>
      </Section>

      {/* Top-ups — no subscription, credits that sit there until used */}
      {packs.length > 0 && (
        <Section title={t('billing.buyCredits')}>
          <p className="-mt-1 px-1 text-[12.5px] font-medium text-muted-foreground">
            {t('billing.buyCreditsHint')}
          </p>
          <div className="grid gap-3.5 sm:grid-cols-3">
            {packs.map((pack) => (
              <PackCard
                key={pack.id}
                pack={pack}
                basePack={packs[0]}
                best={pack.id === bestPackId}
                busy={buyingPackId === pack.id}
                disabled={buyingPackId !== null}
                onBuy={() => handleBuyPack(pack)}
              />
            ))}
          </div>
          {buyError && <p className="px-1 text-xs font-semibold text-danger">{buyError}</p>}

          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border border-dashed border-border px-4 py-3">
            <span className="flex items-center gap-1.5 text-[12px] font-extrabold text-foreground">
              <ShieldCheck className="h-4 w-4 text-positive" />
              {t('billing.securePay')}
            </span>
            <span className="flex flex-wrap gap-1.5">
              {PAY_METHODS.map((m) => (
                <span
                  key={m}
                  className="rounded-md bg-surface-muted px-2 py-1 text-[10.5px] font-bold text-muted-foreground"
                >
                  {m}
                </span>
              ))}
            </span>
          </div>
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

      <PaymentSoonModal
        open={soon !== null}
        onClose={() => setSoon(null)}
        item={soon}
        freeCredits={freeCredits}
      />
    </div>
  )
}

/**
 * The one "wow" surface on this page: total credits on a deep-blue slab, with
 * the two pools shown as one bar split in two — they spend as one number but
 * expire on different rules, so both stay named underneath.
 */
function CreditWallet({
  balance,
  loading,
  isPro,
}: {
  balance: ReturnType<typeof useCreditBalance>['data']
  loading: boolean
  isPro: boolean
}) {
  const { t } = useT()
  const monthly = balance?.subscription_remaining ?? 0
  const topup = balance?.topup_balance ?? 0
  const granted = balance?.subscription_granted ?? 0
  const used = balance?.subscription_used ?? 0
  const total = totalRemaining(balance)

  // The bar's full width is everything the user could still hold this month:
  // what the plan granted plus whatever top-up sits on the side.
  const capacity = Math.max(granted + topup, 1)
  const monthlyPct = (monthly / capacity) * 100
  const topupPct = (topup / capacity) * 100

  return (
    <div
      className="relative overflow-hidden rounded-[28px] px-6 py-6 text-white shadow-[0_24px_46px_-26px_rgba(0,74,132,0.9)]"
      style={{
        backgroundImage:
          'radial-gradient(120% 130% at 8% -20%, rgba(255,255,255,0.26), transparent 55%), linear-gradient(152deg, #0a5fa4 0%, #0072bc 44%, #1b9be0 100%)',
      }}
    >
      {/* dot grid — this page's own texture, fading out to the right */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          backgroundImage: 'radial-gradient(rgba(255,255,255,0.5) 1px, transparent 1px)',
          backgroundSize: '13px 13px',
          maskImage: 'linear-gradient(105deg, transparent 38%, black 130%)',
          WebkitMaskImage: 'linear-gradient(105deg, transparent 38%, black 130%)',
        }}
      />

      <div className="relative">
        <div className="flex items-start justify-between gap-3">
          <p className="text-[13px] font-bold text-white/85">{t('billing.walletLabel')}</p>
          <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-white/18 px-3 py-1 text-[11.5px] font-extrabold backdrop-blur-sm">
            <Sparkles className="h-3.5 w-3.5" />
            {t(isPro ? 'billing.planPro' : 'billing.planFree')}
          </span>
        </div>

        <p className="mt-1.5 flex items-end gap-2">
          <AnimatedNumber
            value={loading ? 0 : total}
            format={(v) => String(v)}
            className="font-numeric text-[46px] font-extrabold leading-none tracking-tight"
          />
          <span className="pb-1 text-[15px] font-bold text-white/80">{t('billing.creditsUnit')}</span>
        </p>

        <div className="mt-5 flex h-2.5 w-full gap-1 overflow-hidden rounded-full bg-white/22">
          <span className="rounded-full bg-white transition-all" style={{ width: `${monthlyPct}%` }} />
          <span className="rounded-full bg-[#a8e9ff] transition-all" style={{ width: `${topupPct}%` }} />
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <PoolLegend
            dotClass="bg-white"
            label={t('billing.subscriptionPool')}
            value={monthly}
            hint={t('billing.usedOfGranted', { used, granted })}
            foot={t('billing.resetsShort')}
          />
          <PoolLegend
            dotClass="bg-[#a8e9ff]"
            label={t('billing.topupPool')}
            value={topup}
            hint={t('billing.topupNeverExpires')}
            foot={t('billing.topupShort')}
          />
        </div>

        <p className="mt-5 flex items-center gap-2 border-t border-dashed border-white/25 pt-3.5 text-[12px] font-semibold text-white/85">
          <Zap className="h-3.5 w-3.5 shrink-0" />
          {t('billing.creditMeaning')}
        </p>
      </div>
    </div>
  )
}

function PoolLegend({
  dotClass,
  label,
  value,
  hint,
  foot,
}: {
  dotClass: string
  label: string
  value: number
  hint: string
  foot: string
}) {
  return (
    <div className="min-w-0">
      <p className="flex items-center gap-1.5 text-[11.5px] font-bold text-white/80">
        <span className={cn('h-2 w-2 shrink-0 rounded-full', dotClass)} />
        <span className="truncate">{label}</span>
      </p>
      <p className="mt-0.5 font-numeric text-[19px] font-extrabold leading-none">{value}</p>
      <p className="mt-1 truncate text-[10.5px] font-semibold text-white/70">{hint}</p>
      <p className="truncate text-[10.5px] font-medium text-white/55">{foot}</p>
    </div>
  )
}

function PlanPerk({ children, tone = 'muted' }: { children: string; tone?: 'muted' | 'strong' }) {
  return (
    <li className="flex items-start gap-2">
      <Check
        className={cn(
          'mt-[3px] h-3.5 w-3.5 shrink-0 stroke-[3]',
          tone === 'strong' ? 'text-primary' : 'text-positive',
        )}
      />
      <span
        className={cn(
          'text-[12.5px] font-semibold leading-snug',
          tone === 'strong' ? 'text-foreground' : 'text-muted-foreground',
        )}
      >
        {children}
      </span>
    </li>
  )
}

function FreePlanCard({ credits, current }: { credits: number; current: boolean }) {
  const { t } = useT()
  return (
    <div className="card-surface flex flex-col rounded-[24px] p-5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[15px] font-extrabold tracking-tight">{t('billing.planFree')}</p>
        {current && (
          <span className="rounded-full bg-surface-muted px-2.5 py-1 text-[10.5px] font-extrabold uppercase tracking-wide text-muted-foreground">
            {t('billing.currentBadge')}
          </span>
        )}
      </div>
      <p className="mt-2 font-numeric text-[26px] font-extrabold leading-none tracking-tight">
        {formatMoney(0, 'IDR')}
      </p>
      <p className="mt-1 text-[11.5px] font-semibold text-muted-foreground">
        {t('billing.freeForever')}
      </p>
      <ul className="mt-4 space-y-2">
        <PlanPerk>{t('billing.perkMonthly', { n: credits })}</PlanPerk>
        <PlanPerk>{t('billing.perkReset')}</PlanPerk>
        <PlanPerk>{t('billing.perkAllFeatures')}</PlanPerk>
      </ul>
    </div>
  )
}

function ProPlanCard({
  credits,
  price,
  freeCredits,
  current,
  onUpgrade,
}: {
  credits: number
  price: number
  freeCredits: number
  current: boolean
  onUpgrade: () => void
}) {
  const { t } = useT()
  const multiple = freeCredits > 0 ? Math.round(credits / freeCredits) : 0

  return (
    // A 1.5px gradient rim instead of a border — the one card on the page that
    // is allowed to shout.
    <div className="rounded-[25px] bg-gradient-to-b from-primary to-[#1b9be0] p-[1.5px] shadow-[0_18px_34px_-22px_var(--primary)]">
      <div className="flex h-full flex-col rounded-[23.5px] bg-surface p-5">
        <div className="flex items-center justify-between gap-2">
          <p className="flex items-center gap-1.5 text-[15px] font-extrabold tracking-tight">
            <Sparkles className="h-4 w-4 text-primary" />
            {t('billing.planPro')}
          </p>
          <span
            className={cn(
              'rounded-full px-2.5 py-1 text-[10.5px] font-extrabold uppercase tracking-wide',
              current ? 'bg-surface-muted text-muted-foreground' : 'bg-primary-soft text-primary',
            )}
          >
            {t(current ? 'billing.currentBadge' : 'billing.recommended')}
          </span>
        </div>

        <p className="mt-2 flex items-baseline gap-1.5">
          <span className="font-numeric text-[26px] font-extrabold leading-none tracking-tight">
            {formatMoney(price, 'IDR')}
          </span>
          <span className="text-[12px] font-bold text-muted-foreground">
            {t('billing.perMonthSuffix')}
          </span>
        </p>
        <p className="mt-1 text-[11.5px] font-semibold text-muted-foreground">
          {t('billing.billedMonthly')}
        </p>

        <ul className="mt-4 space-y-2">
          <PlanPerk tone="strong">{t('billing.perkMonthly', { n: credits })}</PlanPerk>
          {multiple > 1 && <PlanPerk tone="strong">{t('billing.perkMultiple', { n: multiple })}</PlanPerk>}
          <PlanPerk tone="strong">{t('billing.perkHeavy')}</PlanPerk>
        </ul>

        {!current && (
          <Button
            size="lg"
            className="mt-5 w-full rounded-2xl"
            onClick={onUpgrade}
          >
            {t('billing.upgrade')}
            <ArrowUpRight className="h-[18px] w-[18px]" />
          </Button>
        )}
      </div>
    </div>
  )
}

function PackCard({
  pack,
  basePack,
  best,
  busy,
  disabled,
  onBuy,
}: {
  pack: CreditPack
  /** The smallest pack — the yardstick every "cheaper per credit" claim uses. */
  basePack: CreditPack
  /** Cheapest per credit: gets the ring and the solid button. */
  best: boolean
  busy: boolean
  disabled: boolean
  onBuy: () => void
}) {
  const { t } = useT()
  const perCredit = pack.price_idr / pack.credits
  const basePerCredit = basePack.price_idr / basePack.credits
  const savePct = basePerCredit > 0 ? Math.round((1 - perCredit / basePerCredit) * 100) : 0

  return (
    <div
      className={cn(
        'card-surface card-hover relative flex flex-col items-center rounded-[22px] px-4 pb-4 pt-6 text-center',
        best && 'border-primary/45 shadow-[0_16px_30px_-22px_var(--primary)]',
      )}
    >
      {savePct >= 5 && (
        <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-positive px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide text-white shadow-[0_6px_14px_-6px_var(--positive)]">
          {t('billing.savePct', { n: savePct })}
        </span>
      )}
      <p className="font-numeric text-[30px] font-extrabold leading-none tracking-tight">
        {pack.credits}
      </p>
      <p className="mt-1 text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
        {t('billing.creditsUnit')}
      </p>
      <p className="mt-3 font-numeric text-[15px] font-extrabold">
        {formatMoney(pack.price_idr, 'IDR')}
      </p>
      <p className="mt-0.5 text-[10.5px] font-semibold text-muted-foreground">
        {t('billing.perCredit', { price: formatMoney(Math.round(perCredit), 'IDR') })}
      </p>
      <Button
        size="sm"
        variant={best ? 'primary' : 'secondary'}
        className="mt-3.5 w-full rounded-full"
        disabled={disabled}
        onClick={onBuy}
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : t('billing.buy')}
      </Button>
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
