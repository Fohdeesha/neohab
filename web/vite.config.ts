import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import pkg from './package.json'

// Only what can run is locked down: no inline script, no javascript: URL, no eval, anywhere in the app's
// own origin. Images, frames, streams and styles stay open, because templates, cameras and the weather
// feed all reach other hosts. A JavaScript widget runs in public/jswidget.html, a page with its own policy.
const CONTENT_POLICY = "script-src 'self'; worker-src 'self' blob:; object-src 'none'; base-uri 'self'"

// build only: the dev server injects an inline script of its own
const contentPolicy = {
  name: 'neohab-content-policy',
  apply: 'build' as const,
  transformIndexHtml: () => [
    { tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: CONTENT_POLICY }, injectTo: 'head-prepend' as const }
  ]
}

export default defineConfig(({ mode }) => {
  // '.' is the working directory, as process.cwd() was, and keeps this file free of node's types
  const env = loadEnv(mode, '.', '')
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
      contentPolicy,
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
          globPatterns: [
            'index.html',
            'probe.js',
            'jswidget.html',
            'assets/*.{js,css}',
            'tile.png',
            'pwa-*.png',
            'favicon.{svg,ico}',
            'apple-touch-icon.png',
            'fonts/*.woff2',
            'backgrounds/*.jpg',
            'docs/*.html'
          ],
          globIgnores: ['**/hls-*.js'],
          navigateFallback: null,
          // a shortcut into a dashboard launches index.html?app=<id>, which has to hit the same
          // precached index.html or an offline wall panel gets nothing
          ignoreURLParametersMatching: [/^app$/, /^utm_/, /^fbclid$/],
        },
      }),
    ],
    define: {
      __NEOHAB_VERSION__: JSON.stringify(pkg.version),
    },
    server: {
      proxy,
    },
    build: {
      target: 'es2020',
    },
  }
})
