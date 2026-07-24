import { useMemo, useState } from 'react'
import { format } from 'date-fns'
import {
  Plus,
  Trash2,
  MessageCircle,
  ChevronDown,
  ArrowDownLeft,
  ArrowUpRight,
} from 'lucide-react'
import { BizHeaderAction } from '@/components/BizLayout'
import { Button } from '@/components/ui/Button'
import { CenterSpinner } from '@/components/ui/States'
import { useConfirm } from '@/components/ui/confirm-context'
import { useAuth } from '@/features/auth/useAuth'
import { useT } from '@/features/settings/language-context'
import { dateLocale } from '@/i18n'
import { formatMoney } from '@/lib/money'
import { cn } from '@/lib/utils'
import { useDebts, useDeleteDebt, type DebtWithContact } from '@/features/debts/api'
import { DebtForm } from '@/features/debts/DebtForm'
import { PaymentForm } from '@/features/debts/PaymentForm'
import type { DebtDirection } from '@/types/db'

const MS_DAY = 86_400_000
const today = () => new Date().toISOString().slice(0, 10)

function daysSince(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / MS_DAY)
}
function remainingOf(d: DebtWithContact) {
  return Math.max(0, d.amount - d.paid)
}

/** Normalize an Indonesian phone to wa.me digits: 08xx → 628xx. */
function waNumber(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  return digits.startsWith('0') ? '62' + digits.slice(1) : digits
}

/** Deterministic warm avatar color from a name. */
const AVATAR_COLORS = ['#e5484d', '#0072bc', '#7a5af0', '#0e9f5b', '#d97706', '#0a7d6f', '#c026a6']
function avatarColor(name: string): string {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return AVATAR_COLORS[h % AVATAR_COLORS.length]
}

interface PersonGroup {
  key: string
  name: string
  phone: string | null
  direction: DebtDirection
  currency: string
  debts: DebtWithContact[] // open only, newest first
  total: number
  oldestIso: string
  overdueDays: number
  isNew: boolean
}

function buildGroups(debts: DebtWithContact[], dir: DebtDirection) {
  const open = debts.filter((d) => d.direction === dir && d.status === 'open')
  const settled = debts.filter((d) => d.direction === dir && d.status === 'paid')

  const map = new Map<string, PersonGroup>()
  for (const d of open) {
    const name = d.contact?.name ?? '—'
    const key = d.contact?.id ?? `n:${name}`
    const overdue = d.due_date && d.due_date < today() ? daysSince(d.due_date) : 0
    const g = map.get(key)
    if (g) {
      g.debts.push(d)
      g.total += remainingOf(d)
      if (d.created_at < g.oldestIso) g.oldestIso = d.created_at
      g.overdueDays = Math.max(g.overdueDays, overdue)
    } else {
      map.set(key, {
        key,
        name,
        phone: d.contact?.phone ?? null,
        direction: dir,
        currency: d.currency,
        debts: [d],
        total: remainingOf(d),
        oldestIso: d.created_at,
        overdueDays: overdue,
        isNew: false,
      })
    }
  }
  const groups = [...map.values()]
  for (const g of groups) {
    g.debts.sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
    g.isNew = g.debts.length === 1 && daysSince(g.oldestIso) <= 1
  }
  // Overdue first, then biggest tab.
  groups.sort((a, b) => b.overdueDays - a.overdueDays || b.total - a.total)
  return { groups, settled }
}

