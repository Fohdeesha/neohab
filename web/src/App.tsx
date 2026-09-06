import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { registerBuiltinWidgets } from './widgets'
import { startItemTracking } from './store/items'
import { loadConfig, useConfigStore } from './store/config'
import { getRootInfo } from './api/items'
import { completeLogin } from './api/auth'
import { errorText } from './api/errors'
import { notify } from './store/notify'
import { refreshAuthStatus } from './store/auth'
import { applyTheme, cacheTheme, resolveTheme, urlThemeOverride } from './themes/themes'
import { useRoute } from './app/router'
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

export default function App({ credentialsReady }: { credentialsReady?: Promise<unknown> }) {
  const { t } = useTranslation()
  const route = useRoute()
  const sidebar = useSidebarLayout()
  const loaded = useConfigStore((s) => s.loaded)
  const themeId = useConfigStore((s) => s.settings.theme)
  const deviceThemeId = useDeviceThemeStore((s) => s.themeId)
  const customThemes = useConfigStore((s) => s.customThemes)
  const [ohVersion, setOhVersion] = useState<string>()

  // Apply (and cache) the active theme whenever the choice or a custom theme changes. The cache
  // stores whatever was applied, so the pre-paint path is correct either way.
  //
  // A theme forced by `?theme=` is applied but deliberately NOT cached: it is meant to last for
  // this page load only, and caching it would make the escape hatch stick to the device.
  useEffect(() => {
    if (!loaded) return
    const forced = urlThemeOverride()
    const theme = forced ?? resolveTheme(deviceThemeId ?? themeId, customThemes)
    applyTheme(theme)
    if (!forced) cacheTheme(theme)
  }, [loaded, themeId, deviceThemeId, customThemes])

  useEffect(() => {
    let cancelled = false

    async function boot() {
      // Any reverse-proxy credentials the browser already had, before the first request goes out.
      // Resolves immediately when there are none to find.
      await credentialsReady

      // Finish an in-progress login redirect, then clean the code from the URL.
      //
      // A failure here used to go to the console alone: the person had just typed their openHAB
      // password, come back, and been shown a signed-out app with `?code=…` still in the address
      // and nothing saying why. The code is single-use and already spent either way, so it is
      // stripped on both paths - leaving it invites a reload that fails again for a new reason.
      try {
        if (await completeLogin()) {
          history.replaceState(null, '', window.location.pathname + window.location.hash)
        }
      } catch (err) {
        history.replaceState(null, '', window.location.pathname + window.location.hash)
        notify(t('Sign-in could not be completed: {{error}}', { error: errorText(err) }))
      }

      startItemTracking()
      void loadConfig()
      void refreshAuthStatus()

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
    // Boot runs once; `credentialsReady` is created before the first render and never changes,
    // and `t` is only used for a notice raised during that one run.
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
