/**
 * HABPanel importer.
 *
 * Accepts either a `habpanel-config.json` export file (including the legacy bare-array format)
 * or a live `habpanel:panelconfig` UI component read from the server, and converts it into
 * neohab dashboards with a best-effort widget mapping and an honest report of everything that
 * was approximated or dropped. Template and custom widgets keep their original AngularJS
 * templates, which neohab's own template engine renders.
 */
import type { UIComponent } from '../api/types'
import type { Dashboard, Rect, WidgetInstance } from '../model/dashboard'
import { MODEL_VERSION, slugifyDashboardId } from '../model/dashboard'
import { clampRect, findFreeSpot } from '../model/layout'
import { lookup } from '../model/lookup'
import type { AppSettings } from '../store/config'

/* ------------------------------- source model ------------------------------- */

type HPWidget = Record<string, unknown> & { type: string }
interface HPDashboard {
  id?: string
  name?: string
  columns?: unknown
  row_height?: unknown
  widget_margin?: unknown
  font_scale?: unknown
  /** Home-menu tile appearance; only its icon has an equivalent here. */
  tile?: Record<string, unknown>
  /** HABPanel's drawer options; `hide` keeps a dashboard out of the menu. */
  drawer?: Record<string, unknown>
  widgets: HPWidget[]
}
interface HPCustomWidget {
  id: string
  name?: string
  template?: string
  settings?: unknown[]
  [key: string]: unknown
}
export interface HPPanelConfig {
  dashboards: HPDashboard[]
  settings: Record<string, unknown>
  customwidgets: Record<string, HPCustomWidget>
}

/* ------------------------------- report ------------------------------- */

export type NoteLevel = 'info' | 'warn' | 'skip'
export interface ImportNote {
  level: NoteLevel
  /** English text, translated at render time; dynamic parts ride in `params`. */
  message: string
  params?: Record<string, string>
}

class Report {
  notes = new Map<string, ImportNote & { count: number }>()

  add(level: NoteLevel, message: string, params?: Record<string, string>): void {
    const key = message + (params ? JSON.stringify(params) : '')
    const existing = this.notes.get(key)
    if (existing) existing.count++
    else this.notes.set(key, { level, message, params, count: 1 })
  }

  list(): (ImportNote & { count: number })[] {
    const order: NoteLevel[] = ['skip', 'warn', 'info']
    return [...this.notes.values()].sort((a, b) => order.indexOf(a.level) - order.indexOf(b.level))
  }
}

export interface HabpanelImportResult {
  dashboards: Dashboard[]
  /** Preserved HABPanel custom-widget definitions, ready to store as components. */
  widgetDefs: UIComponent[]
  /**
   * Global settings mapped from the HABPanel panel settings (theme, background image,
   * speech item, Speak-button visibility). Empty when nothing mapped.
   */
  settingsPatch: Partial<AppSettings>
  widgetCount: number
  notes: (ImportNote & { count: number })[]
}

/* ------------------------------- parsing ------------------------------- */

/** Parse a habpanel-config.json export (current or legacy bare-array format). */
export function parseHabpanelFile(json: unknown): HPPanelConfig {
  // An empty list is not a configuration to import; accepting it only produces a confirmation
  // dialog offering nothing and a restore point recording that nothing happened.
  if (Array.isArray(json)) {
    if (json.length === 0) throw new Error('Not a HABPanel configuration (no dashboards found)')
    return { dashboards: normalizeDashboards(json), settings: {}, customwidgets: {} }
  }
  const obj = json as Record<string, unknown> | null
  if (!obj || !Array.isArray(obj.dashboards) || obj.dashboards.length === 0) {
    throw new Error('Not a HABPanel configuration (no dashboards found)')
  }
  return {
    dashboards: normalizeDashboards(obj.dashboards),
    settings: (obj.settings as Record<string, unknown>) ?? {},
    customwidgets: (obj.customwidgets as Record<string, HPCustomWidget>) ?? {},
  }
}

function normalizeDashboards(raw: unknown[]): HPDashboard[] {
  return raw.map((d) => {
    // every dashboard entry must be a plain object that looks like one - a bare array of
    // arrays/scalars is NOT the legacy format, just a wrong file
    if (!d || typeof d !== 'object' || Array.isArray(d)) {
      throw new Error('Not a HABPanel configuration (dashboard list contains invalid entries)')
    }
    const dash = d as Record<string, unknown>
    if (dash.id === undefined && dash.name === undefined && dash.widgets === undefined) {
      throw new Error('Not a HABPanel configuration (entries have no id, name or widgets)')
    }
    const widgets = Array.isArray(dash.widgets) ? (dash.widgets as HPWidget[]) : []
    return { ...dash, widgets } as HPDashboard
  })
}

