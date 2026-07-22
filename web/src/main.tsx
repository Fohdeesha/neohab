import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import './i18n'
import App from './App.tsx'
import { applyCachedTheme } from './themes/themes.ts'
import { applyDeviceTextSize } from './store/textsize.ts'
import './app.css'

// Apply the last-used theme and this device's text size before first paint, to avoid a
// flash of the defaults.
applyCachedTheme()
applyDeviceTextSize()

// Install/refresh the offline app shell. No-ops where service workers are unavailable (plain
// HTTP). A new build deployed to the server replaces the cached shell automatically; wall
// panels that never reload also check hourly.
registerSW({
  immediate: true,
  onRegisteredSW(_url, registration) {
    if (registration) setInterval(() => void registration.update(), 60 * 60 * 1000)
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
