/**
 * Dashboard navigation sidebar: reachable from every screen via the ☰ in the top-left, so
 * switching dashboards never means going via Home (Home stays, and is the list's first entry).
 *
 * Opening it insets the dashboard beside it on wide screens and overlays it on phones. Once open
 * it stays open until it is deliberately dismissed - by clicking or tapping somewhere else, by
 * picking a dashboard, on Escape, or on navigation. It deliberately does NOT close when the
 * pointer merely moves away: reading down a list of dashboards means moving off it, and a menu
 * that vanishes because a mouse drifted is one you have to re-open to use.
 *
 * The order matches Home's tiles (by name) on purpose - two lists of the same dashboards that
 * disagreed about their order would be a puzzle to use.
 */
import { useEffect } from 'react'
import { useConfigStore } from '../store/config'
import { useEditorStore } from '../store/editor'
import { closeSidebar, setSidebarPinned, toggleSidebar, useSidebarLayout } from '../store/sidebar'
import { navigate, useRoute } from './router'
import { Icon } from '../components/Icon'

export function Sidebar() {
  const dashboards = useConfigStore((s) => s.dashboards)
  const layout = useSidebarLayout()
  const route = useRoute()

  const { enabled, open, pinned } = layout

  // Any navigation closes it, not just the rows below: arriving somewhere via browser-back or a
  // Home tile has finished with the sidebar just as much as clicking a row has. Harmless while
  // pinned, where being open does not depend on this flag.
  const routeKey = route.name === 'dashboard' ? 'd:' + route.id : route.name
  useEffect(() => {
    closeSidebar()
  }, [routeKey])

  // A click or tap anywhere outside dismisses it - the one gesture that closes it on both mouse
  // and touch. pointerdown rather than click so it goes away as the press lands, not after it.
  useEffect(() => {
    if (!open || pinned) return
    const onDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement | null
      if (target?.closest('.nh-side, .nh-side__trigger')) return
      closeSidebar()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeSidebar()
    }
    window.addEventListener('pointerdown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open, pinned])

  if (!enabled) return null

  const go = (to: Parameters<typeof navigate>[0]) => {
    // Navigating away drops an unsaved draft (the editor resets on route change), and from here
    // that is one stray click away - so ask first rather than silently discarding the work.
    if (useEditorStore.getState().dirty && !window.confirm('Discard all unsaved changes?')) return
    if (!pinned) closeSidebar()
    navigate(to)
  }

  const activeDashboard = route.name === 'dashboard' ? route.id : null

  return (
    <>
      {open && !layout.canPush ? <div className="nh-side__scrim" /> : null}
      <aside
        className={'nh-side' + (open ? ' nh-side--open' : '') + (layout.canPush ? '' : ' nh-side--overlay')}
        aria-label="Dashboards"
        aria-hidden={!open}
      >
        <nav className="nh-side__list">
          <button
            type="button"
            className={'nh-side__item nh-side__item--home' + (route.name === 'home' ? ' nh-side__item--active' : '')}
            onClick={() => go({ name: 'home' })}
          >
            <span className="nh-side__glyph" aria-hidden="true">
              ⌂
            </span>
            <span className="nh-side__label">Home</span>
          </button>

          <div className="nh-side__sep" />

          {dashboards
            .filter((d) => !d.hideInSidebar)
            .map((d) => (
              <button
                key={d.id}
                type="button"
                className={'nh-side__item' + (d.id === activeDashboard ? ' nh-side__item--active' : '')}
                onClick={() => go({ name: 'dashboard', id: d.id })}
              >
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
              aria-label={pinned ? 'Unpin sidebar' : 'Pin sidebar open'}
              title={pinned ? 'Unpin sidebar' : 'Pin sidebar open'}
            >
              {/* One icon in both states: the dim/lit styling says whether it is pinned, where a
                  swap to pin-off would read as "currently unpinned" rather than "click to unpin". */}
              <Icon icon="mdi:pin" size={20} />
            </button>
          ) : null}
          <button
            type="button"
            className={'nh-side__item nh-side__foot-settings' + (route.name === 'settings' ? ' nh-side__item--active' : '')}
            onClick={() => go({ name: 'settings' })}
          >
            <span className="nh-side__glyph" aria-hidden="true">
              ⚙
            </span>
            <span className="nh-side__label">Settings</span>
          </button>
        </footer>
      </aside>
    </>
  )
}

/**
 * Top-left button of any screen: ☰ with the sidebar on (Home is the list's first entry), or the
 * classic ‹ straight back to Home with it off. Renders nothing while the sidebar is pinned open,
 * since both destinations are already on screen.
 */
export function NavButton() {
  const { enabled } = useSidebarLayout()
  if (enabled) return <SidebarTrigger />
  return (
    <button type="button" className="nh-iconbtn" onClick={() => navigate({ name: 'home' })} aria-label="Home">
      ‹
    </button>
  )
}

/**
 * The ☰ that opens the sidebar. Renders nothing when the sidebar is switched off, and nothing
 * when it is pinned - the list is already on screen, so a button to summon it would do nothing.
 */
export function SidebarTrigger({ className = 'nh-iconbtn' }: { className?: string }) {
  const { enabled, pinned } = useSidebarLayout()
  if (!enabled || pinned) return null
  return (
    <button
      type="button"
      className={className + ' nh-side__trigger'}
      onClick={toggleSidebar}
      aria-label="Dashboards"
      title="Dashboards"
    >
      ☰
    </button>
  )
}