/** Decode a live `habpanel:panelconfig` component (slot-encoded) into a panel config. */
export function panelConfigFromComponent(component: UIComponent): HPPanelConfig {
  const slots = component.slots ?? {}
  const dashboards: HPDashboard[] = (slots.dashboards ?? []).map((dc) => ({
    ...(dc.config as Record<string, unknown>),
    widgets: (dc.slots?.widgets ?? []).map((wc) => ({
      type: wc.component,
      ...(wc.config as Record<string, unknown>),
    })),
  })) as HPDashboard[]

  const customwidgets: Record<string, HPCustomWidget> = {}
  for (const cw of slots.customwidgets ?? []) {
    const cfg = cw.config as Record<string, unknown>
    const id = String(cfg.id ?? '')
    if (!id) continue
    customwidgets[id] = {
      ...(cfg as HPCustomWidget),
      settings: (cw.slots?.settings ?? []).map((sc) => ({
        type: sc.component,
        ...(sc.config as Record<string, unknown>),
      })),
    }
  }

  const config = component.config as Record<string, unknown>
  return {
    dashboards,
    settings: (config.settings as Record<string, unknown>) ?? {},
    customwidgets,
  }
}

/* ------------------------------- helpers ------------------------------- */

function num(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && v.trim() !== '') {
    const n = parseFloat(v)
    if (Number.isFinite(n)) return n
  }
  return undefined
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v !== '' ? v : undefined
}


/** One HABPanel interactive-chart series -> a neohab chart series (defaults omitted). */
function hpChartSeries(s: Record<string, unknown>): Record<string, unknown> {
  return {
    item: str(s.item),
    label: str(s.name),
    color: str(s.color),
    axis: s.axis === 'y2' ? 'y2' : undefined,
    // display_line/area default true in HABPanel's series editor; only deviations are stored
    width: s.display_line === false ? 0 : undefined,
    fill: s.display_area === false ? 0 : undefined,
    points: s.display_dots === true ? true : undefined,
  }
}

// Every HABPanel chart period has an exact neohab counterpart; `exact: false` only remains
// for unknown values falling back to a day.
export const PERIOD_MAP: Record<string, { period: string; exact: boolean }> = {
  h: { period: '1h', exact: true },
  '4h': { period: '4h', exact: true },
  '8h': { period: '8h', exact: true },
  '12h': { period: '12h', exact: true },
  D: { period: '24h', exact: true },
  '2D': { period: '2d', exact: true },
  '3D': { period: '3d', exact: true },
  W: { period: '7d', exact: true },
  '2W': { period: '14d', exact: true },
  M: { period: '30d', exact: true },
  '2M': { period: '60d', exact: true },
  '4M': { period: '120d', exact: true },
  Y: { period: '1y', exact: true },
}

/**
 * HABPanel's seven themes, each with a port of its own. The ids match, so this is a pass-through
 * rather than a table of approximations, and a dashboard that came from HABPanel arrives wearing
 * something recognisable instead of the default dark.
 */
export const THEME_MAP: Record<string, string> = {
  default: 'aqua',
  material: 'material',
  'material-dark': 'material-dark',
  paleblue: 'paleblue',
  translucent: 'translucent',
  madras: 'madras',
  'orange-tree': 'orange-tree',
}

/* ------------------------------- widget converters ------------------------------- */

/**
 * HABPanel icons reference server icon sets; keep them as state-aware oh: icons.
 * HABPanel's "eclipse-smarthome-classic" id is the classic set (servers only accept "classic").
 */
function ohIcon(name: string | undefined, rawIconset: string | undefined): string | undefined {
  if (!name) return undefined
  const iconset =
    rawIconset === 'eclipse-smarthome-classic' || rawIconset === 'smarthome-classic' ? 'classic' : rawIconset
  return 'oh:' + name + (iconset && iconset !== 'classic' ? '@' + iconset : '')
}

function iconRef(w: HPWidget): { icon?: string; iconSize?: number } {
  if (w.hideicon === true) return {}
  const icon = ohIcon(str(w.icon), str(w.iconset))
  if (!icon) return {}
  return { icon, iconSize: num(w.icon_size) }
}

type Converter = (w: HPWidget, report: Report) => { type: string; config: Record<string, unknown> } | null