export function DebtsPage() {
  const { profile } = useAuth()
  const base = profile?.base_currency ?? 'IDR'
  const { t } = useT()
  const { data: debts = [], isLoading } = useDebts()

  const [creating, setCreating] = useState(false)
  const [paying, setPaying] = useState<DebtWithContact | null>(null)
  const [dir, setDir] = useState<DebtDirection>('receivable')

  const rcv = useMemo(() => buildGroups(debts, 'receivable'), [debts])
  const pay = useMemo(() => buildGroups(debts, 'payable'), [debts])

  const owedToMe = rcv.groups.reduce((s, g) => s + g.total, 0)
  const iOwe = pay.groups.reduce((s, g) => s + g.total, 0)
  const overdueCount = rcv.groups.filter((g) => g.overdueDays > 0).length

  const active = dir === 'receivable' ? rcv : pay
  const settledInDir = active.settled

  // The back link, header and tab bar come from BizLayout — this page only
  // fills in the header action and the body below the tabs.
  return (
    <>
      {debts.length > 0 && (
        <BizHeaderAction>
          <button
            onClick={() => setCreating(true)}
            className="pressable flex h-11 shrink-0 items-center gap-1.5 rounded-2xl bg-foreground px-4 text-sm font-extrabold text-background"
          >
            <Plus className="h-4 w-4 stroke-[2.6]" />
            {t('debt.new')}
          </button>
        </BizHeaderAction>
      )}

      {isLoading ? (
        <div className="pt-16">
          <CenterSpinner />
        </div>
      ) : debts.length === 0 ? (
        <EmptyKasbon onAdd={() => setCreating(true)} />
      ) : (
        <div className="mt-5 space-y-5">
          {/* Hero — money out with people */}
          <div
            className="relative overflow-hidden rounded-[26px] px-5 pb-5 pt-5 text-white shadow-[0_18px_34px_-18px_rgba(11,110,120,0.7)]"
            style={{
              background:
                'radial-gradient(120% 140% at 85% -20%, rgba(255,255,255,0.26), transparent 55%), linear-gradient(135deg, #0e9f5b, #0a7d6f 55%, #0b6ea8)',
            }}
          >
            <svg
              aria-hidden
              viewBox="0 0 100 100"
              className="pointer-events-none absolute -bottom-7 -right-5 h-32 w-32 opacity-[0.16]"
              fill="#fff"
            >
              <circle cx="50" cy="50" r="46" opacity=".6" />
              <circle cx="50" cy="50" r="34" fill="none" stroke="#fff" strokeWidth="3" />
              <text x="50" y="64" fontSize="38" fontWeight="800" textAnchor="middle" fill="#fff">
                Rp
              </text>
            </svg>
            <p className="text-[13px] font-bold text-white/85">{t('debt.heroOut')}</p>
            <p className="mt-1 font-numeric text-[38px] font-extrabold leading-none tracking-tight">
              {formatMoney(owedToMe, base, { signDisplay: 'never' })}
            </p>
            <div className="mt-2.5 flex flex-wrap items-center gap-2 text-[12.5px] font-semibold text-white/85">
              <span>
                {rcv.groups.length === 0
                  ? t('debt.heroNoneOut')
                  : rcv.groups.length === 1
                    ? t('debt.heroFromOne')
                    : t('debt.heroFromMany', { n: rcv.groups.length })}
              </span>
              {overdueCount > 0 && (
                <span className="rounded-full bg-white/20 px-2 py-0.5 text-[11px] font-bold text-white">
                  {t('debt.overdueChip', { n: overdueCount })}
                </span>
              )}
            </div>
            {iOwe > 0 && (
              <div className="mt-3.5 flex items-center justify-between border-t border-dashed border-white/30 pt-3 text-[13px] font-semibold text-white/90">
                <span>{t('debt.oweSupplier')}</span>
                <b className="font-numeric font-extrabold">
                  {formatMoney(iOwe, base, { signDisplay: 'never' })}
                </b>
              </div>
            )}
          </div>

          {/* Direction filter */}
          <div className="flex gap-2.5">
            <FilterTab
              active={dir === 'receivable'}
              tone="receivable"
              icon={ArrowDownLeft}
              label={t('debt.filterRcv')}
              meta={t('debt.peopleAmount', {
                n: rcv.groups.length === 1 ? t('debt.onePerson') : t('debt.manyPeople', { n: rcv.groups.length }),
                amount: formatMoney(owedToMe, base, { signDisplay: 'never' }),
              })}
              onClick={() => setDir('receivable')}
            />
            <FilterTab
              active={dir === 'payable'}
              tone="payable"
              icon={ArrowUpRight}
              label={t('debt.filterPay')}
              meta={t('debt.peopleAmount', {
                n: pay.groups.length === 1 ? t('debt.onePerson') : t('debt.manyPeople', { n: pay.groups.length }),
                amount: formatMoney(iOwe, base, { signDisplay: 'never' }),
              })}
              onClick={() => setDir('payable')}
            />
          </div>

          {/* People */}
          {active.groups.length === 0 && settledInDir.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-border px-4 py-8 text-center text-sm font-medium text-muted-foreground">
              {dir === 'receivable' ? t('debt.heroNoneOut') : t('debt.oweSupplier')}
            </p>
          ) : (
            <div className="space-y-3">
              {active.groups.map((g) => (
                <PersonCard key={g.key} group={g} base={base} onPay={setPaying} />
              ))}
            </div>
          )}

          {/* Settled */}
          {settledInDir.length > 0 && (
            <div className="space-y-3">
              <h2 className="px-1 text-[12px] font-extrabold uppercase tracking-[0.08em] text-muted-foreground">
                {t('debt.settledHead')}
              </h2>
              <div className="space-y-2.5">
                {settledInDir.map((d) => (
                  <SettledRow key={d.id} debt={d} base={base} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <DebtForm open={creating} onClose={() => setCreating(false)} initialDirection={dir} />
      <PaymentForm open={Boolean(paying)} onClose={() => setPaying(null)} debt={paying} />
    </>
  )
}

function FilterTab({
  active,
  tone,
  icon: Icon,
  label,
  meta,
  onClick,
}: {
  active: boolean
  tone: DebtDirection
  icon: React.ComponentType<{ className?: string }>
  label: string
  meta: string
  onClick: () => void
}) {
  const isRcv = tone === 'receivable'
  return (
    <button
      onClick={onClick}
      className={cn(
        'pressable flex flex-1 flex-col items-start gap-0.5 rounded-2xl border px-3.5 py-3 text-left transition-colors',
        active
          ? isRcv
            ? 'border-transparent bg-positive text-white'
            : 'border-transparent bg-danger text-white'
          : 'border-border bg-surface text-muted-foreground',
      )}
    >
      <span className="flex items-center gap-1.5 text-[13px] font-extrabold">
        <Icon className="h-4 w-4" />
        {label}
      </span>
      <span className={cn('font-numeric text-[11px] font-bold', active ? 'text-white/80' : 'opacity-70')}>
        {meta}
      </span>
    </button>
  )
}

/** The signature "ticket" divider — a dashed tear with two notches cut into the sides. */
function TicketTear() {
  return (
    <div className="relative mx-4 border-t-2 border-dashed border-border">
      <span className="absolute -left-[26px] -top-[11px] h-5 w-5 rounded-full bg-background" />
      <span className="absolute -right-[26px] -top-[11px] h-5 w-5 rounded-full bg-background" />
    </div>
  )
}

function PersonCard({
  group,
  base,
  onPay,
}: {
  group: PersonGroup
  base: string
  onPay: (d: DebtWithContact) => void
}) {
  const { t } = useT()
  const del = useDeleteDebt()
  const confirm = useConfirm()
  const [open, setOpen] = useState(false)

  const isRcv = group.direction === 'receivable'
  const paidSoFar = group.debts.reduce((s, d) => s + d.paid, 0)
  const grandTotal = group.debts.reduce((s, d) => s + d.amount, 0)
  const pct = grandTotal > 0 ? Math.min(100, (paidSoFar / grandTotal) * 100) : 0

  const reminderHref =
    isRcv && group.phone
      ? `https://wa.me/${waNumber(group.phone)}?text=${encodeURIComponent(
          t('debt.waText', {
            name: group.name,
            amount: formatMoney(group.total, base, { signDisplay: 'never' }),
          }),
        )}`
      : null

  async function removeDebt(d: DebtWithContact) {
    if (
      await confirm({
        title: t('debt.deleteTitle'),
        message: t('debt.deleteMsg', { name: group.name }),
        tone: 'danger',
        confirmLabel: t('common.delete'),
        cancelLabel: t('common.cancel'),
      })
    )
      del.mutate(d.id)
  }

  return (
    <div className="rounded-[20px] border border-border bg-surface shadow-[0_8px_20px_-14px_rgba(15,30,48,0.4)]">
      {/* Head */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-3 px-4 py-3.5 text-left"
      >
        <span
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-lg font-extrabold text-white"
          style={{ backgroundColor: avatarColor(group.name) }}
        >
          {group.name.charAt(0).toUpperCase()}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-extrabold tracking-tight">{group.name}</span>
          <span className="mt-0.5 block truncate text-[12px] font-medium text-muted-foreground">
            {group.debts.length === 1
              ? t('debt.oneRecord')
              : t('debt.manyRecords', { n: group.debts.length })}
          </span>
        </span>
        <span className="flex shrink-0 flex-col items-end gap-1">
          <span
            className={cn(
              'font-numeric text-[17px] font-extrabold tracking-tight',
              isRcv ? 'text-positive' : 'text-danger',
            )}
          >
            {formatMoney(group.total, base, { signDisplay: 'never' })}
          </span>
          {group.overdueDays > 0 ? (
            <span className="rounded-full bg-warning/15 px-1.5 py-0.5 text-[10px] font-extrabold text-warning">
              {t('debt.chipOverdue', { n: group.overdueDays })}
            </span>
          ) : group.isNew ? (
            <span className="rounded-full bg-primary-soft px-1.5 py-0.5 text-[10px] font-extrabold text-primary">
              {t('debt.chipNew')}
            </span>
          ) : (
            <span className="text-[10.5px] font-semibold text-muted-foreground">
              {isRcv ? t('debt.remaining') : t('debt.mustPay')}
            </span>
          )}
        </span>
        <ChevronDown
          className={cn('h-[18px] w-[18px] shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')}
        />
      </button>

      {/* Detail */}
      {open && (
        <div className="pb-3">
          {paidSoFar > 0 && (
            <div className="mx-4 mb-3 h-1.5 overflow-hidden rounded-full bg-surface-muted">
              <div className="h-full rounded-full bg-positive" style={{ width: `${pct}%` }} />
            </div>
          )}
          <TicketTear />
          <div className="space-y-1 px-2 pt-3">
            {group.debts.map((d) => {
              const overdue = d.due_date != null && d.due_date < today()
              return (
                <div key={d.id} className="flex items-center gap-2 rounded-xl px-2 py-1.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13.5px] font-semibold">{d.note || t('debt.noNote')}</p>
                    <p className="mt-0.5 truncate text-[11px] font-medium text-muted-foreground">
                      {d.due_date ? (
                        <span className={cn(overdue && 'font-bold text-warning')}>
                          {t('debt.due', {
                            date: format(new Date(d.due_date), 'd MMM', { locale: dateLocale() }),
                          })}
                        </span>
                      ) : (
                        format(new Date(d.created_at), 'd MMM', { locale: dateLocale() })
                      )}
                    </p>
                  </div>
                  <span className="shrink-0 font-numeric text-[13.5px] font-extrabold">
                    {formatMoney(remainingOf(d), base, { signDisplay: 'never' })}
                  </span>
                  <button
                    onClick={() => onPay(d)}
                    className="pressable shrink-0 rounded-lg bg-primary-soft px-2.5 py-1.5 text-[12px] font-extrabold text-primary"
                  >
                    {isRcv ? t('debt.payShort') : t('debt.payBack')}
                  </button>
                  <button
                    onClick={() => removeDebt(d)}
                    disabled={del.isPending}
                    className="shrink-0 rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-danger/10 hover:text-danger"
                    aria-label={t('common.delete')}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              )
            })}
          </div>

          {reminderHref && (
            <div className="px-4 pt-2.5">
              <a
                href={reminderHref}
                target="_blank"
                rel="noopener noreferrer"
                className="pressable flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-3 text-[13.5px] font-extrabold"
                style={{ backgroundColor: '#25d366', color: '#08351c' }}
              >
                <MessageCircle className="h-[18px] w-[18px]" />
                {t('debt.remind')} · WhatsApp
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function SettledRow({ debt, base }: { debt: DebtWithContact; base: string }) {
  const { t } = useT()
  const del = useDeleteDebt()
  const confirm = useConfirm()
  const name = debt.contact?.name ?? '—'

  async function remove() {
    if (
      await confirm({
        title: t('debt.deleteTitle'),
        message: t('debt.deleteMsg', { name }),
        tone: 'danger',
        confirmLabel: t('common.delete'),
        cancelLabel: t('common.cancel'),
      })
    )
      del.mutate(debt.id)
  }

  return (
    <div className="flex items-center gap-3 rounded-2xl border border-border bg-surface px-4 py-3 opacity-80">
      <span
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-sm font-extrabold text-white"
        style={{ backgroundColor: avatarColor(name) }}
      >
        {name.charAt(0).toUpperCase()}
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 truncate text-[14px] font-bold">
          {name}
          <span className="shrink-0 rounded-full bg-positive/12 px-2 py-0.5 text-[10.5px] font-extrabold text-positive">
            {t('debt.chipPaid')}
          </span>
        </p>
      </div>
      <span className="shrink-0 font-numeric text-[13px] font-bold text-muted-foreground">
        {formatMoney(debt.amount, base, { signDisplay: 'never' })}
      </span>
      <button
        onClick={remove}
        disabled={del.isPending}
        className="shrink-0 rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-danger/10 hover:text-danger"
        aria-label={t('common.delete')}
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  )
}

function EmptyKasbon({ onAdd }: { onAdd: () => void }) {
  const { t } = useT()
  return (
    <div className="flex flex-col items-center px-4 pb-10 pt-6 text-center">
      <svg className="my-3 h-[138px] w-[168px]" viewBox="0 0 200 160" fill="none">
        <rect x="30" y="28" width="120" height="104" rx="12" fill="var(--surface)" stroke="var(--border)" strokeWidth="2.5" />
        <rect x="30" y="28" width="120" height="26" rx="12" fill="var(--primary-soft)" />
        <line x1="46" y1="70" x2="118" y2="70" stroke="var(--border)" strokeWidth="4" strokeLinecap="round" />
        <line x1="46" y1="86" x2="104" y2="86" stroke="var(--border)" strokeWidth="4" strokeLinecap="round" />
        <line x1="46" y1="102" x2="112" y2="102" stroke="var(--border)" strokeWidth="4" strokeLinecap="round" />
        <circle cx="150" cy="112" r="30" fill="var(--positive)" />
        <path d="M150 98v28M138 112h24" stroke="#fff" strokeWidth="5" strokeLinecap="round" />
      </svg>
      <h2 className="text-xl font-extrabold tracking-tight">{t('debt.emptyTitle')}</h2>
      <p className="mt-2 max-w-[280px] text-sm font-medium leading-relaxed text-muted-foreground">
        {t('debt.emptyBody')}
      </p>
      <Button size="lg" className="mt-5 shadow-[0_14px_26px_-12px_var(--primary)]" onClick={onAdd}>
        <Plus className="h-[18px] w-[18px]" />
        {t('debt.emptyCta')}
      </Button>
      <div className="mt-5 w-full max-w-[320px] space-y-2.5">
        <PickRow
          tone="positive"
          icon={ArrowDownLeft}
          title={t('debt.pickCustomer')}
          hint={t('debt.pickCustomerHint')}
          onClick={onAdd}
        />
        <PickRow
          tone="danger"
          icon={ArrowUpRight}
          title={t('debt.pickSupplier')}
          hint={t('debt.pickSupplierHint')}
          onClick={onAdd}
        />
      </div>
    </div>
  )
}

function PickRow({
  tone,
  icon: Icon,
  title,
  hint,
  onClick,
}: {
  tone: 'positive' | 'danger'
  icon: React.ComponentType<{ className?: string }>
  title: string
  hint: string
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="pressable flex w-full items-center gap-3 rounded-2xl border border-border bg-surface px-3.5 py-3 text-left"
    >
      <span
        className={cn(
          'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl',
          tone === 'positive' ? 'bg-positive/12 text-positive' : 'bg-danger/12 text-danger',
        )}
      >
        <Icon className="h-[18px] w-[18px]" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[13.5px] font-extrabold">{title}</span>
        <span className="block truncate text-[11.5px] font-medium text-muted-foreground">{hint}</span>
      </span>
    </button>
  )
}
