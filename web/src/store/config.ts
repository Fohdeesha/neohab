/**
 * Dashboard configuration store.
 *
 * Dashboards live on the server as UI components in the `neohab:config` namespace
 * (`dashboard:<id>`). Reads are public; saving requires an admin login. When the server has no
 * dashboards yet, a built-in demo dashboard is shown so the UI is immediately usable.
 */
import { create } from 'zustand'
import { addComponent, listComponents, updateComponent } from '../api/components'
import type { UIComponent } from '../api/types'
import type { Dashboard } from '../model/dashboard'
import { demoDashboard } from './demoDashboard'

const DASHBOARD_PREFIX = 'dashboard:'
const DASHBOARD_COMPONENT = 'neohab:dashboard'

interface ConfigState {
  dashboards: Dashboard[]
  /** Component uids that exist on the server (decides create vs update on save). */
  serverUids: Set<string>
  loading: boolean
  loaded: boolean
  usingDemo: boolean
  error: string | null
}

export const useConfigStore = create<ConfigState>(() => ({
  dashboards: [],
  serverUids: new Set<string>(),
  loading: false,
  loaded: false,
  usingDemo: false,
  error: null,
}))

function toComponent(dashboard: Dashboard): UIComponent<Dashboard> {
  return { uid: DASHBOARD_PREFIX + dashboard.id, component: DASHBOARD_COMPONENT, config: dashboard }
}

function fromComponent(component: UIComponent): Dashboard | null {
  if (!component.uid.startsWith(DASHBOARD_PREFIX)) return null
  return component.config as unknown as Dashboard
}

export async function loadDashboards(): Promise<void> {
  useConfigStore.setState({ loading: true, error: null })
  try {
    const components = await listComponents()
    const serverUids = new Set(components.map((c) => c.uid))
    const dashboards = components
      .map(fromComponent)
      .filter((d): d is Dashboard => d !== null)
    if (dashboards.length > 0) {
      useConfigStore.setState({ dashboards, serverUids, usingDemo: false, loading: false, loaded: true })
    } else {
      useConfigStore.setState({
        dashboards: [demoDashboard()],
        serverUids,
        usingDemo: true,
        loading: false,
        loaded: true,
      })
    }
  } catch (err) {
    // Server unreachable - still show the demo so the app renders.
    useConfigStore.setState({
      dashboards: [demoDashboard()],
      serverUids: new Set<string>(),
      usingDemo: true,
      loading: false,
      loaded: true,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}

export function getDashboard(id: string): Dashboard | undefined {
  return useConfigStore.getState().dashboards.find((d) => d.id === id)
}

/** Persist a dashboard to the server. Requires an admin token. */
export async function saveDashboard(dashboard: Dashboard): Promise<void> {
  const component = toComponent(dashboard)
  const exists = useConfigStore.getState().serverUids.has(component.uid)
  if (exists) await updateComponent(component)
  else await addComponent(component)
  useConfigStore.setState((s) => {
    const others = s.dashboards.filter((d) => d.id !== dashboard.id)
    return {
      dashboards: [...others, dashboard],
      serverUids: new Set([...s.serverUids, component.uid]),
      usingDemo: false,
    }
  })
}
