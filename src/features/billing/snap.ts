/** True once a real Midtrans client key is configured. The Billing page uses
 *  this to gate the top-up buttons — no manual "flip live" step needed, it
 *  activates itself the moment VITE_MIDTRANS_CLIENT_KEY is set. */
export const midtransConfigured = Boolean(import.meta.env.VITE_MIDTRANS_CLIENT_KEY)

let loading: Promise<void> | null = null

/** Lazily loads Midtrans's snap.js (not globally in index.html — a payment
 *  script has no business loading on every page view). Safe to call more
 *  than once; resolves immediately if already loaded. */
export function loadSnapJs(): Promise<void> {
  // deno-lint-ignore no-explicit-any
  if (typeof window !== 'undefined' && (window as any).snap) return Promise.resolve()
  if (loading) return loading
  loading = new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src =
      import.meta.env.VITE_MIDTRANS_IS_PRODUCTION === 'true'
        ? 'https://app.midtrans.com/snap/snap.js'
        : 'https://app.sandbox.midtrans.com/snap/snap.js'
    script.setAttribute('data-client-key', import.meta.env.VITE_MIDTRANS_CLIENT_KEY ?? '')
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('snap.js failed to load'))
    document.head.appendChild(script)
  })
  return loading
}

export interface SnapResult {
  order_id?: string
  transaction_status?: string
}

/** Open the Snap popup for a token from billing-checkout. Resolves on
 *  success/close, rejects on error — the webhook (not this callback) is the
 *  source of truth for whether credits actually landed. */
export function snapPay(token: string): Promise<'success' | 'pending' | 'closed'> {
  return new Promise((resolve, reject) => {
    // deno-lint-ignore no-explicit-any
    const snap = (window as any).snap
    if (!snap) return reject(new Error('snap.js not loaded'))
    snap.pay(token, {
      onSuccess: () => resolve('success'),
      onPending: () => resolve('pending'),
      onError: (result: unknown) => reject(new Error(`Midtrans error: ${JSON.stringify(result)}`)),
      onClose: () => resolve('closed'),
    })
  })
}
