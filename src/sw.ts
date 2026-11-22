/// <reference lib="webworker" />
import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching'

declare const self: ServiceWorkerGlobalScope

precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()
self.skipWaiting()
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()))

interface PushPayload {
  title: string
  body: string
  url?: string
  tag?: string
}

self.addEventListener('push', (event) => {
  let data: PushPayload = { title: 'BaroB', body: '' }
  try {
    data = { ...data, ...(event.data?.json() as PushPayload) }
  } catch {
    data.body = event.data?.text() ?? ''
  }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      tag: data.tag,
      icon: 'pwa-192x192.png',
      badge: 'pwa-64x64.png',
      data: { url: data.url ?? '#/' },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = new URL((event.notification.data?.url as string) ?? '#/', self.registration.scope).href
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      for (const c of all) {
        if ('focus' in c) {
          await (c as WindowClient).navigate(target).catch(() => {})
          return (c as WindowClient).focus()
        }
      }
      return self.clients.openWindow(target)
    })(),
  )
})
