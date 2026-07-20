import { Link } from 'react-router-dom'
import { Coins } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useT } from '@/features/settings/language-context'
import { useCreditBalance, totalRemaining } from './api'

/** Persistent AI-credit balance indicator. Mirrors NotificationBell's
 *  variant split (default = surface pill row, onDark = mobile hero), but
 *  unlike the bell this is a real network-backed query, not client-derived —
 *  the balance lives in Postgres, not something we can compute locally. */
export function CreditChip({ variant = 'default' }: { variant?: 'default' | 'onDark' }) {
  const { t } = useT()
  const { data, isLoading } = useCreditBalance()
  const remaining = totalRemaining(data)

  return (
    <Link
      to="/billing"
      className={cn(
        'pressable flex h-9 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-xs font-bold transition-colors',
        variant === 'onDark'
          ? 'bg-white/15 text-white hover:bg-white/25'
          : 'border border-border bg-surface-muted/50 text-muted-foreground hover:text-foreground',
      )}
      aria-label={t('billing.chipAria', { n: isLoading ? '…' : remaining })}
      title={t('billing.chipAria', { n: isLoading ? '…' : remaining })}
    >
      <Coins className="h-4 w-4 shrink-0" />
      <span className="tabular-nums">{isLoading ? '·' : remaining}</span>
    </Link>
  )
}
