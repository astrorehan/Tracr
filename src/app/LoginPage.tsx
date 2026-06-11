import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '@/features/auth/useAuth'
import { Button } from '@/components/ui/Button'
import { CenterSpinner } from '@/components/ui/States'

export function LoginPage() {
  const { session, loading, signInWithGoogle } = useAuth()
  const [busy, setBusy] = useState(false)

  if (loading) return <CenterSpinner />
  if (session) return <Navigate to="/" replace />

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-6 bg-background">
      {/* Decorative warm blurs */}
      <div className="absolute top-1/4 -left-20 -z-10 h-72 w-72 rounded-full bg-amber-500/12 dark:bg-amber-500/8 blur-[100px] pointer-events-none" />
      <div className="absolute bottom-1/4 -right-20 -z-10 h-80 w-80 rounded-full bg-orange-500/10 dark:bg-orange-500/6 blur-[120px] pointer-events-none" />

      <div className="w-full max-w-md rounded-[32px] border border-border/80 bg-surface/60 backdrop-blur-md p-8 shadow-xl text-center animate-fade-in relative">
        <div className="relative mx-auto mb-6 h-20 w-20">
          <div className="absolute inset-0 rounded-3xl bg-amber-500 blur-xl opacity-30 dark:opacity-25" />
          <img src="/logo.svg" alt="" className="relative h-20 w-20 rounded-3xl shadow-md border border-border" />
        </div>

        <h1 className="text-5xl font-black tracking-tight text-foreground">Tracr</h1>
        
        <p className="section-head mt-3 text-base leading-relaxed text-muted-foreground">
          A quiet ledger for everything you own.
        </p>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground/80">
          Cash, cards, e-wallets, crypto, stocks — written down in one place, in your own currency.
        </p>

        <Button
          size="lg"
          variant="primary"
          loading={busy}
          onClick={async () => {
            setBusy(true)
            try {
              await signInWithGoogle()
            } finally {
              setBusy(false)
            }
          }}
          className="mt-8 w-full font-semibold shadow-md active:scale-[0.98]"
        >
          <GoogleIcon />
          Continue with Google
        </Button>

        <p className="mt-8 text-xs leading-relaxed text-muted-foreground">
          Private by default — your numbers belong to your account
          <br />
          and nobody else sees them.
        </p>
      </div>
    </div>
  )
}

function GoogleIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden>
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