const CONVERTERS: Record<string, Converter> = {
  switch: (w) => ({
    type: 'switch',
    config: { item: str(w.item) ?? '', label: w.hidelabel === true ? undefined : str(w.name), ...iconRef(w) },
  }),

  slider: (w, report) => {
    if (w.vertical || w.inverted) report.add('info', 'Vertical/inverted slider options are shown as regular sliders')
    return {
      type: 'slider',
      config: {
        item: str(w.item) ?? '',
        label: str(w.name),
        min: num(w.floor) ?? 0,
        max: num(w.ceil) ?? 100,
        step: num(w.step) ?? 1,
        unit: str(w.unit),
      },
    }
  },

  colorpicker: (w) => ({
    type: 'color',
    config: { item: str(w.item) ?? '', label: str(w.name) },
  }),

  knob: (w, report) => {
    report.add('info', 'Knob appearance options (skins, colors, scales) use the neohab dial style')
    return {
      type: 'dial',
      config: {
        item: str(w.item) ?? '',
        label: str(w.name),
        min: num(w.floor) ?? 0,
        max: num(w.ceil) ?? 100,
        step: num(w.step) ?? 1,
        unit: str(w.unit),
        readOnly: w.readOnly === true,
      },
    }
  },

  dummy: (w, report) => {
    if (str(w.format)) report.add('info', 'Custom value formats now come from the server (item state description)')
    return {
      type: 'value',
      config: { item: str(w.item) ?? '', label: str(w.name), unit: str(w.unit) },
    }
  },

  label: (w, report) => {
    if (w.background) report.add('info', 'Label background colors are handled by the theme')
    return {
      type: 'label',
      config: { text: str(w.name) ?? '', fontSize: num(w.font_size), color: str(w.foreground) },
    }
  },

  button: (w, report) => {
    const action = str(w.action_type) ?? 'command'
    const icon = iconRef(w)
    const hideLabel = w.icon_replacestext === true ? true : undefined
    if (action === 'navigate') {
      return {
        type: 'button',
        config: {
          label: str(w.name) ?? 'Button',
          action: 'navigate',
          navigateDashboard: str(w.navigate_dashboard),
          navigateUrl: str(w.navigate_url),
          command: 'ON',
          ...icon,
          hideLabel,
        },
      }
    }
    if (w.background || w.foreground || w.background_active) {
      report.add('info', 'Per-button colors are handled by the theme')
    }
    return {
      type: 'button',
      config: {
        item: str(w.item),
        label: str(w.name) ?? 'Button',
        command: str(w.command) ?? 'ON',
        commandAlt: str(w.command_alt),
        toggle: action === 'toggle',
        ...icon,
        hideLabel,
      },
    }
  },

  selection: (w, report) => {
    let choices = ''
    if (str(w.choices_source) !== 'server' && typeof w.choices === 'string' && w.choices) {
      choices = (w.choices as string)
        .split(',')
        .map((c) => c.trim())
        .filter(Boolean)
        .join('\n')
    } else if (Array.isArray(w.choices)) {
      choices = (w.choices as unknown[]).map(String).join('\n')
    }
    if (w.choices_columns || w.keep_open) report.add('info', 'Selection layout options use the neohab grid style')
    return {
      type: 'selection',
      config: {
        item: str(w.item) ?? '',
        label: w.hidelabel === true ? undefined : str(w.name),
        choices,
        ...iconRef(w),
      },
    }
  },

  image: (w, report) => {
    if (str(w.image_source) === 'item') {
      report.add('warn', 'Item-sourced images are not supported yet; set the image URL manually')
    }
    return {
      type: 'image',
      config: { url: str(w.url) ?? '', label: str(w.name), refresh: num(w.refresh) ?? 0 },
    }
  },

  frame: (w, report) => {
    if (str(w.url_source) === 'item') {
      report.add('warn', 'Item-sourced frame URLs are not supported yet; set the URL manually')
    }
    return {
      type: 'frame',
      config: {
        url: str(w.frameUrl) ?? '',
        label: w.hidelabel ? undefined : str(w.name),
        refresh: num(w.refresh) ?? 0,
      },
    }
  },

  clock: (w) => {
    // HABPanel stores the mode capitalized ('Analog'/'Digital'); compare case-insensitively.
    const analog = (str(w.mode) ?? '').toLowerCase() === 'analog'
    const format = str(w.digital_format) ?? ''
    return {
      type: 'clock',
      config: {
        mode: analog ? 'analog' : undefined,
        showDate: true,
        showSeconds: analog ? undefined : /s/.test(format),
      },
    }
  },

  chart: (w, report) => {
    const p = lookup(PERIOD_MAP, str(w.period) ?? 'D') ?? { period: '24h', exact: false }
    if (!p.exact) report.add('info', 'Some chart periods were mapped to the nearest available period')
    const hpSeries = Array.isArray(w.series) ? (w.series as Record<string, unknown>[]) : []
    let series: Record<string, unknown>[]
    if (str(w.charttype) === 'interactive' && hpSeries.length > 0) {
      series = hpSeries.filter((s) => str(s.item)).map((s) => hpChartSeries(s))
    } else {
      // 'default'/'rrd4j' charts are server-rendered images of one item (or a whole group)
      const item = str(w.item) ?? (hpSeries.length > 0 ? str(hpSeries[0].item) : undefined)
      if (w.isgroup === true) {
        report.add('warn', "Group charts plot the group item's own state; add member items as extra series if needed")
      }
      series = item ? [{ item }] : []
    }
    const axis = (w.axis ?? {}) as { y?: Record<string, unknown>; y2?: Record<string, unknown> }
    const y = axis.y ?? {}
    const y2 = axis.y2 ?? {}
    return {
      type: 'chart',
      config: {
        series,
        label: str(w.name),
        period: p.period,
        service: str(w.service),
        refresh: 300,
        legend: str(w.showlegend) === 'never' ? false : undefined,
        yMin: num(y.min) ?? (y.includezero === true ? 0 : undefined),
        yMax: num(y.max),
        y2Min: y2.enabled === true ? (num(y2.min) ?? (y2.includezero === true ? 0 : undefined)) : undefined,
        y2Max: y2.enabled === true ? num(y2.max) : undefined,
      },
    }
  },

  timeline: (w) => {
    const hpSeries = Array.isArray(w.series) ? (w.series as Record<string, unknown>[]) : []
    const series = hpSeries
      .filter((s) => str(s.item))
      .map((s) => ({ item: str(s.item), label: str(s.name) }))
    const hpMaps = Array.isArray(w.colorMaps) ? (w.colorMaps as Record<string, unknown>[]) : []
    const colorMaps = hpMaps
      .filter((m) => m && m.state !== undefined && m.state !== '' && str(m.color))
      .map((m) => ({ state: String(m.state), color: str(m.color) }))
    const p = lookup(PERIOD_MAP, str(w.period) ?? 'D') ?? { period: '24h', exact: false }
    return {
      type: 'timeline',
      config: {
        series,
        colorMaps: colorMaps.length > 0 ? colorMaps : undefined,
        label: str(w.name),
        period: p.period,
        service: str(w.service),
      },
    }
  },

  template: (w, report) => {
    report.add('info', 'Template widgets render with the neohab template engine; check anything using exotic AngularJS features')
    return {
      type: 'template',
      config: {
        label: str(w.name),
        template: str(w.template),
        customwidget: str(w.customwidget),
        config: (w.config as Record<string, unknown>) ?? {},
        dontwrap: w.dontwrap === true,
        nobackground: w.nobackground === true,
      },
    }
  },
}

