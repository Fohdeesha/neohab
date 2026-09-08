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
  widgets: WidgetInstance[]
}

export function newWidgetId(): string {
  return 'w-' + Math.random().toString(36).slice(2, 10)
}

export function createDashboard(id: string, name: string): Dashboard {
  return { version: MODEL_VERSION, id, name, columns: 12, rowHeight: 'match', widgets: [] }
}

export function slugifyDashboardId(name: string, existing: Set<string>): string {
  return slugify(name, 'dashboard', existing)
}
