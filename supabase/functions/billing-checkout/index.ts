// Billing checkout — authenticated actions that create a Midtrans payment.
// Runs under the CALLER'S JWT (like ai-analysis), so the payment_orders
// insert is RLS-scoped to the caller automatically.
//
// Milestone 2 only: action:'topup'. 'subscribe'/'cancel' (Pro recurring) are
// not implemented — see migration 0035's header comment for why.
//
// Secrets (`supabase secrets set`):
//   MIDTRANS_SERVER_KEY    — secret server key (Basic Auth username, Snap API)
//   MIDTRANS_IS_PRODUCTION — 'true' for production; unset/'false' = sandbox
// SUPABASE_URL / SUPABASE_ANON_KEY are injected by the platform.
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { encodeBase64 } from 'jsr:@std/encoding@1/base64'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

function snapUrl(): string {
  return Deno.env.get('MIDTRANS_IS_PRODUCTION') === 'true'
    ? 'https://app.midtrans.com/snap/v1/transactions'
    : 'https://app.sandbox.midtrans.com/snap/v1/transactions'
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405)

  const authHeader = req.headers.get('Authorization') ?? ''
  if (!authHeader) return json({ error: 'unauthorized' }, 401)

  const serverKey = Deno.env.get('MIDTRANS_SERVER_KEY')
  if (!serverKey) return json({ error: 'Payment gateway is not configured yet.' }, 503)

  // User-scoped client: the caller's JWT rides on every query → RLS applies,
  // same pattern as ai-analysis.
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } },
  )

  const { data: userData } = await supabase.auth.getUser()
  const user = userData?.user
  if (!user) return json({ error: 'unauthorized' }, 401)

  let body: { action?: string; pack_id?: string }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'bad request' }, 400)
  }

  if (body.action !== 'topup') {
    return json({ error: 'not_available_yet' }, 400)
  }

  const packId = String(body.pack_id ?? '')
  const { data: pack } = await supabase
    .from('credit_packs')
    .select('id, credits, price_idr')
    .eq('id', packId)
    .eq('is_active', true)
    .maybeSingle()
  if (!pack) return json({ error: 'unknown pack' }, 400)

  const orderId = `topup_${crypto.randomUUID()}`

  // Insert before calling out to Midtrans: the webhook must find this row
  // when the notification arrives, and a caller-scoped insert (RLS) is the
  // cheapest proof the order really belongs to this user.
  const { error: insertErr } = await supabase.from('payment_orders').insert({
    order_id: orderId,
    user_id: user.id,
    kind: 'topup',
    status: 'pending',
    credit_pack_id: pack.id,
    gross_amount_idr: pack.price_idr,
  })
  if (insertErr) return json({ error: insertErr.message }, 500)

  const { data: profile } = await supabase
    .from('profiles').select('display_name').eq('id', user.id).single()

  const snapRes = await fetch(snapUrl(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Basic ${encodeBase64(new TextEncoder().encode(`${serverKey}:`))}`,
    },
    body: JSON.stringify({
      transaction_details: { order_id: orderId, gross_amount: pack.price_idr },
      credit_card: { secure: true },
      customer_details: {
        first_name: profile?.display_name || 'Tracr user',
        email: user.email,
      },
    }),
  })

  if (!snapRes.ok) {
    const detail = await snapRes.text().catch(() => '')
    console.error('midtrans snap create failed', snapRes.status, detail)
    return json({ error: 'Could not start payment. Please try again.' }, 502)
  }

  const snap = await snapRes.json() as { token?: string; redirect_url?: string }
  if (!snap.token) return json({ error: 'Could not start payment. Please try again.' }, 502)

  return json({ token: snap.token, redirect_url: snap.redirect_url, order_id: orderId })
})