/* ------------------------------- conversion ------------------------------- */

function convertDashboard(hp: HPDashboard, index: number, report: Report): Dashboard {
  const columns = Math.max(1, Math.round(num(hp.columns) ?? 12))
  // HABPanel's default row_height is 'match' (square cells: row height = column width).
  // Only an explicit numeric value maps to a fixed pixel height.
  const rowHeightNum = num(hp.row_height)
  const rowHeight = rowHeightNum !== undefined ? Math.round(rowHeightNum) : ('match' as const)
  // widget_margin defaults to 5 in HABPanel.
  const gap = Math.max(0, Math.round(num(hp.widget_margin) ?? 5))
  // font_scale is a ratio (1.5 = 150%); ours is stored as percent.
  const fontScale = num(hp.font_scale)
  const textSize =
    fontScale !== undefined && fontScale > 0 && fontScale !== 1
      ? Math.min(300, Math.max(50, Math.round(fontScale * 100)))
      : undefined
  const id = str(hp.id) ?? str(hp.name) ?? 'imported-' + (index + 1)

  const dashboard: Dashboard = {
    version: MODEL_VERSION,
    id,
    name: str(hp.name) ?? id,
    // The menu tile's icon carries over to the Home tile and the sidebar; the rest of the tile
    // styling (backdrops, colours, background images) has no equivalent and is dropped.
    icon: ohIcon(str(hp.tile?.icon), str(hp.tile?.iconset)),
    hideInSidebar: hp.drawer?.hide === true ? true : undefined,
    columns,
    rowHeight,
    gap,
    textSize,
    widgets: [],
  }

  let counter = 0
  for (const hpWidget of hp.widgets) {
    // `lookup`, not a bare index: a widget typed "constructor"/"toString" would otherwise find an
    // Object.prototype member, get called as a converter, and crash the import instead of being
    // reported as an unknown type.
    const converter = lookup(CONVERTERS, hpWidget.type)
    if (!converter) {
      report.add('skip', 'Unknown HABPanel widget type “{{type}}” was skipped', { type: String(hpWidget.type) })
      continue
    }
    const converted = converter(hpWidget, report)
    if (!converted) continue

    const x = num(hpWidget.col)
    const y = num(hpWidget.row)
    const w = Math.max(1, Math.round(num(hpWidget.sizeX) ?? 2))
    const h = Math.max(1, Math.round(num(hpWidget.sizeY) ?? 2))
    let rect: Rect
    if (x !== undefined && y !== undefined) {
      rect = clampRect({ x: Math.round(x), y: Math.round(y), w, h }, columns)
    } else {
      rect = findFreeSpot(dashboard, w, h)
    }

    // strip undefined config values for clean storage
    const config = Object.fromEntries(Object.entries(converted.config).filter(([, v]) => v !== undefined))

    const instance: WidgetInstance = {
      id: 'w-' + id.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + counter++,
      type: converted.type,
      config,
      layout: { lg: rect },
    }
    dashboard.widgets.push(instance)
  }
  return dashboard
}

