import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

const BASE = '/training-tracker/' // Repo-Name auf GitHub Pages

export default defineConfig(({ mode }) => ({
  base: BASE,
  plugins: [
    react(),
    tailwindcss(),
    // Service Worker nur im Build, nicht in Tests.
    mode !== 'test' &&
      VitePWA({
        // "prompt": Eine neue Version wird im Hintergrund geladen und aktiviert sich beim naechsten App-Start.
        // Die App zeigt "Neue Version" und kann sofort aktualisieren. Kein Neuladen mitten im Training.
        registerType: 'prompt',
        base: BASE,
        includeAssets: ['icon.svg', 'apple-touch-icon.png'],
        manifest: {
          id: BASE,
          name: 'Lift Heavy',
          short_name: 'Lift Heavy',
          description: 'Trainings-Tracker: Sätze sofort lokal speichern, offline lauffähig.',
          lang: 'de',
          start_url: BASE,
          scope: BASE,
          display: 'standalone',
          orientation: 'portrait',
          theme_color: '#E91E8C',
          background_color: '#BDE8FA',
          icons: [
            { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
            { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
            { src: 'pwa-maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
        },
        workbox: {
          // Alle App-Dateien und Schriften vorab speichern, damit der Start ohne Netz klappt.
          globPatterns: ['**/*.{js,css,html,woff2,png,svg,webmanifest}'],
          navigateFallback: `${BASE}index.html`,
          cleanupOutdatedCaches: true,
        },
      }),
  ],
  test: { environment: 'node', setupFiles: ['fake-indexeddb/auto'] },
}))
