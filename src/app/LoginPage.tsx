import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import {
  Smartphone,
  User,
  KeyRound,
  ArrowRight,
  ChevronLeft,
  ShieldCheck,
  Sparkles,
  Lock,
} from 'lucide-react'
import { useAuth } from '@/features/auth/useAuth'
import { useT } from '@/features/settings/language-context'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { PinInput } from '@/components/ui/PinInput'
import { CenterSpinner } from '@/components/ui/States'

export function LoginPage() {
  const { session, loading, signInWithPhone, signUpWithPhone, signInWithGoogle } = useAuth()
  const { t } = useT()
  const [busy, setBusy] = useState(false)
  const [isRegistering, setIsRegistering] = useState(false)
  const [loginStep, setLoginStep] = useState<'phone' | 'pin'>('phone')
  const [phone, setPhone] = useState('')
  const [pin, setPin] = useState('')
  const [name, setName] = useState('')
  const [errorMsg, setErrorMsg] = useState('')

  if (loading) return <CenterSpinner />
  if (session) return <Navigate to="/" replace />

  const handleNextStep = (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMsg('')
    const cleanPhone = phone.trim().replace(/[^0-9]/g, '')
    if (!cleanPhone || cleanPhone.length < 8) {
      setErrorMsg(t('login.errBadPhone'))
      return
    }
    setLoginStep('pin')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMsg('')
    setBusy(true)

    const cleanPhone = phone.trim().replace(/[^0-9]/g, '')
    const cleanPin = pin.trim().replace(/[^0-9]/g, '')

    if (isRegistering) {
      if (!name.trim()) {
        setErrorMsg(t('login.errNoName'))
        setBusy(false)
        return
      }
      if (!cleanPhone || cleanPhone.length < 8) {
        setErrorMsg(t('login.errBadPhone'))
        setBusy(false)
        return
      }
      if (cleanPin.length < 6) {
        setErrorMsg(t('login.errPinLength'))
        setBusy(false)
        return
      }
      try {
        await signUpWithPhone(cleanPhone, cleanPin, name.trim())
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : t('login.errRegisterFailed'))
      } finally {
        setBusy(false)
      }
    } else {
      if (cleanPin.length < 6) {
        setErrorMsg(t('login.errPinRequired'))
        setBusy(false)
        return
      }
      try {
        await signInWithPhone(cleanPhone, cleanPin)
      } catch {
        setErrorMsg(t('login.errWrongCredentials'))
      } finally {
        setBusy(false)
      }
    }
  }

  const handleGoogleLogin = async () => {
    setBusy(true)
    try {
      await signInWithGoogle()
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : t('login.errGoogleFailed'))
    } finally {
      setBusy(false)
    }
  }

  const toggleMode = () => {
    setIsRegistering(!isRegistering)
    setLoginStep('phone')
    setPin('')
    setErrorMsg('')
  }

  return (
    <div className="relative flex min-h-screen w-full items-center justify-center overflow-hidden bg-background px-4 py-10 sm:px-6">
      {/* Ambient background glow & mesh circles */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 left-1/2 h-[500px] w-[500px] -translate-x-1/2 rounded-full bg-primary/15 blur-[120px]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-40 right-10 h-[400px] w-[400px] rounded-full bg-primary/10 blur-[100px]"
      />

      {/* Main Glassmorphic Card */}
      <div className="relative z-10 w-full max-w-md overflow-hidden rounded-[32px] border border-border/80 bg-surface/90 shadow-2xl backdrop-blur-xl transition-all duration-300">
        {/* Brand Header */}
        <div className="brand-gradient relative px-8 pb-10 pt-12 text-center text-white">
          <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-3xl bg-white/95 shadow-xl shadow-black/10 ring-4 ring-white/20 transition-transform duration-300 hover:scale-105">
            <img src="/logo.svg" alt="Tracr" className="h-12 w-12" />
          </div>
          <div className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold text-white/90 backdrop-blur-md mb-2">
            <Sparkles className="h-3.5 w-3.5" />
            {t('login.tagline')}
          </div>
          <h1 className="font-display text-4xl font-black tracking-tight">Tracr</h1>
          <p className="mt-2 text-sm font-medium text-white/85">
            {t(isRegistering ? 'login.subtitleRegister' : 'login.subtitleSignIn')}
          </p>
        </div>

        {/* Form Body */}
        <div className="px-7 pb-8 pt-8 sm:px-9">
          {errorMsg && (
            <div className="mb-5 flex items-center gap-2 rounded-2xl bg-negative/10 px-4 py-3 text-sm font-semibold text-negative border border-negative/20 animate-slide-up">
              <span className="h-2 w-2 rounded-full bg-negative shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {isRegistering ? (
            /* Register Form */
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="mb-1.5 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  <User className="h-3.5 w-3.5 text-primary" />
                  {t('login.fullName')}
                </label>
                <Input
                  type="text"
                  placeholder={t('login.fullNamePlaceholder')}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={busy}
                  autoComplete="name"
                  className="rounded-2xl"
                />
              </div>

              <div>
                <label className="mb-1.5 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  <Smartphone className="h-3.5 w-3.5 text-primary" />
                  {t('login.phone')}
                </label>
                <Input
                  type="tel"
                  placeholder="08123456789"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  disabled={busy}
                  autoComplete="tel"
                  className="rounded-2xl"
                />
              </div>

              <div>
                <label className="mb-2 flex items-center justify-between text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <KeyRound className="h-3.5 w-3.5 text-primary" />
                    {t('login.createPin')}
                  </span>
                </label>
                <PinInput value={pin} onChange={setPin} disabled={busy} />
              </div>

              <Button
                type="submit"
                size="lg"
                loading={busy}
                className="btn-sheen group mt-4 w-full rounded-2xl py-3.5 font-bold shadow-lg shadow-primary/25 transition-all duration-300 hover:brightness-105 active:scale-[0.99]"
              >
                <span>{t('login.register')}</span>
                <ArrowRight className="ml-2 h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
              </Button>
            </form>
          ) : loginStep === 'phone' ? (
            /* Step 1: Input Phone Number */
            <form onSubmit={handleNextStep} className="space-y-5">
              <div>
                <label className="mb-1.5 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  <Smartphone className="h-3.5 w-3.5 text-primary" />
                  {t('login.yourPhone')}
                </label>
                <Input
                  type="tel"
                  placeholder="08123456789"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  disabled={busy}
                  autoFocus
                  autoComplete="tel"
                  className="rounded-2xl text-base py-3"
                />
              </div>

              <Button
                type="submit"
                size="lg"
                loading={busy}
                className="btn-sheen group w-full rounded-2xl py-3.5 font-bold shadow-lg shadow-primary/25 transition-all duration-300 hover:brightness-105 active:scale-[0.99]"
              >
                <span>{t('login.continue')}</span>
                <ArrowRight className="ml-2 h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
              </Button>
            </form>
          ) : (
            /* Step 2: Input PIN for Found Account */
            <form onSubmit={handleSubmit} className="space-y-5 animate-fade-in">
              {/* Account summary pill */}
              <div className="flex items-center justify-between rounded-2xl border border-primary/20 bg-primary/5 p-4 shadow-sm">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground font-bold">
                    <Smartphone className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <span className="block text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                      {t('login.account')}
                    </span>
                    <span className="block truncate text-sm font-extrabold text-foreground">
                      {phone}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setLoginStep('phone')
                    setPin('')
                    setErrorMsg('')
                  }}
                  className="flex items-center gap-1 rounded-xl bg-surface px-3 py-1.5 text-xs font-bold text-primary border border-border transition-colors hover:bg-surface-muted"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                  {t('login.change')}
                </button>
              </div>

              <div>
                <label className="mb-2 flex items-center justify-between text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <Lock className="h-3.5 w-3.5 text-primary" />
                    {t('login.enterPin')}
                  </span>
                </label>
                <PinInput value={pin} onChange={setPin} disabled={busy} autoFocus />
              </div>

              <Button
                type="submit"
                size="lg"
                loading={busy}
                className="btn-sheen group w-full rounded-2xl py-3.5 font-bold shadow-lg shadow-primary/25 transition-all duration-300 hover:brightness-105 active:scale-[0.99]"
              >
                <span>{t('login.signIn')}</span>
                <ArrowRight className="ml-2 h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
              </Button>
            </form>
          )}

          {/* Toggle Register / Login Mode */}
          <div className="mt-6 text-center">
            <button
              type="button"
              onClick={toggleMode}
              className="group inline-flex items-center text-sm font-bold text-primary transition-colors hover:text-primary/80"
            >
              <span>{t(isRegistering ? 'login.haveAccount' : 'login.noAccount')}</span>
            </button>
          </div>

          {/* Divider */}
          <div className="relative my-7">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-border/80" />
            </div>
            <div className="relative flex justify-center text-[10px] font-extrabold uppercase tracking-widest">
              <span className="bg-surface px-3 text-muted-foreground">{t('login.orSignInWith')}</span>
            </div>
          </div>

          {/* Google Sign In Button */}
          <Button
            type="button"
            size="lg"
            variant="outline"
            loading={busy}
            onClick={handleGoogleLogin}
            className="w-full rounded-2xl py-3.5 font-bold border-border/80 shadow-sm transition-all duration-200 hover:border-primary/50 hover:bg-surface-muted/50 active:scale-[0.99]"
          >
            <GoogleIcon />
            <span>{t('login.continueWithGoogle')}</span>
          </Button>

          {/* Trust & Security Badge */}
          <div className="mt-8 flex items-center justify-center gap-1.5 text-center text-xs font-semibold text-muted-foreground/80">
            <ShieldCheck className="h-4 w-4 text-emerald-500 shrink-0" />
            <span>{t('login.securityNote')}</span>
          </div>
        </div>
      </div>
    </div>
  )
}

function GoogleIcon() {
  return (
    <svg className="h-5 w-5 mr-2 shrink-0" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1Z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84Z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.3 9.14 5.38 12 5.38Z"
      />
    </svg>
  )
}