export function convertHabpanel(cfg: HPPanelConfig, existingDashboardIds: string[]): HabpanelImportResult {
  const report = new Report()

  const dashboards = cfg.dashboards.map((d, i) => convertDashboard(d, i, report))

  // Turn HABPanel's ids into the same web-address-safe form a dashboard created here gets, and
  // de-duplicate against what is already on this server. HABPanel ids are free text and often
  // carry spaces ("Bedroom Lighting"), which then travelled through the URL and the component
  // uid; slugifying here is what makes an imported dashboard indistinguishable from a new one.
  const taken = new Set(existingDashboardIds)
  for (const d of dashboards) {
    const tidy = slugifyDashboardId(d.id, new Set())
    const id = slugifyDashboardId(d.id, taken)
    if (id !== tidy) report.add('info', 'Some dashboard ids already existed and were renamed')
    else if (id !== d.id) {
      report.add('info', 'Dashboard names were turned into web addresses (“Bedroom Lighting” becomes “bedroom-lighting”)')
    }
    d.id = id
    taken.add(id)
  }

  const widgetDefs: UIComponent[] = Object.entries(cfg.customwidgets).map(([id, def]) => ({
    uid: 'widgetdef:' + id,
    component: 'neohab:widgetdef',
    config: { version: 1, id, name: def.name ?? id, source: 'habpanel', habpanel: def } as unknown as Record<
      string,
      unknown
    >,
  }))
  if (widgetDefs.length > 0) {
    report.add('info', 'Custom widget definitions were imported and are available in the widget palette')
  }

  const settingsPatch: Partial<AppSettings> = {}
  const hpTheme = str(cfg.settings.theme)
  if (hpTheme) {
    const themeId = lookup(THEME_MAP, hpTheme) ?? null
    if (themeId) {
      settingsPatch.theme = themeId
      if (hpTheme !== 'default') {
        report.add('info', 'The “{{theme}}” theme was imported. Its colours are a port of HABPanel’s, and you can edit them under Settings › Appearance.', { theme: hpTheme })
      }
    } else {
      report.add('warn', 'HABPanel theme “{{theme}}” is not one neohab knows, so the theme was left alone.', { theme: hpTheme })
    }
  }
  const background = str(cfg.settings.background_image)
  if (background) {
    settingsPatch.background = background
    report.add('info', 'The panel background image was imported as the global background')
  }
  const stylesheet = str(cfg.settings.additional_stylesheet_url)
  if (stylesheet) {
    // Say plainly that it was NOT brought across, and where it goes. Calling this "replaced by
    // neohab themes" read as an equivalence, and a power user's whole stylesheet went quietly
    // missing. neohab's version of it is a theme's own Custom CSS.
    report.add(
      'warn',
      'Your extra stylesheet ({{url}}) was not imported - its selectors are HABPanel’s, not neohab’s. Copy what you need into Settings › Appearance › edit a theme › Custom CSS.',
      { url: stylesheet }
    )
  }
  const speechItem = str(cfg.settings.speech_synthesis_item)
  if (speechItem) {
    settingsPatch.speechItem = speechItem
    report.add('info', 'The speech item was imported; each device chooses whether (and with which voice) it speaks')
  }
  if (cfg.settings.hide_speak_button === true) {
    settingsPatch.voiceButton = false
  }

  const widgetCount = dashboards.reduce((sum, d) => sum + d.widgets.length, 0)
  return { dashboards, widgetDefs, settingsPatch, widgetCount, notes: report.list() }
}
