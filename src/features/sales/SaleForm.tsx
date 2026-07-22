import { useMemo, useState } from 'react'
import { Minus, Plus, Trash2, ShoppingBag } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Field, Input, Select } from '@/components/ui/Input'
import { formatMoney } from '@/lib/money'
import { cn } from '@/lib/utils'
import { useAuth } from '@/features/auth/useAuth'
import { useAccounts } from '@/features/accounts/api'
import { useProducts } from '@/features/products/api'
import { useCreateSale, saleTotal, type SaleLine } from './api'
import type { Product } from '@/types/db'

interface Props {
  open: boolean
  onClose: () => void
}

export function SaleForm({ open, onClose }: Props) {
  return (
    <Modal open={open} onClose={onClose} title="Catat Jualan" description="Record a sale">
      {open && <SaleFormBody onClose={onClose} />}
    </Modal>
  )
}

function SaleFormBody({ onClose }: { onClose: () => void }) {
  const { profile } = useAuth()
  const currency = profile?.base_currency ?? 'IDR'

  const { data: products = [] } = useProducts()
  const { data: accounts = [] } = useAccounts()
  const createSale = useCreateSale()

  const [lines, setLines] = useState<SaleLine[]>([])
  const [accountId, setAccountId] = useState('')
  const [customer, setCustomer] = useState('')
  const [occurredAt, setOccurredAt] = useState(() => new Date().toISOString().slice(0, 10))
  const [error, setError] = useState<string | null>(null)

  // Default to the first account until the user picks one — derived, so no
  // state-syncing effect is needed while accounts load.
  const selectedAccountId = accountId || accounts[0]?.id || ''

  const total = useMemo(() => saleTotal(lines), [lines])
  const qtyOf = (id: string) => lines.find((l) => l.product.id === id)?.qty ?? 0

  function addToCart(product: Product) {
    setLines((prev) => {
      const existing = prev.find((l) => l.product.id === product.id)
      if (existing)
        return prev.map((l) => (l.product.id === product.id ? { ...l, qty: l.qty + 1 } : l))
      return [...prev, { product, qty: 1 }]
    })
  }

  function setQty(id: string, qty: number) {
    setLines((prev) =>
      qty <= 0
        ? prev.filter((l) => l.product.id !== id)
        : prev.map((l) => (l.product.id === id ? { ...l, qty } : l)),
    )
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (lines.length === 0) return setError('Add at least one item to the sale.')
    if (!selectedAccountId) return setError('Pick which account receives the money.')

    try {
      await createSale.mutateAsync({
        accountId: selectedAccountId,
        currency,
        lines,
        occurredAt: new Date(occurredAt).toISOString(),
        customer: customer.trim() || null,
      })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    }
  }

  if (products.length === 0) {
    return (
      <div className="space-y-4 text-center">
        <p className="text-sm text-muted-foreground">
          Add a product first, then you can record a sale.
        </p>
        <Button type="button" variant="secondary" className="w-full" onClick={onClose}>
          Close
        </Button>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Product picker */}
      <div>
        <p className="mb-1.5 block text-sm font-medium text-foreground">Tap to add</p>
        <div className="grid grid-cols-2 gap-2">
          {products.map((product) => {
            const inCart = qtyOf(product.id)
            return (
              <button
                key={product.id}
                type="button"
                onClick={() => addToCart(product)}
                className={cn(
                  'relative flex flex-col items-start gap-0.5 rounded-xl border p-3 text-left transition-colors',
                  inCart
                    ? 'border-primary/70 bg-primary-soft'
                    : 'border-border bg-surface hover:bg-surface-muted',
                )}
              >
                <span className="line-clamp-1 text-sm font-bold text-foreground">{product.name}</span>
                <span className="font-numeric text-xs font-semibold text-muted-foreground">
                  {formatMoney(product.price, currency, { signDisplay: 'never' })}
                </span>
                {inCart > 0 && (
                  <span className="absolute right-1.5 top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-xs font-bold text-primary-foreground">
                    {inCart}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* Cart */}
      {lines.length > 0 && (
        <div className="space-y-2 rounded-xl border border-border bg-surface-muted/40 p-3">
          {lines.map(({ product, qty }) => (
            <div key={product.id} className="flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-foreground">{product.name}</p>
                <p className="font-numeric text-xs text-muted-foreground">
                  {formatMoney(Math.round(qty * product.price), currency, { signDisplay: 'never' })}
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                <QtyButton icon={Minus} onClick={() => setQty(product.id, qty - 1)} label="Decrease" />
                <span className="w-6 text-center font-numeric text-sm font-bold text-foreground">
                  {qty}
                </span>
                <QtyButton icon={Plus} onClick={() => setQty(product.id, qty + 1)} label="Increase" />
                <button
                  type="button"
                  onClick={() => setQty(product.id, 0)}
                  className="ml-0.5 rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-danger/10 hover:text-danger"
                  aria-label="Remove item"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Where + who + when */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Money goes to">
          <Select value={selectedAccountId} onChange={(e) => setAccountId(e.target.value)}>
            {accounts.length === 0 && <option value="">No accounts yet</option>}
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Date">
          <Input type="date" value={occurredAt} onChange={(e) => setOccurredAt(e.target.value)} />
        </Field>
      </div>

      <Field label="Customer (optional)">
        <Input
          value={customer}
          onChange={(e) => setCustomer(e.target.value)}
          placeholder="e.g. Bu Sari"
        />
      </Field>

      {/* Total */}
      <div className="flex items-center justify-between rounded-xl bg-primary-soft px-4 py-3">
        <span className="flex items-center gap-2 text-sm font-semibold text-primary">
          <ShoppingBag className="h-4 w-4" /> Total
        </span>
        <span className="font-numeric text-xl font-bold text-primary">
          {formatMoney(total, currency, { signDisplay: 'never' })}
        </span>
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      <div className="flex gap-3">
        <Button type="button" variant="secondary" className="flex-1" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" className="flex-1" loading={createSale.isPending} disabled={lines.length === 0}>
          Save sale
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
