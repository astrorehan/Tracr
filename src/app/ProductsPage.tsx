import { useMemo, useState } from 'react'
import { Plus, Pencil, ShoppingBag, ArrowRight } from 'lucide-react'
import { BizHeaderAction } from '@/components/BizLayout'
import { Button } from '@/components/ui/Button'
import { CenterSpinner } from '@/components/ui/States'
import { useAuth } from '@/features/auth/useAuth'
import { useT } from '@/features/settings/language-context'
import { formatMoney } from '@/lib/money'
import { cn } from '@/lib/utils'
import { useProducts } from '@/features/products/api'
import { ProductForm } from '@/features/products/ProductForm'
import { SaleForm } from '@/features/sales/SaleForm'
import { saleTotal, type SaleLine } from '@/features/sales/api'
import type { Product } from '@/types/db'

/** Guess a friendly emoji from a warung item's name — pure sugar, no schema. */
const EMOJI: [RegExp, string][] = [
  [/nasi|rice/i, '🍚'],
  [/mie|noodle|bakmi/i, '🍜'],
  [/ayam|chicken|geprek/i, '🍗'],
  [/bakso|meatball/i, '🍲'],
  [/sate/i, '🍢'],
  [/soto|sop|soup/i, '🥣'],
  [/telur|egg/i, '🥚'],
  [/gorengan|goreng|tempe|tahu/i, '🍤'],
  [/roti|bread|kue/i, '🍞'],
  [/kopi|coffee/i, '☕'],
  [/teh|tea/i, '🧋'],
  [/jeruk|orange/i, '🍊'],
  [/es |ice|dingin/i, '🧊'],
  [/susu|milk/i, '🥛'],
  [/air|water|aqua|galon/i, '💧'],
  [/pisang|banana/i, '🍌'],
  [/rokok|cigarette/i, '🚬'],
  [/sabun|detergen|shampoo/i, '🧼'],
]
function guessEmoji(name: string): string | null {
  for (const [re, e] of EMOJI) if (re.test(name)) return e
  return null
}

export function ProductsPage() {
  const { profile } = useAuth()
  const base = profile?.base_currency ?? 'IDR'
  const { t } = useT()
  const { data: products = [], isLoading } = useProducts()

  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<Product | null>(null)
  const [checkout, setCheckout] = useState(false)
  const [cart, setCart] = useState<SaleLine[]>([])

  const cartCount = useMemo(() => cart.reduce((s, l) => s + l.qty, 0), [cart])
  const total = useMemo(() => saleTotal(cart), [cart])
  const qtyOf = (id: string) => cart.find((l) => l.product.id === id)?.qty ?? 0

  function addToCart(product: Product) {
    setCart((prev) => {
      const existing = prev.find((l) => l.product.id === product.id)
      if (existing) return prev.map((l) => (l.product.id === product.id ? { ...l, qty: l.qty + 1 } : l))
      return [...prev, { product, qty: 1 }]
    })
  }

  // The back link, header and tab bar come from BizLayout — this page only
  // fills in the header action and the body below the tabs.
  return (
    <>
      {products.length > 0 && (
        <BizHeaderAction>
          <button
            onClick={() => setCreating(true)}
            className="pressable flex h-11 shrink-0 items-center gap-1.5 rounded-2xl bg-foreground px-4 text-sm font-extrabold text-background"
          >
            <Plus className="h-4 w-4 stroke-[2.6]" />
            {t('prod.new')}
          </button>
        </BizHeaderAction>
      )}

      {isLoading ? (
        <div className="pt-16">
          <CenterSpinner />
        </div>
      ) : products.length === 0 ? (
        <EmptyProduk onAdd={() => setCreating(true)} />
      ) : (
        <>
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {products.map((product) => (
              <ProductTile
                key={product.id}
                product={product}
                currency={base}
                qty={qtyOf(product.id)}
                onSell={() => addToCart(product)}
                onEdit={() => setEditing(product)}
              />
            ))}
          </div>

          {/* Sticky cart bar — floats above the mobile dock, aligns to the column */}
          {cartCount > 0 && (
            <div className="sticky bottom-[96px] z-30 mt-4 sm:bottom-4">
              <button
                onClick={() => setCheckout(true)}
                className="pressable flex w-full items-center gap-2 rounded-[20px] bg-foreground px-5 py-3 text-background shadow-[0_20px_40px_-16px_rgba(0,0,0,0.5)]"
              >
                <span className="min-w-0 flex-1 text-left">
                  <span className="flex items-center gap-1.5 text-[11.5px] font-bold opacity-70">
                    <ShoppingBag className="h-3.5 w-3.5 shrink-0" />
                    {t('prod.cartItems', { n: cartCount })}
                  </span>
                  <span className="mt-0.5 block truncate font-numeric text-[19px] font-extrabold tracking-tight">
                    {formatMoney(total, base, { signDisplay: 'never' })}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-1.5 rounded-2xl bg-background px-4 py-2.5 text-[14px] font-extrabold text-foreground">
                  {t('sale.catat')}
                  <ArrowRight className="h-4 w-4 stroke-[2.6]" />
                </span>
              </button>
            </div>
          )}
        </>
      )}

      <ProductForm open={creating} onClose={() => setCreating(false)} />
      <ProductForm open={Boolean(editing)} onClose={() => setEditing(null)} product={editing} />
      <SaleForm
        open={checkout}
        onClose={() => setCheckout(false)}
        lines={cart}
        onLinesChange={setCart}
        currency={base}
      />
    </>
  )
}

