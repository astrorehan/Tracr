import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

/**
 * Browser Web Push subscription management. The daily `send-push` Edge Function
 * (see supabase/functions/send-push) delivers alerts to the endpoints we store
 * here. VAPID public key comes from the build env; the private key lives only
 * server-side in app_secrets.
 */

const VAPID_PUBLIC = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined

/** Push needs a service worker, the Push API, Notifications, and a VAPID key. */
export function pushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window &&
    !!VAPID_PUBLIC
  )
}

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  // Back the array with a concrete ArrayBuffer so it satisfies BufferSource.
  const out = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

async function subscribe(): Promise<void> {
  const reg = await navigator.serviceWorker.ready
  const existing = await reg.pushManager.getSubscription()
  const sub =
    existing ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC!),
    }))

  const keys = sub.toJSON().keys
  if (!keys?.p256dh || !keys?.auth) throw new Error('Could not read push keys.')

  const { data: userData } = await supabase.auth.getUser()
  const userId = userData.user?.id
  if (!userId) throw new Error('Not signed in.')

  // Upsert on endpoint so re-enabling on the same device is idempotent.
  const { error } = await supabase.from('push_subscriptions').upsert(
    {
      user_id: userId,
      endpoint: sub.endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth,
      last_seen_at: new Date().toISOString(),
    },
    { onConflict: 'endpoint' },
  )
  if (error) throw error
}

async function unsubscribe(): Promise<void> {
  const reg = await navigator.serviceWorker.ready
  const sub = await reg.pushManager.getSubscription()
  if (!sub) return
  await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
  await sub.unsubscribe()
}

export interface PushReminders {
  supported: boolean
  enabled: boolean
  busy: boolean
  error: string | null
  /** True when the browser has hard-blocked notifications (must fix in settings). */
  blocked: boolean
  enable: () => Promise<void>
  disable: () => Promise<void>
}

/** Toggle Web Push reminders for this device, reflecting the live subscription. */
export function usePushReminders(): PushReminders {
  const [supported] = useState(pushSupported)
  const [enabled, setEnabled] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!supported) return
    let alive = true
    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => alive && setEnabled(!!sub))
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [supported])

  const enable = useCallback(async () => {
    setBusy(true)
    setError(null)
    try {
      const perm = await Notification.requestPermission()
      if (perm !== 'granted') {
        setError('Notifications are turned off for this site in your browser settings.')
        return
      }
      await subscribe()
      setEnabled(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not turn on reminders.')
    } finally {
      setBusy(false)
    }
  }, [])

  const disable = useCallback(async () => {
    setBusy(true)
    setError(null)
    try {
      await unsubscribe()
      setEnabled(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not turn off reminders.')
    } finally {
      setBusy(false)
    }
  }, [])

  const blocked =
    supported && typeof Notification !== 'undefined' && Notification.permission === 'denied'

  return { supported, enabled, busy, error, blocked, enable, disable }
}
