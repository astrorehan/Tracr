import { Smartphone, QrCode, Share, MoreVertical } from 'lucide-react'
import { useT } from '@/features/settings/language-context'

export function PwaInstallBanner() {
  const { t } = useT()

  return (
    <section className="mx-auto max-w-6xl px-6 py-20 sm:py-24">
      <div className="card-surface relative overflow-hidden rounded-3xl border border-border p-8 sm:p-12 shadow-xl">
        <div className="landing-drift pointer-events-none absolute -right-20 -top-20 h-72 w-72 rounded-full bg-primary/10 blur-3xl" />

        <div className="grid gap-8 lg:grid-cols-12 items-center relative z-10">
          {/* Left Column Text & Steps */}
          <div className="lg:col-span-8 space-y-5">
            <div className="inline-flex items-center gap-2 rounded-full bg-violet-500/10 px-3.5 py-1.5 text-xs font-bold uppercase tracking-wider text-violet-600 dark:text-violet-400">
              <Smartphone className="h-4 w-4" /> Progressive Web App (PWA)
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

          {/* Right Column QR Code Banner */}
          <div className="lg:col-span-4 flex flex-col items-center justify-center">
            <div className="rounded-3xl border border-border bg-background p-6 shadow-lg text-center space-y-3">
              <div className="relative mx-auto flex h-36 w-36 items-center justify-center overflow-hidden rounded-2xl bg-surface border border-border p-3 shadow-inner">
                {/* Laser scan animation line */}
                <div className="animate-qr-scan" />
                {/* SVG Simulated QR Code */}
                <svg viewBox="0 0 100 100" className="h-full w-full text-foreground fill-current">
                  <rect x="0" y="0" width="30" height="30" rx="4" />
                  <rect x="5" y="5" width="20" height="20" fill="white" rx="2" />
                  <rect x="10" y="10" width="10" height="10" rx="1" />

                  <rect x="70" y="0" width="30" height="30" rx="4" />
                  <rect x="75" y="5" width="20" height="20" fill="white" rx="2" />
                  <rect x="80" y="10" width="10" height="10" rx="1" />

                  <rect x="0" y="70" width="30" height="30" rx="4" />
                  <rect x="5" y="75" width="20" height="20" fill="white" rx="2" />
                  <rect x="10" y="80" width="10" height="10" rx="1" />

                  <rect x="40" y="10" width="10" height="20" />
                  <rect x="40" y="40" width="20" height="10" />
                  <rect x="10" y="40" width="20" height="20" />
                  <rect x="70" y="40" width="20" height="20" />
                  <rect x="40" y="70" width="20" height="20" />
                  <rect x="70" y="70" width="20" height="10" />
                </svg>
              </div>

              <div className="flex items-center justify-center gap-1.5 text-xs font-bold text-primary">
                <QrCode className="h-4 w-4" /> {t('land.pwaScanButton')}
              </div>
              <p className="text-[11px] font-medium text-muted-foreground">
                {t('land.pwaScanHint')}
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
