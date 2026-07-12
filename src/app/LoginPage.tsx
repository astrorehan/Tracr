import { useState } from 'react'
import { Navigate, Link } from 'react-router-dom'
import { useAuth } from '@/features/auth/useAuth'
import { Button } from '@/components/ui/Button'
import { CenterSpinner } from '@/components/ui/States'

export function LoginPage() {
  const { session, loading, signInWithGoogle } = useAuth()
  const [busy, setBusy] = useState(false)

  if (loading) return <CenterSpinner />
  if (session) return <Navigate to="/" replace />

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6">
      <div className="w-full max-w-sm overflow-hidden rounded-[28px] border border-border bg-surface shadow-lg animate-fade-in">
        {/* Gradient hero — the one "wow" surface (no glass, no blur) */}
        <div className="brand-gradient px-8 pb-9 pt-11 text-center text-white">
          <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-3xl bg-white shadow-md">
            <img src="/logo.svg" alt="" className="h-14 w-14" />
          </div>
          <h1 className="font-display text-4xl font-extrabold tracking-tight">Tracr</h1>
          <p className="mt-2 text-sm font-medium leading-relaxed text-white/90">
            See all your money in one place — cash, cards, e-wallets, and more.
          </p>
        </div>

        {/* Body */}
        <div className="px-8 pb-8 pt-7 text-center">
          <Button
            size="lg"
            variant="outline"
            loading={busy}
            onClick={async () => {
              setBusy(true)
              try {
                await signInWithGoogle()
              } finally {
                setBusy(false)
              }
            }}
            className="w-full"
          >
            <GoogleIcon />
            Continue with Google
          </Button>

          <p className="mt-6 text-sm font-medium leading-relaxed text-muted-foreground">
            🔒 Only you can see your money notes.
          </p>

          <p className="mt-5 text-xs leading-relaxed text-muted-foreground/80">
            By continuing you agree to our{' '}
            <Link
              to="/legal/terms"
              className="font-semibold text-foreground underline-offset-2 hover:underline"
            >
              Terms
            </Link>{' '}
            and{' '}
            <Link
              to="/legal/privacy"
              className="font-semibold text-foreground underline-offset-2 hover:underline"
            >
              Privacy Policy
            </Link>
            .
          </p>
        </div>
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
