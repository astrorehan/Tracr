import { Check, Loader2, ShieldCheck, X } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { useT } from '@/features/settings/language-context'
import { cn } from '@/lib/utils'

/** What the user tapped, echoed back so the dialog answers *their* choice. */
export interface SoonItem {
  /** Headline of the thing they picked — "Pro" or "60 kredit". */
  title: string
  /** Its price, already formatted. */
  price: string
  /** One line of detail under the title — "300 kredit tiap bulan". */
  meta?: string
}

interface Props {
  open: boolean
  onClose: () => void
  item: SoonItem | null
  /** Free monthly credits, so the dialog can say what still works today. */
  freeCredits: number
}

/**
 * Checkout is built but the payment provider isn't switched on yet. Rather than
 * greying the buy buttons out (which reads as broken), they stay live and land
 * here: what they picked, why it can't go through yet, and what still works.
 */
export function PaymentSoonModal({ open, onClose, item, freeCredits }: Props) {
  const { t } = useT()
  return (
    <Modal open={open} onClose={onClose} className="max-w-[26rem]">
      <div className="relative -mt-2">
        <button
          type="button"
          onClick={onClose}
          aria-label={t('common.close')}
          className="pressable absolute -right-2 -top-2 flex h-9 w-9 items-center justify-center rounded-full border border-border bg-surface-muted text-muted-foreground transition-colors hover:text-foreground"
        >
          <X className="h-[18px] w-[18px]" />
        </button>

        <Emblem />

        <h2 className="mt-5 text-center text-[22px] font-extrabold leading-tight tracking-tight">
          {t('billing.soonTitle')}
        </h2>
        <p className="mx-auto mt-2 max-w-[300px] text-center text-[13.5px] font-medium leading-relaxed text-muted-foreground">
          {t('billing.soonBody')}
        </p>

        {item && (
          <div className="mt-5 flex items-center gap-3 rounded-2xl border border-border bg-surface-muted px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-[14px] font-extrabold tracking-tight">{item.title}</p>
              {item.meta && (
                <p className="mt-0.5 truncate text-[11.5px] font-medium text-muted-foreground">
                  {item.meta}
                </p>
              )}
            </div>
            <span className="shrink-0 font-numeric text-[15px] font-extrabold">{item.price}</span>
          </div>
        )}

        {/* Where it actually stands — no vague "soon" */}
        <ol className="mt-5 space-y-3">
          <Step done label={t('billing.soonStep1')} />
          <Step done label={t('billing.soonStep2')} />
          <Step label={t('billing.soonStep3')} />
        </ol>

        <p className="mt-5 flex items-start gap-2 rounded-2xl bg-primary-soft px-4 py-3 text-[12.5px] font-semibold leading-relaxed text-primary">
          <ShieldCheck className="mt-px h-4 w-4 shrink-0" />
          {t('billing.soonMeanwhile', { n: freeCredits })}
        </p>

        <Button size="lg" className="mt-5 w-full rounded-2xl" onClick={onClose}>
          {t('billing.soonOk')}
        </Button>
      </div>
    </Modal>
  )
}

/** One line of the rollout checklist: done, or the one in progress. */
function Step({ label, done = false }: { label: string; done?: boolean }) {
  return (
    <li className="flex items-center gap-3">
      <span
        className={cn(
          'flex h-6 w-6 shrink-0 items-center justify-center rounded-full',
          done ? 'bg-positive/12 text-positive' : 'bg-primary-soft text-primary',
        )}
      >
        {done ? (
          <Check className="h-3.5 w-3.5 stroke-[3]" />
        ) : (
          <Loader2 className="h-3.5 w-3.5 animate-spin stroke-[2.6]" />
        )}
      </span>
      <span
        className={cn(
          'text-[13px] font-semibold',
          done ? 'text-muted-foreground' : 'text-foreground',
        )}
      >
        {label}
      </span>
    </li>
  )
}

/** A card being swiped into a reader, held one beat before it clears. */
function Emblem() {
  return (
    <div className="relative mx-auto mt-3 h-[124px] w-[188px]">
      <span className="absolute left-1/2 top-1/2 h-[132px] w-[132px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/10 blur-2xl" />
      <svg viewBox="0 0 188 124" className="relative h-full w-full" fill="none" aria-hidden>
        <defs>
          <linearGradient id="soon-card" x1="24" y1="16" x2="150" y2="86" gradientUnits="userSpaceOnUse">
            <stop stopColor="var(--primary)" />
            <stop offset="1" stopColor="#1b9be0" />
          </linearGradient>
        </defs>

        {/* reader slot */}
        <rect x="20" y="72" width="148" height="40" rx="14" fill="var(--surface-muted)" />
        <rect x="20" y="72" width="148" height="40" rx="14" stroke="var(--border)" strokeWidth="2" />
        <rect x="34" y="88" width="120" height="6" rx="3" fill="var(--border)" />

        {/* the card, mid-swipe */}
        <g className="landing-float">
          <rect x="30" y="12" width="128" height="76" rx="14" fill="url(#soon-card)" />
          <rect x="30" y="12" width="128" height="76" rx="14" fill="url(#soon-card)" opacity=".9" />
          <rect x="42" y="30" width="26" height="19" rx="4" fill="#fff" opacity=".85" />
          <path d="M42 39h26" stroke="var(--primary)" strokeWidth="2" opacity=".55" />
          <rect x="42" y="62" width="52" height="7" rx="3.5" fill="#fff" opacity=".6" />
          <rect x="102" y="62" width="22" height="7" rx="3.5" fill="#fff" opacity=".35" />
          <circle cx="130" cy="34" r="11" fill="#fff" opacity=".28" />
          <circle cx="142" cy="34" r="11" fill="#fff" opacity=".45" />
        </g>
      </svg>
    </div>
  )
}
