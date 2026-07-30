import { useMemo, useState } from 'react'
import { MessageCircle, Plus, Search, Users, EyeOff, ChevronDown } from 'lucide-react'
import { BizHeaderAction } from '@/components/BizLayout'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Segmented } from '@/components/ui/Segmented'
import { ListSkeleton } from '@/components/ui/States'
import { useAuth } from '@/features/auth/useAuth'
import { useT } from '@/features/settings/language-context'
import { formatMoney } from '@/lib/money'
import { cn } from '@/lib/utils'
import { useActiveBook } from '@/features/books/useActiveBook'
import { useContacts, useDebts, tallyByContact, type ContactTally } from '@/features/debts/api'
import { ContactForm } from '@/features/debts/ContactForm'
import { DebtForm } from '@/features/debts/DebtForm'
import { avatarColor, waNumber } from '@/features/debts/wa'
import type { Contact } from '@/types/db'

type KindFilter = 'all' | 'customer' | 'supplier'

const EMPTY_TALLY: ContactTally = {
  owesMe: 0,
  iOwe: 0,
  records: 0,
  openRecords: 0,
  overdueDays: 0,
  currency: null,
}

/** Does this person answer to the kind filter? 'both' answers to either side. */
function matchesKind(c: Contact, filter: KindFilter): boolean {
  return filter === 'all' || c.kind === filter || c.kind === 'both'
}

function matchesQuery(c: Contact, q: string): boolean {
  if (!q) return true
  const hay = `${c.name} ${c.phone ?? ''} ${c.note ?? ''}`.toLowerCase()
  return hay.includes(q)
}

