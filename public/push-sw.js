/* global self, clients */
// Web Push handlers, imported into the generated Workbox service worker via
// `workbox.importScripts` (see vite.config.ts). Renders the notification the
// `send-push` Edge Function delivers and routes a tap to the right page.

self.addEventListener('push', (event) => {
  let payload = {}
  try {
    payload = event.data ? event.data.json() : {}
  } catch {
    payload = {}
  }
  const title = payload.title || 'Tracr'
  const options = {
    body: payload.body || '',
    tag: payload.tag, // stable id → a re-push replaces rather than stacks
    data: { href: payload.href || '/' },
    icon: '/pwa-192x192.png',
    badge: '/pwa-64x64.png',
  }
  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const href = (event.notification.data && event.notification.data.href) || '/'
  event.waitUntil(
    (async () => {
      const windows = await clients.matchAll({ type: 'window', includeUncontrolled: true })
      for (const client of windows) {
        if ('focus' in client) {
          await client.focus()
          if ('navigate' in client) await client.navigate(href)
          return
        }
      }
      if (clients.openWindow) await clients.openWindow(href)
    })(),
  )
})
