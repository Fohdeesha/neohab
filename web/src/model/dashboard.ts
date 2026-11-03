import { slugify } from './components'
import { SCHEMA_VERSIONS } from './schema'

// one number: a dashboard written at anything but the declared version would be migrated on every load
export const MODEL_VERSION = SCHEMA_VERSIONS.dashboard

export type Breakpoint = 'lg' | 'md'

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export type WidgetLayout = Partial<Record<Breakpoint, Rect>>

export interface WidgetInstance<C = Record<string, unknown>> {
  id: string
  type: string
  config: C
  layout: WidgetLayout
}

/** a dashboard that shows one web page under its bar instead of widgets */
export interface DashboardPage {
  url: string
  sandbox?: boolean
}

export interface Dashboard {
  version: number
  id: string
  name: string
  icon?: string
  hideInSidebar?: boolean
  background?: string
  columns: number
  rowHeight: number | 'match'
  gap?: number
  textSize?: number
  mdColumns?: number
  stackOrder?: string[]
  page?: DashboardPage
  widgets: WidgetInstance[]
}

export function newWidgetId(): string {
  return 'w-' + Math.random().toString(36).slice(2, 10)
}

export function createDashboard(id: string, name: string, page?: DashboardPage): Dashboard {
  return { version: MODEL_VERSION, id, name, columns: 12, rowHeight: 'match', widgets: [], ...(page ? { page } : {}) }
}

// stored configuration is untrusted, so the shape is asked for here rather than assumed at every reader
export function pageOf(dashboard: Dashboard | null | undefined): DashboardPage | null {
  const page = dashboard?.page as unknown
  if (page === null || typeof page !== 'object' || Array.isArray(page)) return null
  const { url, sandbox } = page as Record<string, unknown>
  return { url: typeof url === 'string' ? url : '', sandbox: sandbox === true }
}

export function slugifyDashboardId(name: string, existing: Set<string>): string {
  return slugify(name, 'dashboard', existing)
}
