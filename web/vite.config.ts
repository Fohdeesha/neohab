import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// Dev server proxies openHAB endpoints to a live instance.
// Set OPENHAB_URL in web/.env.local (not committed) to point at your server,
// e.g. OPENHAB_URL=http://192.168.1.100:8080
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const target = env.OPENHAB_URL || 'http://localhost:8080'
  const proxy = Object.fromEntries(
    ['/rest', '/auth', '/icon', '/static', '/images'].map((path) => [
      path,
      { target, changeOrigin: true },
    ])
  )

  return {
    // the app is served from /neohab/ by the add-on, so all asset URLs must be relative
    base: './',
    plugins: [
      react(),
      // Installable app + offline-capable shell. Browsers only run service workers on secure
      // origins (HTTPS or localhost); elsewhere registration silently no-ops and the app is
      // served plain, exactly as before.
      VitePWA({
        registerType: 'autoUpdate',
        // .json rather than .webmanifest: the add-on's static file serving knows that MIME type
        manifestFilename: 'manifest.json',
        manifest: {
          name: 'neohab',
          short_name: 'neohab',
          description: 'Dashboards for openHAB',
          start_url: './',
          scope: './',
          display: 'standalone',
          background_color: '#0f1317',
          theme_color: '#0f1317',
          icons: [
            { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
            { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
            { src: 'pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
        },
        workbox: {
          // Precache the app shell only. The bundled icon packs (7k files) load on demand, and
          // /rest, /icon etc. are deliberately never cached: on a dashboard, stale item states
          // are worse than an offline error.
          globPatterns: ['index.html', 'assets/*.{js,css}', 'tile.png', 'pwa-*.png'],
          navigateFallback: null,
        },
      }),
    ],
    server: {
      proxy,
    },
    build: {
      target: 'es2020',
    },
  }
})
