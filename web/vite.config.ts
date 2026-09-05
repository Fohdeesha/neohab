import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// The version the About screen reports. Read from package.json rather than an env var so it is
// right however the build was started - Maven runs npm itself, and npm_package_* is not set then.
const pkgVersion = (
  JSON.parse(readFileSync(fileURLToPath(new URL('./package.json', import.meta.url)), 'utf8')) as { version?: string }
).version ?? '0.0.0'

// Dev server proxies openHAB endpoints to a live instance.
// Set OPENHAB_URL in web/.env.local (not committed) to point at your server,
// e.g. OPENHAB_URL=http://192.168.1.100:8080
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const target = env.OPENHAB_URL || 'http://localhost:8080'
  // '^/icon/' as a regex: a plain '/icon' prefix would also swallow the app's own
  // /icons/* bundled packs and 404 them against the openHAB server.
  const proxy = Object.fromEntries(
    ['/rest', '/auth', '^/icon/', '/static', '/images'].map((path) => [
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
          globPatterns: ['index.html', 'assets/*.{js,css}', 'tile.png', 'pwa-*.png', 'favicon.{svg,ico}', 'apple-touch-icon.png', 'fonts/*.woff2', 'backgrounds/*.jpg', 'docs/*.html'],
          // hls.js is half a megabyte that only a camera widget falling back to HLS ever needs,
          // and a camera needs the network anyway - there is nothing for an offline copy to do.
          globIgnores: ['**/hls-*.js'],
          navigateFallback: null,
        },
      }),
    ],
    define: {
      __NEOHAB_VERSION__: JSON.stringify(pkgVersion),
    },
    server: {
      proxy,
    },
    build: {
      target: 'es2020',
    },
  }
})