export function ContactsPage() {
  const { t } = useT()
  const { profile } = useAuth()
  const { activeBook } = useActiveBook()
  const isPersonal = activeBook?.type === 'personal'
  const base = profile?.base_currency ?? 'IDR'

  // Archived people are fetched too and split out below, so the "hidden" drawer
  // never costs a second round trip.
  const { data: contacts = [], isLoading } = useContacts(true)
  const { data: debts = [] } = useDebts()
  const tallies = useMemo(() => tallyByContact(debts), [debts])

  const [q, setQ] = useState('')
  const [kindFilter, setKindFilter] = useState<KindFilter>('all')
  const [showHidden, setShowHidden] = useState(false)
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<Contact | null>(null)
  const [notingFor, setNotingFor] = useState<Contact | null>(null)

  const query = q.trim().toLowerCase()

  const { active, hidden } = useMemo(() => {
    const withTally = contacts.map((c) => ({ c, tally: tallies.get(c.id) ?? EMPTY_TALLY }))
    // Money still moving floats to the top; everyone else is A-Z.
    const rank = (r: { tally: ContactTally }) => r.tally.owesMe + r.tally.iOwe
    const sorted = withTally.sort(
      (a, b) => rank(b) - rank(a) || a.c.name.localeCompare(b.c.name),
    )
    return {
      active: sorted.filter(
        (r) => !r.c.is_archived && matchesKind(r.c, kindFilter) && matchesQuery(r.c, query),
      ),
      hidden: sorted.filter((r) => r.c.is_archived && matchesQuery(r.c, query)),
    }
  }, [contacts, tallies, kindFilter, query])

  const owedToMe = active.reduce((s, r) => s + r.tally.owesMe, 0)
  const iOwe = active.reduce((s, r) => s + r.tally.iOwe, 0)
  const peopleCount = contacts.filter((c) => !c.is_archived).length

  return (
    <>
      {peopleCount > 0 && (
        <BizHeaderAction>
          <button
            onClick={() => setCreating(true)}
            className="pressable flex h-11 shrink-0 items-center gap-1.5 rounded-2xl bg-foreground px-4 text-sm font-extrabold text-background"
          >
            <Plus className="h-4 w-4 stroke-[2.6]" />
            {t('ct.new')}
          </button>
        </BizHeaderAction>
      )}

      {isLoading ? (
        <div className="pt-4">
          <ListSkeleton rows={5} />
        </div>
      ) : peopleCount === 0 && hidden.length === 0 ? (
        <EmptyContacts onAdd={() => setCreating(true)} />
      ) : (
        <div className="mt-5 space-y-4">
          {/* Who is on the book, and how much is in play with them. */}
          <div className="grid grid-cols-3 gap-2.5">
            <StatTile label={t('ct.statPeople')} value={String(peopleCount)} />
            <StatTile
              label={t('debt.filterRcv')}
              value={formatMoney(owedToMe, base, { signDisplay: 'never' })}
              tone="positive"
            />
            <StatTile
              label={t('debt.filterPay')}
              value={formatMoney(iOwe, base, { signDisplay: 'never' })}
              tone="danger"
            />
          </div>

          <div className="relative">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t('ct.searchPh')}
              className="pl-10"
              aria-label={t('ct.searchPh')}
            />
          </div>

          {!isPersonal && (
            <Segmented
              value={kindFilter}
              onChange={setKindFilter}
              size="sm"
              options={[
                { value: 'all', label: t('ct.filterAll') },
                { value: 'customer', label: t('ct.kindCustomer') },
                { value: 'supplier', label: t('ct.kindSupplier') },
              ]}
              aria-label={t('ct.kind')}
            />
          )}

          {active.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-border px-4 py-8 text-center text-sm font-medium text-muted-foreground">
              {query ? t('ct.noMatch', { q: q.trim() }) : t('ct.noneInFilter')}
            </p>
          ) : (
            <div className="space-y-2.5">
              {active.map(({ c, tally }) => (
                <ContactRow
                  key={c.id}
                  contact={c}
                  tally={tally}
                  base={base}
                  isPersonal={isPersonal}
                  onEdit={() => setEditing(c)}
                  onNote={() => setNotingFor(c)}
                />
              ))}
            </div>
          )}

          {hidden.length > 0 && (
            <div className="space-y-2.5 pt-1">
              <button
                onClick={() => setShowHidden((v) => !v)}
                className="flex w-full items-center gap-2 px-1 text-[12px] font-extrabold uppercase tracking-[0.08em] text-muted-foreground"
              >
                <EyeOff className="h-3.5 w-3.5" />
                {t('ct.hiddenHead', { n: hidden.length })}
                <ChevronDown
                  className={cn('h-4 w-4 transition-transform', showHidden && 'rotate-180')}
                />
              </button>
              {showHidden &&
                hidden.map(({ c, tally }) => (
                  <ContactRow
                    key={c.id}
                    contact={c}
                    tally={tally}
                    base={base}
                    isPersonal={isPersonal}
                    onEdit={() => setEditing(c)}
                    onNote={() => setNotingFor(c)}
                  />
                ))}
            </div>
          )}
        </div>
      )}

      <ContactForm open={creating} onClose={() => setCreating(false)} />
      <ContactForm
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        contact={editing}
        tally={editing ? tallies.get(editing.id) : undefined}
      />
      <DebtForm
        open={Boolean(notingFor)}
        onClose={() => setNotingFor(null)}
        initialDirection={notingFor?.kind === 'supplier' ? 'payable' : 'receivable'}
        initialContactId={notingFor?.id}
      />
    </>
  )
}

function StatTile({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone?: 'positive' | 'danger'
}) {
  return (
    <div className="rounded-2xl border border-border bg-surface px-3 py-2.5">
      <p className="truncate text-[10.5px] font-bold uppercase tracking-[0.06em] text-muted-foreground">
        {label}
      </p>
      <p
        className={cn(
          'mt-0.5 truncate font-numeric text-[15px] font-extrabold tracking-tight',
          tone === 'positive' && 'text-positive',
          tone === 'danger' && 'text-danger',
        )}
      >
        {value}
      </p>
    </div>
  )
}

