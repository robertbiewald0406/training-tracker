/// <reference lib="webworker" />
// Service Worker: Vorab-Speicher (Workbox, wie zuvor), Update auf Wunsch und Push-Nachrichten.
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'
import { parsePushPayload, targetUrl } from './lib/pushPayload'

declare const self: ServiceWorkerGlobalScope

precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()
// Offline-Start: alle Navigationen in der App liefern die vorab gespeicherte index.html.
registerRoute(new NavigationRoute(createHandlerBoundToURL(`${import.meta.env.BASE_URL}index.html`)))

// Neue Version wartet, bis die App "Aktualisieren" sendet (kein Neuladen mitten im Training).
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') void self.skipWaiting()
})

self.addEventListener('push', (event) => {
  const p = parsePushPayload(event.data?.text())
  event.waitUntil(
    self.registration.showNotification(p.title, {
      body: p.body,
      tag: p.tag, // eine Nachricht je Art ersetzt die vorige
      icon: `${import.meta.env.BASE_URL}pwa-192x192.png`,
      badge: `${import.meta.env.BASE_URL}pwa-192x192.png`,
      data: { url: p.url },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const scope = self.registration.scope
  const url = targetUrl(String(event.notification.data?.url ?? './'), scope)
  event.waitUntil(
    (async () => {
      const open = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      const mine = open.find((c) => c.url.startsWith(scope))
      if (mine) {
        await mine.focus()
        if ('navigate' in mine && mine.url !== url) await mine.navigate(url).catch(() => {})
        return
      }
      await self.clients.openWindow(url)
    })(),
  )
})
