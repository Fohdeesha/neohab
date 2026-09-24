import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { registerBuiltinWidgets } from './widgets'
import { startItemTracking } from './store/items'
import { loadConfig, useConfigStore } from './store/config'
import { getRootInfo } from './api/items'
import { completeLogin, takeReturnHash } from './api/auth'
import { errorText } from './api/errors'
import { notify } from './store/notify'
import { refreshAuthStatus } from './store/auth'
import { applyTheme, cacheTheme, resolveTheme, urlThemeOverride } from './themes/themes'
import { useRoute } from './app/router'
import { syncAppManifest, syncTitle } from './app/webmanifest'
import { Home } from './app/Home'
import { DashboardView } from './app/DashboardView'
import { SettingsView } from './app/SettingsView'
import { ChartView } from './app/ChartView'
import { LogView } from './app/LogView'
import { Sidebar } from './app/Sidebar'
import { useSidebarLayout } from './store/sidebar'
import { AppBoundary } from './components/AppBoundary'
import { Toast } from './components/Toast'
import { LiveStatus } from './components/LiveStatus'
import { UpdateNotice } from './components/UpdateNotice'
import { KioskRuntime } from './kiosk/KioskRuntime'
import { Screensaver } from './kiosk/Screensaver'
import { AudioRuntime } from './audio/AudioRuntime'
import { useDeviceThemeStore } from './store/deviceTheme'

registerBuiltinWidgets()

const RELOAD_AFTER_FAILURE_MS = 30_000

export default function App({ credentialsReady }: { credentialsReady?: Promise<unknown> }) {
  const { t } = useTranslation()
  const route = useRoute()
  const sidebar = useSidebarLayout()
  const loaded = useConfigStore((s) => s.loaded)
  const themeId = useConfigStore((s) => s.settings.theme)
  const deviceThemeId = useDeviceThemeStore((s) => s.themeId)
  const customThemes = useConfigStore((s) => s.customThemes)
  const loadFailed = useConfigStore((s) => s.error !== null && !s.authRequired)
  const [ohVersion, setOhVersion] = useState<string>()

  // a wall panel that booted while openHAB restarted has nobody there to press Try again
  useEffect(() => {
    if (!loadFailed) return
    const timer = window.setInterval(() => {
      if (!useConfigStore.getState().loading) void loadConfig()
    }, RELOAD_AFTER_FAILURE_MS)
    return () => window.clearInterval(timer)
  }, [loadFailed])

  useEffect(() => {
    if (!loaded) return
    const forced = urlThemeOverride()
    const theme = forced ?? resolveTheme(deviceThemeId ?? themeId, customThemes)
    applyTheme(theme)
    if (!forced) cacheTheme(theme)
  }, [loaded, themeId, deviceThemeId, customThemes])

  // installing from a dashboard should pin that dashboard, so the manifest the browser reads
  // names it; anywhere else the add-on's own manifest stands
  const dashId = route.name === 'dashboard' ? route.id : null
  const dashName = useConfigStore((s) => (dashId ? (s.dashboards.find((d) => d.id === dashId)?.name ?? null) : null))
  useEffect(() => {
    const dashboard = dashId !== null && dashName !== null ? { id: dashId, name: dashName } : null
    syncAppManifest(dashboard)
    syncTitle(dashboard)
  }, [dashId, dashName])

  useEffect(() => {
    let cancelled = false

    async function boot() {
      await credentialsReady

      // back to where the sign-in started, rather than wherever the login page's redirect lands
      const backTo = () => {
        history.replaceState(null, '', window.location.pathname + (takeReturnHash() || window.location.hash))
        window.dispatchEvent(new HashChangeEvent('hashchange'))
      }
      try {
        if (await completeLogin()) backTo()
      } catch (err) {
        backTo()
        notify(t('Sign-in could not be completed: {{error}}', { error: errorText(err) }))
      }

      startItemTracking()
      void loadConfig()
      void refreshAuthStatus()

      try {
        const info = await getRootInfo()
        if (!cancelled) setOhVersion(info.runtimeInfo?.version)
      } catch {
        // no version to show; the dashboard works either way
      }
    }

    void boot()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!loaded) {
    return (
      <main className="nh-app nh-app--center">
        <p className="nh-home__status">{t('loading…')}</p>
      </main>
    )
  }

  return (
    <>
      <AppBoundary silent where="the sidebar">
        <Sidebar />
      </AppBoundary>
      {/* The inset moves the whole app, sticky top bars included, so the sidebar sits beside
          the content rather than over it. It is 0 whenever the sidebar overlays or is closed. */}
      <main className="nh-app" style={{ paddingLeft: sidebar.inset }}>
        {/* One screen failing keeps the sidebar and the way to Settings. Keyed on the route so
            moving to a working screen clears the panel. */}
        <AppBoundary key={JSON.stringify(route)} where={`the ${route.name} screen`}>
          {route.name === 'home' ? (
            <Home ohVersion={ohVersion} />
          ) : route.name === 'settings' ? (
            <SettingsView />
          ) : route.name === 'chart' ? (
            <ChartView dashboardId={route.dashboard} widgetId={route.widget} />
          ) : route.name === 'log' ? (
            <LogView dashboardId={route.dashboard} widgetId={route.widget} />
          ) : (
            <DashboardView id={route.id} />
          )}
        </AppBoundary>
        <Toast />
        <LiveStatus />
        <UpdateNotice />
      </main>
      <AppBoundary silent where="the kiosk runtime">
        <KioskRuntime />
      </AppBoundary>
      <AppBoundary silent where="the audio runtime">
        <AudioRuntime />
      </AppBoundary>
      <AppBoundary silent where="the screensaver">
        <Screensaver />
      </AppBoundary>
    </>
  )
}
