import { useState } from 'react'
import { Smartphone, Share, MoreVertical, Copy, Check } from 'lucide-react'
import { useT } from '@/features/settings/language-context'

/** The address a visitor should open on their phone to install from. */
function siteUrl(): string {
  if (typeof window === 'undefined') return ''
  return `${window.location.origin}/welcome`
}

export function PwaInstallBanner() {
  const { t } = useT()
  const [copied, setCopied] = useState(false)
  const url = siteUrl()

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard blocked (insecure origin, denied permission) — the address is
      // spelled out on screen anyway, so there is nothing to recover from.
    }
  }

  return (
    <section className="mx-auto max-w-6xl px-6 py-20 sm:py-24">
      <div className="card-surface relative overflow-hidden rounded-3xl border border-border p-8 sm:p-12 shadow-xl">
        <div className="landing-drift pointer-events-none absolute -right-20 -top-20 h-72 w-72 rounded-full bg-primary/10 blur-3xl" />

        <div className="grid gap-8 lg:grid-cols-12 items-center relative z-10">
          {/* Left Column Text & Steps */}
          <div className="lg:col-span-8 space-y-5">
            <div className="inline-flex items-center gap-2 rounded-full bg-violet-500/10 px-3.5 py-1.5 text-xs font-bold uppercase tracking-wider text-violet-600 dark:text-violet-400">
              <Smartphone className="h-4 w-4" /> {t('land.pwaBadge')}
            </div>

            <h2 className="font-display text-3xl font-extrabold tracking-tight sm:text-4xl">
              {t('land.pwaBannerTitle')}
            </h2>

            <p className="text-base font-medium leading-relaxed text-muted-foreground">
              {t('land.pwaBannerSub')}
            </p>

            <div className="grid gap-3 sm:grid-cols-2 pt-2">
              {/* iOS Step */}
              <div className="rounded-2xl bg-background p-4 border border-border space-y-2">
                <div className="flex items-center gap-2 font-bold text-sm text-foreground">
                  <Share className="h-4 w-4 text-blue-500" /> iPhone / iPad (Safari)
                </div>
                <p className="text-xs font-medium text-muted-foreground leading-relaxed">
                  {t('land.pwaIosStep1')}<br />
                  {t('land.pwaIosStep2')}<br />
                  {t('land.pwaIosStep3')}
                </p>
              </div>

              {/* Android Step */}
              <div className="rounded-2xl bg-background p-4 border border-border space-y-2">
                <div className="flex items-center gap-2 font-bold text-sm text-foreground">
                  <MoreVertical className="h-4 w-4 text-emerald-500" /> Android (Chrome)
                </div>
                <p className="text-xs font-medium text-muted-foreground leading-relaxed">
                  {t('land.pwaAndroidStep1')}<br />
                  {t('land.pwaAndroidStep2')}<br />
                  {t('land.pwaAndroidStep3')}
                </p>
              </div>
            </div>
          </div>

          {/* Right Column: the address to open on a phone. This used to be a
              decorative SVG that looked like a QR code but encoded nothing —
              anyone who actually pointed a camera at it got no result. */}
          <div className="lg:col-span-4">
            <div className="rounded-3xl border border-border bg-background p-6 shadow-lg space-y-3">
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                {t('land.pwaLinkLabel')}
              </p>
              <p className="break-all rounded-2xl bg-surface border border-border px-3 py-2.5 font-numeric text-sm font-bold text-foreground">
                {url}
              </p>
              <button
                type="button"
                onClick={handleCopy}
                className="pressable flex w-full items-center justify-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground transition hover:opacity-90 active:scale-95"
              >
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {copied ? t('land.pwaCopied') : t('land.pwaCopyLink')}
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
