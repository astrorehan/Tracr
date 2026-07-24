import { Link } from 'react-router-dom'
import { ShieldCheck, ArrowRight, Globe } from 'lucide-react'
import { useT } from '@/features/settings/language-context'
import { LANGS, type Lang } from '@/i18n'

export function PrivacyFooter({ ctaTo }: { ctaTo: string }) {
  const { t, lang, setLang } = useT()

  return (
    <>
      {/* Privacy & Security Highlight */}
      <section className="border-t border-border bg-surface py-16">
        <div className="mx-auto flex max-w-3xl flex-col items-center px-6 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 shadow-sm">
            <ShieldCheck className="h-7 w-7" />
          </div>
          <p className="mt-3 inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
            {t('land.secBadge')}
          </p>
          <h2 className="mt-3 font-display text-2xl font-extrabold tracking-tight sm:text-3xl">
            {t('land.secHeading')}
          </h2>
          <p className="mt-3 max-w-xl text-sm font-medium leading-relaxed text-muted-foreground sm:text-base">
            {t('land.secBody')}
          </p>
        </div>
      </section>

      {/* Final CTA Banner */}
      <section className="mx-auto max-w-6xl px-6 py-20">
        <div className="brand-gradient relative overflow-hidden rounded-3xl px-8 py-16 text-center text-white shadow-2xl">
          <h2 className="font-display text-3xl font-extrabold tracking-tight sm:text-4xl">
            {t('land.ctaTitle')}
          </h2>
          <p className="mx-auto mt-3 max-w-md text-base font-medium text-white/90">
            {t('land.ctaBody')}
          </p>
          <Link
            to={ctaTo}
            className="group pressable mt-8 inline-flex h-13 items-center gap-2 rounded-xl bg-white px-8 text-base font-bold text-[#0072bc] shadow-lg transition hover:bg-slate-50 active:scale-95"
          >
            {t('land.ctaButton')}
            <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border bg-background">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-6 px-6 py-10 sm:flex-row">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-xs">
              <img src="/logo.svg" alt="" className="h-5 w-5" />
            </div>
            <span className="font-display text-xl font-bold tracking-tight">Tracr</span>
          </div>

          <p className="text-xs font-medium text-muted-foreground">
            © {new Date().getFullYear()} Tracr · {t('land.madeIn')}
          </p>

          <div className="flex flex-wrap items-center justify-center gap-6 text-xs font-semibold text-muted-foreground">
            <Link to="/legal/terms" className="transition hover:text-foreground">
              {t('land.terms')}
            </Link>
            <Link to="/legal/privacy" className="transition hover:text-foreground">
              {t('land.privacy')}
            </Link>
            <Link to="/login" className="transition hover:text-foreground">
              {t('land.signIn')}
            </Link>

            {/* Language Switcher */}
            <div className="flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2 py-1">
              <Globe className="h-3.5 w-3.5 text-muted-foreground" />
              <select
                value={lang}
                onChange={(e) => setLang(e.target.value as Lang)}
                className="bg-transparent text-xs font-semibold text-foreground focus:outline-none cursor-pointer"
              >
                {LANGS.map((l) => (
                  <option key={l.value} value={l.value}>
                    {l.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </footer>
    </>
  )
}
