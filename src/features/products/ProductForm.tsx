import { useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Field, Input } from '@/components/ui/Input'
import { getCurrency } from '@/lib/currencies'
import { amountToMinor, fromMinorUnits } from '@/lib/money'
import { useAuth } from '@/features/auth/useAuth'
import { useCreateProduct, useUpdateProduct } from './api'
import type { Product } from '@/types/db'

interface Props {
  open: boolean
  onClose: () => void
  /** Pass a product to edit it; omit to create a new one. */
  product?: Product | null
}

export function ProductForm({ open, onClose, product }: Props) {
  return (
    <Modal open={open} onClose={onClose} title={product ? 'Edit product' : 'New product'}>
      {open && <ProductFormBody onClose={onClose} product={product ?? null} />}
    </Modal>
  )
}

/** Major-unit string for an input, or '' for a zero/unset amount. */
function majorStr(minor: number, currency: string): string {
  return minor > 0 ? String(fromMinorUnits(minor, currency)) : ''
}

function ProductFormBody({ onClose, product }: { onClose: () => void; product: Product | null }) {
  const { profile } = useAuth()
  const currency = profile?.base_currency ?? 'IDR'
  const symbol = getCurrency(currency).symbol

  const createProduct = useCreateProduct()
  const updateProduct = useUpdateProduct()

  const [name, setName] = useState(product?.name ?? '')
  const [price, setPrice] = useState(majorStr(product?.price ?? 0, currency))
  const [cost, setCost] = useState(majorStr(product?.cost ?? 0, currency))
  const [unit, setUnit] = useState(product?.unit ?? '')
  const [error, setError] = useState<string | null>(null)

  const pending = createProduct.isPending || updateProduct.isPending

  const priceMinor = amountToMinor(price, currency)
  const costMinor = cost.trim() ? amountToMinor(cost, currency) : 0
  const margin = priceMinor - costMinor

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!name.trim()) return setError('Give the product a name.')
    if (priceMinor < 0 || costMinor < 0) return setError('Amounts cannot be negative.')

    try {
      if (product) {
        await updateProduct.mutateAsync({
          id: product.id,
          patch: {
            name: name.trim(),
            price: priceMinor,
            cost: costMinor,
            unit: unit.trim() || null,
          },
        })
      } else {
        await createProduct.mutateAsync({
          name: name.trim(),
          price: priceMinor,
          cost: costMinor,
          unit: unit.trim() || null,
        })
      }
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Field label="Name">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Nasi Goreng"
          autoFocus
        />
      </Field>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Selling price (harga jual)">
          <MoneyInput symbol={symbol} currency={currency} value={price} onChange={setPrice} />
        </Field>
        <Field label="Cost (harga modal)">
          <MoneyInput symbol={symbol} currency={currency} value={cost} onChange={setCost} />
        </Field>
      </div>

      {priceMinor > 0 && (
        <p className="text-xs font-medium text-muted-foreground">
          Profit per {unit.trim() || 'item'}:{' '}
          <span className={margin >= 0 ? 'font-bold text-positive' : 'font-bold text-danger'}>
            {symbol}
            {fromMinorUnits(margin, currency).toLocaleString()}
          </span>
        </p>
      )}

      <Field label="Unit (optional)">
        <Input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="e.g. porsi, pcs" />
      </Field>

      {error && <p className="text-sm text-danger">{error}</p>}

      <div className="flex gap-3 pt-2">
        <Button type="button" variant="secondary" className="flex-1" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" className="flex-1" loading={pending}>
          Save
        </Button>
      </div>
    </form>
  )
}

function MoneyInput({
  symbol,
  currency,
  value,
  onChange,
}: {
  symbol: string
  currency: string
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-border bg-surface px-4 shadow-sm focus-within:border-primary/70 focus-within:ring-2 focus-within:ring-primary/35">
      <span className="font-numeric text-base font-semibold text-muted-foreground">{symbol}</span>
      <input
        type="number"
        inputMode="decimal"
        step="any"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="0"
        className="h-12 w-full bg-transparent font-numeric text-base font-semibold text-foreground outline-none placeholder:text-muted-foreground/50"
      />
      <span className="text-xs font-semibold text-muted-foreground">{currency}</span>
    </div>
  )
}
