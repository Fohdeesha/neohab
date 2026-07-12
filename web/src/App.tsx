import { useEffect, useState } from 'react'
import { registerBuiltinWidgets } from './widgets'
import { startItemTracking } from './store/items'
import { loadDashboards, useConfigStore } from './store/config'
import { getRootInfo } from './api/items'
import { completeLogin } from './api/auth'
import { useRoute } from './app/router'
import { Home } from './app/Home'
import { DashboardView } from './app/DashboardView'

registerBuiltinWidgets()

export default function App() {
  const route = useRoute()
  const loaded = useConfigStore((s) => s.loaded)
  const [ohVersion, setOhVersion] = useState<string>()

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
      void loadDashboards()

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
    <main className="nh-app">
      {route.name === 'home' ? <Home ohVersion={ohVersion} /> : <DashboardView id={route.id} />}
    </main>
  )
}
