import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import './i18n'
import App from './App.tsx'
import { AppBoundary } from './components/AppBoundary.tsx'
import { announceUpdate } from './components/UpdateNotice.tsx'
import { applyCachedTheme } from './themes/themes.ts'
import { applyLaunchQuery } from './app/router.ts'
import { applyDeviceTextSize } from './store/textsize.ts'
import { installHistoryHook } from './store/history.ts'
import { restoreBasicCredentials } from './api/auth.ts'
import './app.css'

applyLaunchQuery()
applyCachedTheme()
applyDeviceTextSize()

const credentialsReady = restoreBasicCredentials()

installHistoryHook()

registerSW({
  immediate: true,
  // left to itself the plugin reloads the page the moment a new build activates, draft or no draft
  onNeedReload: announceUpdate,
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
