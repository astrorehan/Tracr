import { useState } from 'react'
import { Package, Store, Plus, Pencil, Archive, ShoppingBag } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { PageHeader, Pill } from '@/components/ui/list'
import { CenterSpinner } from '@/components/ui/States'
import { StarterGuide } from '@/components/ui/StarterGuide'
import { useConfirm } from '@/components/ui/confirm-context'
import { useAuth } from '@/features/auth/useAuth'
import { useActiveBook } from '@/features/books/useActiveBook'
import { formatMoney } from '@/lib/money'
import { cn } from '@/lib/utils'
import { useProducts, useArchiveProduct } from '@/features/products/api'
import { ProductForm } from '@/features/products/ProductForm'
import { SaleForm } from '@/features/sales/SaleForm'
import type { Product } from '@/types/db'

export function ProductsPage() {
  const { profile } = useAuth()
  const base = profile?.base_currency ?? 'IDR'
  const { activeBook } = useActiveBook()
  const { data: products = [], isLoading } = useProducts()

  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<Product | null>(null)
  const [selling, setSelling] = useState(false)

  // Guard: the product catalog only makes sense inside a business book.
  if (activeBook && activeBook.type !== 'business') {
    return (
      <div className="mx-auto max-w-3xl">
        <PageHeader title="Products" />
        <Card className="flex flex-col items-center gap-3 p-8 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-soft text-primary">
            <Store className="h-6 w-6" />
          </span>
          <p className="text-sm font-medium text-muted-foreground">
            Products are part of a <span className="font-bold text-foreground">business</span> book.
            Switch to or create a business book to sell items and track profit.
          </p>
        </Card>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title="Products"
        subtitle="Your catalog — what you sell, its price and cost."
        action={
          products.length > 0 ? (
            <Pill variant="tint" icon={Plus} onClick={() => setCreating(true)}>
              New
            </Pill>
          ) : undefined
        }
      />

      {isLoading ? (
        <CenterSpinner />
      ) : products.length === 0 ? (
        <StarterGuide
          icon={<Package className="h-6 w-6" />}
          title="List what you sell"
          intro="Add each product once with its price and cost — then record a sale in a couple of taps."
          points={[
            {
              title: 'Add a product',
              body: 'Enter the name, the selling price (harga jual), and the cost (harga modal).',
            },
            {
              title: 'We track your profit',
              body: 'The margin per item is worked out for you, so you always know what you earn.',
            },
            {
              title: 'Sell in a tap',
              body: 'Pick products into a cart on the sales screen — the total adds up automatically.',
            },
          ]}
          templates={[{ label: 'Add a product', hint: 'e.g. Nasi Goreng', onClick: () => setCreating(true) }]}
        />
      ) : (
        <div className="space-y-4">
          <Button className="w-full" onClick={() => setSelling(true)}>
            <ShoppingBag className="h-4 w-4" /> Catat Jualan
          </Button>
          <div className="space-y-3">
            {products.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                currency={base}
                onEdit={() => setEditing(product)}
              />
            ))}
          </div>
        </div>
      )}

      <ProductForm open={creating} onClose={() => setCreating(false)} />
      <ProductForm open={Boolean(editing)} onClose={() => setEditing(null)} product={editing} />
      <SaleForm open={selling} onClose={() => setSelling(false)} />
    </div>
  )
}

function ProductCard({
  product,
  currency,
  onEdit,
}: {
  product: Product
  currency: string
  onEdit: () => void
}) {
  const archive = useArchiveProduct()
  const confirm = useConfirm()

  const margin = product.price - product.cost
  const marginPct = product.price > 0 ? Math.round((margin / product.price) * 100) : 0

  async function remove() {
    if (
      await confirm({
        title: 'Archive this product?',
        message: `“${product.name}” will be hidden from your catalog. Past sales keep their history.`,
        confirmLabel: 'Archive',
      })
    )
      archive.mutate(product.id)
  }

  return (
    <Card className="flex items-center gap-3 p-4">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary">
        {product.name.charAt(0).toUpperCase()}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold text-foreground">
          {product.name}
          {product.unit && (
            <span className="ml-1.5 text-xs font-medium text-muted-foreground">/ {product.unit}</span>
          )}
        </p>
        <p className="truncate text-xs font-semibold text-muted-foreground">
          Cost {formatMoney(product.cost, currency, { signDisplay: 'never' })}
          {product.price > 0 && (
            <>
              {' · '}
              <span className={cn('font-bold', margin >= 0 ? 'text-positive' : 'text-danger')}>
                {margin >= 0 ? '+' : ''}
                {formatMoney(margin, currency, { signDisplay: 'never' })} ({marginPct}%)
              </span>
            </>
          )}
        </p>
      </div>
      <div className="flex flex-col items-end gap-1">
        <span className="font-numeric text-sm font-bold text-foreground">
          {formatMoney(product.price, currency, { signDisplay: 'never' })}
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={onEdit}
            className="rounded-lg border border-transparent p-1.5 text-muted-foreground transition-colors hover:bg-surface-muted hover:text-foreground"
            aria-label="Edit product"
          >
            <Pencil className="h-4 w-4" />
          </button>
          <button
            onClick={remove}
            disabled={archive.isPending}
            className="rounded-lg border border-transparent p-1.5 text-muted-foreground transition-colors hover:border-danger/10 hover:bg-danger/10 hover:text-danger"
            aria-label="Archive product"
          >
            <Archive className="h-4 w-4" />
          </button>
        </div>
      </div>
    </Card>
  )
}