function ProductTile({
  product,
  currency,
  qty,
  onSell,
  onEdit,
}: {
  product: Product
  currency: string
  qty: number
  onSell: () => void
  onEdit: () => void
}) {
  const { t } = useT()
  const emoji = guessEmoji(product.name)
  const margin = product.price - product.cost
  const inCart = qty > 0

  return (
    <button
      onClick={onSell}
      className={cn(
        'group relative flex flex-col gap-2.5 overflow-hidden rounded-[20px] border bg-surface p-3.5 text-left transition-transform active:scale-[0.97]',
        inCart ? 'border-primary shadow-[inset_0_0_0_1px_var(--color-primary)]' : 'border-border',
      )}
    >
      {/* Edit affordance */}
      <span
        role="button"
        tabIndex={0}
        onClick={(e) => {
          e.stopPropagation()
          onEdit()
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            e.stopPropagation()
            onEdit()
          }
        }}
        aria-label={t('prod.editAria', { name: product.name })}
        className="absolute right-2 top-2 z-10 flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground opacity-60 transition-colors hover:bg-surface-muted hover:text-foreground group-hover:opacity-100"
      >
        <Pencil className="h-[15px] w-[15px]" />
      </span>

      {/* Icon / emoji chip with qty badge */}
      <span className="relative flex h-11 w-11 items-center justify-center rounded-[14px] bg-surface-muted text-[22px]">
        {emoji ?? (
          <span className="font-extrabold text-muted-foreground">
            {product.name.charAt(0).toUpperCase()}
          </span>
        )}
        {inCart && (
          <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 font-numeric text-[11px] font-extrabold text-primary-foreground">
            {qty}
          </span>
        )}
      </span>

      <span className="min-h-[34px] text-[14px] font-extrabold leading-tight tracking-tight">
        <span className="line-clamp-2">{product.name}</span>
      </span>

      <span className="mt-auto">
        <span className="block font-numeric text-[15.5px] font-extrabold">
          {formatMoney(product.price, currency, { signDisplay: 'never' })}
        </span>
        {product.price > 0 && margin > 0 && (
          <span className="mt-1 inline-block max-w-full truncate rounded-full bg-positive/12 px-2 py-0.5 align-bottom text-[10px] font-extrabold text-positive">
            {t('prod.margin', { amount: formatMoney(margin, currency, { signDisplay: 'never' }) })}
          </span>
        )}
      </span>
    </button>
  )
}

function EmptyProduk({ onAdd }: { onAdd: () => void }) {
  const { t } = useT()
  return (
    <div className="flex flex-col items-center px-4 pb-10 pt-6 text-center">
      <svg className="my-3 h-[138px] w-[168px]" viewBox="0 0 200 160" fill="none">
        <rect x="34" y="52" width="60" height="60" rx="14" fill="var(--surface)" stroke="var(--border)" strokeWidth="2.5" />
        <text x="64" y="92" fontSize="30" textAnchor="middle">
          🍚
        </text>
        <rect x="106" y="52" width="60" height="60" rx="14" fill="var(--surface)" stroke="var(--border)" strokeWidth="2.5" strokeDasharray="6 6" />
        <path d="M136 70v24M124 82h24" stroke="var(--primary)" strokeWidth="5" strokeLinecap="round" />
      </svg>
      <h2 className="text-xl font-extrabold tracking-tight">{t('prod.emptyTitle')}</h2>
      <p className="mt-2 max-w-[280px] text-sm font-medium leading-relaxed text-muted-foreground">
        {t('prod.emptyBody')}
      </p>
      <Button size="lg" className="mt-5 shadow-[0_14px_26px_-12px_var(--primary)]" onClick={onAdd}>
        <Plus className="h-[18px] w-[18px]" />
        {t('prod.emptyCta')}
      </Button>
      <div className="mt-5 grid w-full max-w-[320px] grid-cols-2 gap-2.5">
        <PickCard emoji="🍚" title={t('prod.pickFood')} hint={t('prod.pickFoodHint')} onClick={onAdd} />
        <PickCard emoji="🧊" title={t('prod.pickDrink')} hint={t('prod.pickDrinkHint')} onClick={onAdd} />
      </div>
    </div>
  )
}

function PickCard({
  emoji,
  title,
  hint,
  onClick,
}: {
  emoji: string
  title: string
  hint: string
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="pressable flex flex-col items-start gap-1.5 rounded-2xl border border-border bg-surface p-3.5 text-left"
    >
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-surface-muted text-lg">
        {emoji}
      </span>
      <span className="text-[13.5px] font-extrabold">{title}</span>
      <span className="text-[11.5px] font-medium leading-snug text-muted-foreground">{hint}</span>
    </button>
  )
}
