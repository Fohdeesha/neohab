import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

const pkgVersion = (
  JSON.parse(readFileSync(fileURLToPath(new URL('./package.json', import.meta.url)), 'utf8')) as { version?: string }
).version ?? '0.0.0'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const target = env.OPENHAB_URL || 'http://localhost:8080'
  const proxy = Object.fromEntries(
    ['/rest', '/auth', '^/icon/', '/static', '/images'].map((path) => [
      path,
      { target, changeOrigin: true },
    ])
  )

  return {
    base: './',
    plugins: [
      react(),
      VitePWA({
        registerType: 'autoUpdate',
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
            { src: 'pwa-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
            { src: 'pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
            // its own file: a launcher shows about the middle two thirds of a maskable icon, so
            // the mark has to sit smaller in it than in the ones nothing crops
            { src: 'pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
        },
        workbox: {
          globPatterns: ['index.html', 'assets/*.{js,css}', 'tile.png', 'pwa-*.png', 'favicon.{svg,ico}', 'apple-touch-icon.png', 'fonts/*.woff2', 'backgrounds/*.jpg', 'docs/*.html'],
          globIgnores: ['**/hls-*.js'],
          navigateFallback: null,
          // a shortcut into a dashboard launches index.html?app=<id>, which has to hit the same
          // precached index.html or an offline wall panel gets nothing
          ignoreURLParametersMatching: [/^app$/, /^utm_/, /^fbclid$/],
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
