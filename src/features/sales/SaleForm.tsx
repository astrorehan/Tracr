import { useMemo, useState } from 'react'
import { Minus, Plus, Trash2 } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Field, Input, Select } from '@/components/ui/Input'
import { useT } from '@/features/settings/language-context'
import { formatMoney } from '@/lib/money'
import { useAccounts } from '@/features/accounts/api'
import { useCreateSale, saleTotal, type SaleLine } from './api'

interface Props {
  open: boolean
  onClose: () => void
  /** The cart, owned by the page so the POS grid and this sheet stay in sync. */
  lines: SaleLine[]
  onLinesChange: (lines: SaleLine[]) => void
  currency: string
}

export function SaleForm({ open, onClose, lines, onLinesChange, currency }: Props) {
  const { t } = useT()
  return (
    <Modal open={open} onClose={onClose} title={t('sale.title')} description={t('sale.subtitle')}>
      {open && (
        <SaleFormBody
          onClose={onClose}
          lines={lines}
          onLinesChange={onLinesChange}
          currency={currency}
        />
      )}
    </Modal>
  )
}

function SaleFormBody({
  onClose,
  lines,
  onLinesChange,
  currency,
}: {
  onClose: () => void
  lines: SaleLine[]
  onLinesChange: (lines: SaleLine[]) => void
  currency: string
}) {
  const { t } = useT()
  const { data: accounts = [] } = useAccounts()
  const createSale = useCreateSale()

  const [accountId, setAccountId] = useState('')
  const [customer, setCustomer] = useState('')
  const [occurredAt, setOccurredAt] = useState(() => new Date().toISOString().slice(0, 10))
  const [error, setError] = useState<string | null>(null)

  const selectedAccountId = accountId || accounts[0]?.id || ''
  const total = useMemo(() => saleTotal(lines), [lines])
  const profit = useMemo(
    () => lines.reduce((s, l) => s + Math.round(l.qty * (l.product.price - l.product.cost)), 0),
    [lines],
  )

  function setQty(id: string, qty: number) {
    onLinesChange(
      qty <= 0
        ? lines.filter((l) => l.product.id !== id)
        : lines.map((l) => (l.product.id === id ? { ...l, qty } : l)),
    )
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (lines.length === 0) return setError(t('sale.errItem'))
    if (!selectedAccountId) return setError(t('sale.errAccount'))

    try {
      await createSale.mutateAsync({
        accountId: selectedAccountId,
        currency,
        lines,
        occurredAt: new Date(occurredAt).toISOString(),
        customer: customer.trim() || null,
      })
      onLinesChange([])
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('acc.form.errGeneric'))
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Nota — the receipt of what's being sold */}
      <div className="overflow-hidden rounded-2xl border border-border">
        <div className="space-y-1 bg-surface-muted/40 p-3">
          {lines.map(({ product, qty }) => (
            <div key={product.id} className="flex items-center gap-2 py-1">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-foreground">{product.name}</p>
                <p className="font-numeric text-xs font-medium text-muted-foreground">
                  {formatMoney(Math.round(qty * product.price), currency, { signDisplay: 'never' })}
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                <QtyButton icon={Minus} onClick={() => setQty(product.id, qty - 1)} label="−" />
                <span className="w-6 text-center font-numeric text-sm font-extrabold text-foreground">
                  {qty}
                </span>
                <QtyButton icon={Plus} onClick={() => setQty(product.id, qty + 1)} label="+" />
                <button
                  type="button"
                  onClick={() => setQty(product.id, 0)}
                  className="ml-0.5 rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-danger/10 hover:text-danger"
                  aria-label={t('common.delete')}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
        {/* Total + profit, on the receipt's tear line */}
        <div className="border-t-2 border-dashed border-border bg-surface px-4 py-3">
          <div className="flex items-baseline justify-between">
            <span className="text-sm font-bold text-muted-foreground">{t('sale.total')}</span>
            <span className="font-numeric text-2xl font-extrabold tracking-tight text-foreground">
              {formatMoney(total, currency, { signDisplay: 'never' })}
            </span>
          </div>
          {profit > 0 && (
            <p className="mt-1 text-right text-xs font-bold text-positive">
              {t('sale.profit', { amount: formatMoney(profit, currency, { signDisplay: 'never' }) })}
            </p>
          )}
        </div>
      </div>

      {/* Where + when */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label={t('sale.moneyTo')}>
          <Select value={selectedAccountId} onChange={(e) => setAccountId(e.target.value)}>
            {accounts.length === 0 && <option value="">{t('sale.noAccount')}</option>}
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t('common.date')}>
          <Input type="date" value={occurredAt} onChange={(e) => setOccurredAt(e.target.value)} />
        </Field>
      </div>

      <Field label={t('sale.customer')}>
        <Input
          value={customer}
          onChange={(e) => setCustomer(e.target.value)}
          placeholder={t('sale.customerPh')}
        />
      </Field>

      {error && <p className="text-sm text-danger">{error}</p>}

      <div className="flex gap-3">
        <Button type="button" variant="secondary" className="flex-1" onClick={onClose}>
          {t('common.cancel')}
        </Button>
        <Button
          type="submit"
          className="flex-1"
          loading={createSale.isPending}
          disabled={lines.length === 0}
        >
          {t('sale.save')}
        </Button>
      </div>
    </form>
  )
}

function QtyButton({
  icon: Icon,
  onClick,
  label,
}: {
  icon: React.ComponentType<{ className?: string }>
  onClick: () => void
  label: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="flex h-7 w-7 items-center justify-center rounded-lg border border-border bg-surface text-foreground transition-colors hover:bg-surface-muted"
    >
      <Icon className="h-3.5 w-3.5" />
    </button>
  )
}
