import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import './i18n'
import App from './App.tsx'
import { AppBoundary } from './components/AppBoundary.tsx'
import { applyCachedTheme } from './themes/themes.ts'
import { applyDeviceTextSize } from './store/textsize.ts'
import { installHistoryHook } from './store/history.ts'
import { restoreBasicCredentials } from './api/auth.ts'
import './app.css'

// Apply the last-used theme and this device's text size before first paint, to avoid a
// flash of the defaults.
applyCachedTheme()
applyDeviceTextSize()

// Reverse-proxy credentials the openHAB phone app or the browser's password manager already
// holds. The app waits for this before its first request: the phone-app bridge answers
// synchronously, but the password manager does not, and a request that goes out first is
// answered by the proxy with a 401 that nothing retries.
const credentialsReady = restoreBasicCredentials()

// Every configuration write takes a restore point first. Registered here rather than imported
// by the configuration store, so that store depends on nothing.
installHistoryHook()

// Install/refresh the offline app shell. No-ops where service workers are unavailable (plain
// HTTP). A new build deployed to the server replaces the cached shell automatically; wall
// panels that never reload also check hourly.
registerSW({
  immediate: true,
  onRegisteredSW(_url, registration) {
    if (registration) setInterval(() => void registration.update(), 60 * 60 * 1000)
  }
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppBoundary where="the app">
      <App credentialsReady={credentialsReady} />
    </AppBoundary>
  </StrictMode>
)
