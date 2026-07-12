import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

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
    plugins: [react()],
    server: {
      proxy,
    },
    build: {
      target: 'es2020',
    },
  }
})
