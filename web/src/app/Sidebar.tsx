import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useConfigStore } from '../store/config'
import { closeSidebar, setSidebarPinned, toggleSidebar, useSidebarLayout } from '../store/sidebar'
import { useKioskMode } from '../store/kiosk'
import { navigate, useRoute } from './router'
import { Icon } from '../components/Icon'

export function Sidebar() {
  const { t } = useTranslation()
  const dashboards = useConfigStore((s) => s.dashboards)
  const layout = useSidebarLayout()
  const route = useRoute()

  const { enabled, open, pinned } = layout

  const routeKey = route.name === 'dashboard' ? 'd:' + route.id : route.name
  useEffect(() => {
    closeSidebar()
  }, [routeKey])

  useEffect(() => {
    if (!open || pinned) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeSidebar()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, pinned])

  if (!enabled) return null

  const go = (to: Parameters<typeof navigate>[0]) => {
    if (!pinned) closeSidebar()
    navigate(to)
  }

  const activeDashboard = route.name === 'dashboard' ? route.id : null

  return (
    <>
      {/* Rendered whenever it is open and unpinned, on every screen width - it is what makes the
          dismissing click *only* dismiss. Invisible where the sidebar pushes the content aside
          (nothing is hidden, so dimming would only be noise) and dimmed where it overlays.
          Closing on the click rather than the press keeps it in place for the whole gesture, so
          nothing underneath sees any part of it. */}
      {open && !pinned ? (
        <div className={'nh-side__scrim' + (layout.canPush ? '' : ' nh-side__scrim--dim')} onClick={closeSidebar} />
      ) : null}
      <aside
        className={'nh-side' + (open ? ' nh-side--open' : '') + (layout.canPush ? '' : ' nh-side--overlay')}
        aria-label={t('Dashboards')}
        aria-hidden={!open}>
        <nav className="nh-side__list">
          <button
            type="button"
            className={'nh-side__item nh-side__item--home' + (route.name === 'home' ? ' nh-side__item--active' : '')}
            onClick={() => go({ name: 'home' })}>
            <span className="nh-side__glyph" aria-hidden="true">
              ⌂
            </span>
            <span className="nh-side__label">{t('Home')}</span>
          </button>

          <div className="nh-side__sep" />

          {dashboards
            .filter((d) => !d.hideInSidebar)
            .map((d) => (
              <button
                key={d.id}
                type="button"
                className={'nh-side__item' + (d.id === activeDashboard ? ' nh-side__item--active' : '')}
                onClick={() => go({ name: 'dashboard', id: d.id })}>
                {d.icon ? (
                  <Icon icon={d.icon} size={22} className="nh-side__icon" />
                ) : (
                  <span className="nh-side__glyph" aria-hidden="true" />
                )}
                <span className="nh-side__label">{d.name}</span>
              </button>
            ))}
        </nav>

        <footer className="nh-side__foot">
          {layout.canPush ? (
            <button
              type="button"
              className={'nh-iconbtn nh-side__pin' + (pinned ? ' nh-side__pin--on' : '')}
              onClick={() => setSidebarPinned(!pinned)}
              aria-pressed={pinned}
              aria-label={pinned ? t('Unpin sidebar') : t('Pin sidebar open')}
              title={pinned ? t('Unpin sidebar') : t('Pin sidebar open')}>
              {/* One icon in both states: the dim/lit styling says whether it is pinned, where a
                  swap to pin-off would read as "currently unpinned" rather than "click to unpin". */}
              <Icon icon="mdi:pin" size={20} />
            </button>
          ) : null}
          <button
            type="button"
            className={'nh-side__item nh-side__foot-settings' + (route.name === 'settings' ? ' nh-side__item--active' : '')}
            onClick={() => go({ name: 'settings' })}>
            <span className="nh-side__glyph" aria-hidden="true">
              ⚙
            </span>
            <span className="nh-side__label">{t('Settings')}</span>
          </button>
        </footer>
      </aside>
    </>
  )
}

export function NavButton() {
  const { t } = useTranslation()
  const { enabled } = useSidebarLayout()
  const kiosk = useKioskMode()
  if (kiosk) return null
  if (enabled) return <SidebarTrigger />
  return (
    <button type="button" className="nh-iconbtn" onClick={() => navigate({ name: 'home' })} aria-label={t('Home')}>
      ‹
    </button>
  )
}

export function SidebarTrigger({ className = 'nh-iconbtn' }: { className?: string }) {
  const { t } = useTranslation()
  const { enabled, pinned } = useSidebarLayout()
  if (!enabled || pinned) return null
  return (
    <button
      type="button"
      className={className + ' nh-side__trigger'}
      onClick={toggleSidebar}
      aria-label={t('Dashboards')}
      title={t('Dashboards')}>
      ☰
    </button>
  )
}