function ContactRow({
  contact,
  tally,
  base,
  isPersonal,
  onEdit,
  onNote,
}: {
  contact: Contact
  tally: ContactTally
  base: string
  isPersonal?: boolean
  onEdit: () => void
  onNote: () => void
}) {
  const { t } = useT()

  const kindLabel = isPersonal
    ? null
    : contact.kind === 'supplier'
      ? t('ct.kindSupplier')
      : contact.kind === 'both'
        ? t('ct.kindBoth')
        : t('ct.kindCustomer')

  const sub = contact.phone || contact.note || (kindLabel ?? t('ct.noPhone'))
  const net = tally.owesMe - tally.iOwe
  const hasOpen = tally.owesMe > 0 || tally.iOwe > 0

  const waHref = contact.phone
    ? `https://wa.me/${waNumber(contact.phone)}${
        tally.owesMe > 0
          ? `?text=${encodeURIComponent(
              t('debt.waText', {
                name: contact.name,
                amount: formatMoney(tally.owesMe, base, { signDisplay: 'never' }),
              }),
            )}`
          : ''
      }`
    : null

  return (
    <div
      className={cn(
        'flex items-center gap-2 rounded-2xl border border-border bg-surface pr-2.5 shadow-[0_8px_20px_-16px_rgba(15,30,48,0.4)]',
        contact.is_archived && 'opacity-65',
      )}
    >
      <button onClick={onEdit} className="flex min-w-0 flex-1 items-center gap-3 py-3 pl-3.5 text-left">
        <span
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-base font-extrabold text-white"
          style={{ backgroundColor: avatarColor(contact.name) }}
        >
          {contact.name.charAt(0).toUpperCase()}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span className="truncate text-[14.5px] font-extrabold tracking-tight">{contact.name}</span>
            {kindLabel && contact.kind === 'both' && (
              <span className="shrink-0 rounded-full bg-primary-soft px-1.5 py-0.5 text-[10px] font-extrabold text-primary">
                {kindLabel}
              </span>
            )}
          </span>
          <span className="mt-0.5 block truncate text-[11.5px] font-medium text-muted-foreground">
            {sub}
            {tally.records > 0 && (
              <>
                {' · '}
                {tally.records === 1 ? t('debt.oneRecord') : t('debt.manyRecords', { n: tally.records })}
              </>
            )}
          </span>
        </span>
        <span className="flex shrink-0 flex-col items-end gap-0.5">
          {hasOpen ? (
            <span
              className={cn(
                'font-numeric text-[14.5px] font-extrabold tracking-tight',
                net >= 0 ? 'text-positive' : 'text-danger',
              )}
            >
              {formatMoney(Math.abs(net), base, { signDisplay: 'never' })}
            </span>
          ) : (
            <span className="text-[11.5px] font-semibold text-muted-foreground">{t('ct.clear')}</span>
          )}
          {tally.overdueDays > 0 && (
            <span className="rounded-full bg-warning/15 px-1.5 py-0.5 text-[10px] font-extrabold text-warning">
              {t('debt.chipOverdue', { n: tally.overdueDays })}
            </span>
          )}
        </span>
      </button>

      {waHref && (
        <a
          href={waHref}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={t('debt.remind')}
          className="pressable shrink-0 rounded-xl p-2"
          style={{ color: '#128c4a' }}
        >
          <MessageCircle className="h-[18px] w-[18px]" />
        </a>
      )}
      <button
        onClick={onNote}
        aria-label={t('ct.noteDebt')}
        className="pressable shrink-0 rounded-xl bg-primary-soft p-2 text-primary"
      >
        <Plus className="h-[18px] w-[18px] stroke-[2.6]" />
      </button>
    </div>
  )
}

function EmptyContacts({ onAdd }: { onAdd: () => void }) {
  const { t } = useT()
  return (
    <div className="flex flex-col items-center px-4 pb-10 pt-8 text-center">
      <span className="flex h-16 w-16 items-center justify-center rounded-3xl bg-primary-soft text-primary">
        <Users className="h-8 w-8" />
      </span>
      <h2 className="mt-4 text-xl font-extrabold tracking-tight">{t('ct.emptyTitle')}</h2>
      <p className="mt-2 max-w-[300px] text-sm font-medium leading-relaxed text-muted-foreground">
        {t('ct.emptyBody')}
      </p>
      <Button size="lg" className="mt-5 shadow-[0_14px_26px_-12px_var(--primary)]" onClick={onAdd}>
        <Plus className="h-[18px] w-[18px]" />
        {t('ct.emptyCta')}
      </Button>
    </div>
  )
}
