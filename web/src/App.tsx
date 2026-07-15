import { useEffect, useState } from 'react'
import { registerBuiltinWidgets } from './widgets'
import { startItemTracking } from './store/items'
import { loadConfig, useConfigStore } from './store/config'
import { getRootInfo } from './api/items'
import { completeLogin } from './api/auth'
import { applyTheme, cacheTheme, resolveTheme } from './themes/themes'
import { useRoute } from './app/router'
import { Home } from './app/Home'
import { DashboardView } from './app/DashboardView'
import { SettingsView } from './app/SettingsView'
import { Sidebar } from './app/Sidebar'
import { useSidebarLayout } from './store/sidebar'
import { Toast } from './components/Toast'

registerBuiltinWidgets()

export default function App() {
  const route = useRoute()
  const sidebar = useSidebarLayout()
  const loaded = useConfigStore((s) => s.loaded)
  const themeId = useConfigStore((s) => s.settings.theme)
  const customThemes = useConfigStore((s) => s.customThemes)
  const [ohVersion, setOhVersion] = useState<string>()

  // Apply (and cache) the active theme whenever the choice or a custom theme changes.
  useEffect(() => {
    if (!loaded) return
    const theme = resolveTheme(themeId, customThemes)
    applyTheme(theme)
    cacheTheme(theme)
  }, [loaded, themeId, customThemes])

  useEffect(() => {
    let cancelled = false

    async function boot() {
      // Finish an in-progress login redirect, then clean the code from the URL.
      try {
        if (await completeLogin()) {
          history.replaceState(null, '', window.location.pathname + window.location.hash)
        }
      } catch (err) {
        console.warn('Login could not be completed:', err)
      }

      startItemTracking()
      void loadConfig()

      try {
        const info = await getRootInfo()
        if (!cancelled) setOhVersion(info.runtimeInfo?.version)
      } catch {
        /* status stays "connecting" - the dashboard still works for cached/relative calls */
      }
    }

    void boot()
    return () => {
      cancelled = true
    }
  }, [])

  if (!loaded) {
    return (
      <main className="nh-app nh-app--center">
        <p className="nh-home__status">loading…</p>
      </main>
    )
  }

  return (
    <>
      <Sidebar />
      {/* The inset moves the whole app, sticky top bars included, so the sidebar sits beside
          the content rather than over it. It is 0 whenever the sidebar overlays or is closed. */}
      <main className="nh-app" style={{ paddingLeft: sidebar.inset }}>
        {route.name === 'home' ? (
          <Home ohVersion={ohVersion} />
        ) : route.name === 'settings' ? (
          <SettingsView />
        ) : (
          <DashboardView id={route.id} />
        )}
        <Toast />
      </main>
    </>
  )
}
