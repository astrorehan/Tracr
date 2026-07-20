// Midtrans HTTP Notification webhook — payment status updates for top-up
// purchases (Snap). Public endpoint, no JWT: the signature IS the auth, same
// trust model as wa-webhook's HMAC check.
//
// Verification: signature_key === SHA512(order_id + status_code + gross_amount
// + MIDTRANS_SERVER_KEY). gross_amount MUST be used exactly as the raw string
// Midtrans sent (e.g. "10000.00") — re-serializing a parsed number breaks it.
//
// Milestone 2 only: only 'topup' orders are dispatched. A notification for an
// order_id this webhook doesn't recognize (not ours, or a future subscription
// order we don't handle yet — see migration 0035's header) is acknowledged
// without erroring, so Midtrans doesn't retry-storm something we can't
// resolve. Idempotency (duplicate notifications) is handled inside the RPCs
// via row locks, not at this HTTP layer.
//
// Secrets (`supabase secrets set`):
//   MIDTRANS_SERVER_KEY    — secret server key from the Midtrans dashboard
//   MIDTRANS_IS_PRODUCTION — 'true' for production keys; unset/'false' = sandbox
// SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are injected by the platform.
import { createClient } from 'jsr:@supabase/supabase-js@2'

interface MidtransNotification {
  order_id?: string
  status_code?: string
  gross_amount?: string
  signature_key?: string
  transaction_status?: string
  fraud_status?: string
  transaction_id?: string
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

// deno-lint-ignore no-explicit-any
function adminClient(): any {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  )
}

async function sha512Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-512', new TextEncoder().encode(input))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 })

  const serverKey = Deno.env.get('MIDTRANS_SERVER_KEY')
  if (!serverKey) {
    console.error('MIDTRANS_SERVER_KEY not set')
    return new Response('server misconfigured', { status: 500 })
  }

  let body: MidtransNotification
  try {
    body = await req.json()
  } catch {
    return new Response('bad json', { status: 400 })
  }

  const { order_id, status_code, gross_amount, signature_key, transaction_status, fraud_status, transaction_id } = body
  if (!order_id || !status_code || !gross_amount || !signature_key) {
    return new Response('missing fields', { status: 400 })
  }

  const expected = await sha512Hex(order_id + status_code + gross_amount + serverKey)
  if (expected !== signature_key) return new Response('bad signature', { status: 403 })

  const admin = adminClient()

  const paid =
    (transaction_status === 'capture' || transaction_status === 'settlement') &&
    (fraud_status == null || fraud_status === 'accept')
  const failed = ['deny', 'cancel', 'expire'].includes(transaction_status ?? '')

  const { data: order } = await admin
    .from('payment_orders')
    .select('kind, status')
    .eq('order_id', order_id)
    .maybeSingle()

  if (!order) {
    console.error('midtrans notification for unknown order_id', order_id)
    return json({ received: true })
  }

  if (order.kind !== 'topup') {
    // subscription_initial / subscription_renewal — not wired up yet.
    console.error('midtrans notification for unsupported order kind', order.kind, order_id)
    return json({ received: true })
  }

  if (paid) {
    const { error } = await admin.rpc('credit_topup_grant', {
      p_order_id: order_id,
      p_midtrans_transaction_id: transaction_id ?? null,
      p_notification: body,
    })
    if (error) console.error('credit_topup_grant failed', error)
  } else if (failed) {
    const { error } = await admin.rpc('payment_order_mark_failed', {
      p_order_id: order_id,
      p_status: transaction_status,
      p_notification: body,
    })
    if (error) console.error('payment_order_mark_failed failed', error)
  }
  // transaction_status 'pending' (VA/QRIS awaiting payment): nothing to do
  // yet, wait for the next notification.

  return json({ received: true })
})
