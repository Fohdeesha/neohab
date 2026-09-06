import { describe, expect, it } from 'vitest'
import type { UIComponent } from '../api/types'
import type { Dashboard, WidgetInstance } from '../model/dashboard'
import { convertHabpanel, panelConfigFromComponent, parseHabpanelFile, PERIOD_MAP, THEME_MAP, type HPPanelConfig } from './habpanel'
import fixture from './fixtures/habpanel-config.json'

const loadFixture = (): HPPanelConfig => parseHabpanelFile(JSON.parse(JSON.stringify(fixture)))

const importFixture = (existing: string[] = []) => convertHabpanel(loadFixture(), existing)

const widget = (d: Dashboard, type: string): WidgetInstance => {
  const found = d.widgets.filter((w) => w.type === type)
  if (found.length === 0) throw new Error(`no ${type} widget on ${d.id}`)
  return found[0]
}

const oneWidget = (w: Record<string, unknown>): HPPanelConfig => ({
  dashboards: [{ id: 'd', name: 'D', widgets: [{ type: String(w.type), ...w }] }],
  settings: {},
  customwidgets: {}
})

const convertOne = (w: Record<string, unknown>) => {
  const res = convertHabpanel(oneWidget(w), [])
  return { widget: res.dashboards[0].widgets[0], notes: res.notes, dashboard: res.dashboards[0] }
}

describe('parsing an export file', () => {
  it('reads the current object format', () => {
    const cfg = loadFixture()
    expect(cfg.dashboards).toHaveLength(2)
    expect(cfg.settings.theme).toBe('material-dark')
    expect(Object.keys(cfg.customwidgets)).toEqual(['fancygauge'])
  })

  it('reads the legacy bare-array format', () => {
    const cfg = parseHabpanelFile([{ id: 'a', name: 'A', widgets: [] }])
    expect(cfg.dashboards).toHaveLength(1)
    expect(cfg.settings).toEqual({})
    expect(cfg.customwidgets).toEqual({})
  })

  it('defaults a dashboard with no widgets array to an empty one', () => {
    const cfg = parseHabpanelFile([{ id: 'a', name: 'A' }])
    expect(cfg.dashboards[0].widgets).toEqual([])
  })

  it.each([
    ['null', null],
    ['a number', 42],
    ['a string', 'nope'],
    ['an empty array', []],
    ['an object with no dashboards', { settings: {} }],
    ['an object with an empty dashboard list', { dashboards: [] }],
    ['an array of arrays', [[]]],
    ['an array of scalars', [1, 2]],
    ['dashboards with no id, name or widgets', [{ foo: 'bar' }]]
  ])('refuses %s', (_label, input) => {
    expect(() => parseHabpanelFile(input)).toThrow(/Not a HABPanel configuration/)
  })
})

describe('reading a live habpanel:panelconfig component', () => {
  it('decodes the slot encoding into dashboards, widgets and custom widgets', () => {
    const component = {
      uid: 'habpanel:panelconfig:main',
      component: 'panelconfiguration',
      config: { settings: { theme: 'paleblue' } },
      slots: {
        dashboards: [
          {
            component: 'dashboard',
            config: { id: 'kitchen', name: 'Kitchen', columns: 10 },
            slots: {
              widgets: [{ component: 'switch', config: { item: 'K_Light', name: 'Light' } }]
            }
          }
        ],
        customwidgets: [
          {
            component: 'customwidget',
            config: { id: 'gauge', name: 'Gauge', template: '<b>x</b>' },
            slots: { settings: [{ component: 'item', config: { id: 'item', label: 'Item' } }] }
          }
        ]
      }
    } as unknown as UIComponent

    const cfg = panelConfigFromComponent(component)
    expect(cfg.settings.theme).toBe('paleblue')
    expect(cfg.dashboards[0]).toMatchObject({ id: 'kitchen', name: 'Kitchen', columns: 10 })
    expect(cfg.dashboards[0].widgets[0]).toMatchObject({ type: 'switch', item: 'K_Light' })
    expect(cfg.customwidgets.gauge.settings).toEqual([{ type: 'item', id: 'item', label: 'Item' }])
  })

  it('survives a component with no slots at all', () => {
    const cfg = panelConfigFromComponent({ uid: 'x', component: 'panelconfiguration', config: {} } as UIComponent)
    expect(cfg).toEqual({ dashboards: [], settings: {}, customwidgets: {} })
  })

  it('skips a custom widget with no id rather than storing it under an empty uid', () => {
    const cfg = panelConfigFromComponent({
      uid: 'x',
      component: 'panelconfiguration',
      config: {},
      slots: { customwidgets: [{ component: 'customwidget', config: { name: 'nameless' } }] }
    } as unknown as UIComponent)
    expect(cfg.customwidgets).toEqual({})
  })
})

describe('widget conversion', () => {
  it('maps every type in the fixture to its neohab counterpart', () => {
    const { dashboards, widgetCount } = importFixture()
    const types = dashboards.flatMap((d) => d.widgets.map((w) => w.type))
    expect(types).toEqual([
      'switch',
      'slider',
      'color',
      'dial',
      'value',
      'label',
      'button',
      'button',
      'selection',
      'image',
      'frame',
      'clock',
      'clock',
      'chart',
      'timeline',
      'template'
    ])
    expect(widgetCount).toBe(16)
  })

  it('carries a switch across with its state-aware icon', () => {
    const { dashboards } = importFixture()
    expect(widget(dashboards[0], 'switch').config).toEqual({
      item: 'Hall_Light',
      label: 'Hall Light',
      icon: 'oh:light',
      iconSize: 48
    })
  })

  it('keeps a non-classic icon set on the reference', () => {
    const { widget: w } = convertOne({ type: 'switch', item: 'I', icon: 'light', iconset: 'ovh' })
    expect(w.config.icon).toBe('oh:light@ovh')
  })

  it('drops the icon when HABPanel was hiding it', () => {
    const { widget: w } = convertOne({ type: 'switch', item: 'I', icon: 'light', hideicon: true })
    expect(w.config.icon).toBeUndefined()
  })

  it('keeps a slider range, and stands a vertical one on end', () => {
    const { dashboards, notes } = importFixture()
    expect(widget(dashboards[0], 'slider').config).toEqual({
      item: 'Hall_Dimmer',
      label: 'Hall Dimmer',
      orient: 'vertical',
      min: 10,
      max: 90,
      step: 5,
      unit: '%'
    })
    expect(notes.some((n) => n.message.includes('inverted'))).toBe(false)
  })

  it('leaves a slider the right way up when there is nothing to say', () => {
    const { widget: w } = convertOne({ type: 'slider', item: 'I' })
    expect(w.config.orient).toBeUndefined()
  })

  it('cannot invert a scale, and says so rather than pretending', () => {
    const { notes } = convertOne({ type: 'slider', item: 'I', inverted: true })
    expect(notes.some((n) => n.message.includes('inverted'))).toBe(true)
  })

  it('gives a slider HABPanel’s own defaults when the range is absent', () => {
    const { widget: w } = convertOne({ type: 'slider', item: 'I' })
    expect(w.config).toMatchObject({ min: 0, max: 100, step: 1 })
  })

  it('maps a read-only knob to a gauge rather than a draggable dial', () => {
    const { dashboards } = importFixture()
    expect(widget(dashboards[0], 'dial').config).toEqual({
      item: 'Boiler_Flow',
      label: 'Boiler Flow',
      min: 20,
      max: 80,
      step: 0.5,
      unit: '°C',
      readOnly: true
    })
  })

  it('maps a toggle button to command plus alternate command', () => {
    const { dashboards } = importFixture()
    expect(widget(dashboards[0], 'button').config).toEqual({
      item: 'Scene_AllOff',
      label: 'All Off',
      command: 'ON',
      commandAlt: 'OFF',
      toggle: true,
      icon: 'oh:switch',
      hideLabel: true
    })
  })

  it('maps a navigate button to the dashboard it pointed at', () => {
    const { dashboards } = importFixture()
    const nav = dashboards[0].widgets.filter((w) => w.type === 'button')[1]
    expect(nav.config).toMatchObject({ action: 'navigate', navigateDashboard: 'First Floor', label: 'Upstairs' })
    expect(nav.config.item).toBeUndefined()
  })

  it('turns a comma-separated selection list into one choice per line, trimmed', () => {
    const { dashboards } = importFixture()
    expect(widget(dashboards[0], 'selection').config.choices).toBe('HDMI1=Apple TV\nHDMI2=Console\nHDMI3=PC')
  })

  it('leaves the choices empty when the server supplies them', () => {
    const { widget: w } = convertOne({ type: 'selection', item: 'I', choices_source: 'server', choices: 'A,B' })
    expect(w.config.choices).toBe('')
  })

  it('warns that an item-sourced image URL did not come across', () => {
    const { dashboards, notes } = importFixture()
    expect(widget(dashboards[1], 'image').config).toEqual({
      url: 'http://cam.example/porch.jpg',
      label: 'Porch',
      refresh: 10
    })
    expect(notes.find((n) => n.message.includes('Item-sourced images'))?.level).toBe('warn')
  })

  it('reads a frame URL from frameUrl and honours hidelabel', () => {
    const { dashboards } = importFixture()
    expect(widget(dashboards[1], 'frame').config).toEqual({ url: 'http://weather.example/embed', refresh: 60 })
  })

  it('recognises HABPanel’s capitalised Analog mode', () => {
    const { dashboards } = importFixture()
    const clocks = dashboards[1].widgets.filter((w) => w.type === 'clock')
    expect(clocks[0].config).toMatchObject({ mode: 'analog' })
    expect(clocks[0].config.showSeconds).toBeUndefined()
    expect(clocks[1].config.mode).toBeUndefined()
    expect(clocks[1].config.showSeconds).toBe(true)
  })

  it('maps an interactive chart’s series, axes and legend', () => {
    const { dashboards } = importFixture()
    const chart = widget(dashboards[1], 'chart')
    expect(chart.config.series).toEqual([
      { item: 'Outside_Temp', label: 'Outside', color: '#3fa9f5', fill: 0 },
      { item: 'Indoor_Temp', label: 'Indoor', axis: 'y2', points: true }
    ])
    expect(chart.config).toMatchObject({ period: '7d', service: 'rrd4j', legend: false, yMin: -10, yMax: 40 })
    expect(chart.config.y2Min).toBe(0)
  })

  it('reduces a server-rendered chart to its single item', () => {
    const { widget: w, notes } = convertOne({ type: 'chart', charttype: 'default', item: 'T', isgroup: true })
    expect(w.config.series).toEqual([{ item: 'T' }])
    expect(notes.find((n) => n.message.includes('Group charts'))?.level).toBe('warn')
  })

  it('maps a timeline’s series and colour maps, dropping the empty state', () => {
    const { dashboards } = importFixture()
    const timeline = widget(dashboards[1], 'timeline')
    expect(timeline.config.series).toEqual([{ item: 'Presence', label: 'Someone home' }])
    expect(timeline.config.colorMaps).toEqual([
      { state: 'ON', color: '#4caf50' },
      { state: 'OFF', color: '#555555' }
    ])
    expect(timeline.config.period).toBe('2d')
  })

  it('preserves a template widget’s custom-widget reference and its settings values', () => {
    const { dashboards } = importFixture()
    expect(widget(dashboards[1], 'template').config).toEqual({
      label: 'Custom Gauge',
      customwidget: 'fancygauge',
      config: { item: 'Boiler_Flow', scale: 2 },
      dontwrap: true,
      nobackground: false
    })
  })

  it('reports an unknown widget type instead of dropping it silently', () => {
    const { notes } = importFixture()
    const skip = notes.find((n) => n.level === 'skip')
    expect(skip?.message).toContain('Unknown HABPanel widget type')
    expect(skip?.params).toEqual({ type: 'rollershutter' })
  })

  it('stores no undefined values', () => {
    const { dashboards } = importFixture()
    for (const d of dashboards) {
      for (const w of d.widgets) {
        expect(Object.values(w.config)).not.toContain(undefined)
      }
    }
  })
})

describe('a hostile or damaged export', () => {
  it.each(['constructor', 'toString', '__proto__', 'hasOwnProperty', 'valueOf'])(
    'reports a widget typed %s as unknown rather than calling a prototype member',
    (type) => {
      const res = convertHabpanel(oneWidget({ type }), [])
      expect(res.dashboards[0].widgets).toHaveLength(0)
      expect(res.notes.find((n) => n.level === 'skip')?.params).toEqual({ type })
    }
  )

  it.each(['constructor', 'toString', 'valueOf'])('falls back to a real period when the stored one is %s', (period) => {
    const { widget: w } = convertOne({ type: 'chart', item: 'T', period })
    expect(typeof w.config.period).toBe('string')
    expect(w.config.period).toBe('24h')
  })

  it.each(['constructor', 'toString'])('never adopts %s as a theme id', (theme) => {
    const res = convertHabpanel({ dashboards: [{ id: 'd', widgets: [] }], settings: { theme }, customwidgets: {} }, [])
    expect(['string', 'undefined']).toContain(typeof res.settingsPatch.theme)
    expect(res.notes.some((n) => n.level === 'warn' && n.message.includes('not one neohab knows'))).toBe(true)
  })

  it('clamps wild geometry into the grid', () => {
    const res = convertHabpanel(
      {
        dashboards: [
          {
            id: 'd',
            columns: 6,
            widgets: [
              { type: 'switch', item: 'A', col: 99, row: 5, sizeX: 40, sizeY: 3 },
              { type: 'switch', item: 'B', col: -4, row: -9, sizeX: 0, sizeY: -2 }
            ]
          }
        ],
        settings: {},
        customwidgets: {}
      },
      []
    )
    for (const w of res.dashboards[0].widgets) {
      const r = w.layout.lg
      if (!r) throw new Error('imported widget has no desktop rect')
      expect(r.x).toBeGreaterThanOrEqual(0)
      expect(r.y).toBeGreaterThanOrEqual(0)
      expect(r.w).toBeGreaterThanOrEqual(1)
      expect(r.h).toBeGreaterThanOrEqual(1)
      expect(r.x + r.w).toBeLessThanOrEqual(6)
    }
  })

  it('places a widget with no stored position instead of stacking everything at the origin', () => {
    const res = convertHabpanel(
      {
        dashboards: [
          {
            id: 'd',
            columns: 4,
            widgets: [
              { type: 'switch', item: 'A' },
              { type: 'switch', item: 'B' },
              { type: 'switch', item: 'C' }
            ]
          }
        ],
        settings: {},
        customwidgets: {}
      },
      []
    )
    const rects = res.dashboards[0].widgets.map((w) => w.layout.lg)
    const seen = new Set(rects.map((r) => `${r?.x},${r?.y}`))
    expect(seen.size).toBe(3)
  })

  it('survives a dashboard whose widget list holds junk entries', () => {
    const res = convertHabpanel(
      { dashboards: [{ id: 'd', widgets: [{ type: 'switch', item: 'A' }, { type: '' }] as never }], settings: {}, customwidgets: {} },
      []
    )
    expect(res.dashboards[0].widgets).toHaveLength(1)
  })
})

describe('dashboard geometry and metadata', () => {
  it('defaults row height to match (square cells), which is HABPanel’s own default', () => {
    const { dashboards } = importFixture()
    expect(dashboards[0]).toMatchObject({ columns: 12, rowHeight: 'match', gap: 4 })
    expect(dashboards[0].textSize).toBeUndefined()
  })

  it('keeps an explicit numeric row height, and scales font_scale into a percentage', () => {
    const { dashboards } = importFixture()
    expect(dashboards[1]).toMatchObject({ columns: 8, rowHeight: 60, gap: 8, textSize: 150 })
  })

  it('uses HABPanel’s own defaults when the dashboard omits them', () => {
    const { dashboard } = convertOne({ type: 'switch', item: 'I' })
    expect(dashboard).toMatchObject({ columns: 12, rowHeight: 'match', gap: 5 })
  })

  it('maps the menu tile icon and the drawer hide flag', () => {
    const { dashboards } = importFixture()
    expect(dashboards[0].icon).toBe('oh:firstfloor')
    expect(dashboards[0].hideInSidebar).toBeUndefined()
    expect(dashboards[1].hideInSidebar).toBe(true)
  })

  it('ignores a font_scale of 1 and clamps an absurd one', () => {
    const scaled = (font_scale: unknown) =>
      convertHabpanel({ dashboards: [{ id: 'd', font_scale, widgets: [] }], settings: {}, customwidgets: {} }, []).dashboards[0].textSize
    expect(scaled(1)).toBeUndefined()
    expect(scaled(0)).toBeUndefined()
    expect(scaled(-2)).toBeUndefined()
    expect(scaled(99)).toBe(300)
    expect(scaled(0.1)).toBe(50)
  })
})

describe('dashboard ids', () => {
  it('turns a free-text HABPanel id into the same slug a new dashboard would get', () => {
    const { dashboards, notes } = importFixture()
    expect(dashboards.map((d) => d.id)).toEqual(['ground-floor', 'first-floor'])
    expect(dashboards.map((d) => d.name)).toEqual(['Ground Floor', 'First Floor'])
    expect(notes.some((n) => n.message.includes('turned into web addresses'))).toBe(true)
  })

  it('de-duplicates against dashboards already on the server without overwriting them', () => {
    const { dashboards, notes } = importFixture(['ground-floor'])
    expect(dashboards[0].id).not.toBe('ground-floor')
    expect(dashboards[0].id).toMatch(/^ground-floor-\d+$/)
    expect(notes.some((n) => n.message.includes('already existed and were renamed'))).toBe(true)
  })

  it('de-duplicates within one import when two dashboards slug to the same id', () => {
    const res = convertHabpanel(
      {
        dashboards: [
          { id: 'Living Room', widgets: [] },
          { id: 'living room', widgets: [] }
        ],
        settings: {},
        customwidgets: {}
      },
      []
    )
    expect(new Set(res.dashboards.map((d) => d.id)).size).toBe(2)
  })

  it('falls back to a positional id when a dashboard has neither id nor name', () => {
    const res = convertHabpanel({ dashboards: [{ widgets: [] }], settings: {}, customwidgets: {} }, [])
    expect(res.dashboards[0].id).toBe('imported-1')
  })

  it('gives every widget a unique id within its dashboard', () => {
    const { dashboards } = importFixture()
    for (const d of dashboards) {
      expect(new Set(d.widgets.map((w) => w.id)).size).toBe(d.widgets.length)
    }
  })

  it('gives every widget a unique id across the whole import, not just within one dashboard', () => {
    const res = convertHabpanel(
      {
        dashboards: [
          { id: 'Living Room', widgets: [{ type: 'clock' }, { type: 'clock' }] },
          { id: 'living room', widgets: [{ type: 'clock' }, { type: 'clock' }] },
          { id: 'Living  Room!', widgets: [{ type: 'clock' }] }
        ],
        settings: {},
        customwidgets: {}
      },
      []
    )
    const ids = res.dashboards.flatMap((d) => d.widgets.map((w) => w.id))
    expect(ids).toHaveLength(5)
    expect(new Set(ids).size).toBe(5)
  })
})

describe('panel settings', () => {
  it('maps the theme, background, speech item and Speak button', () => {
    const { settingsPatch } = importFixture()
    expect(settingsPatch).toEqual({
      theme: 'material-dark',
      background: 'http://example/bg.png',
      speechItem: 'Speak',
      voiceButton: false
    })
  })

  it('says plainly that an extra stylesheet was NOT imported, and where it goes', () => {
    const { notes } = importFixture()
    const note = notes.find((n) => n.message.includes('extra stylesheet'))
    expect(note?.level).toBe('warn')
    expect(note?.params).toEqual({ url: '/static/mystyles.css' })
  })

  it('has a port for every one of HABPanel’s seven themes', () => {
    const hpThemes = ['default', 'material', 'material-dark', 'paleblue', 'translucent', 'madras', 'orange-tree']
    for (const t of hpThemes) expect(THEME_MAP[t]).toBeTruthy()
    expect(new Set(Object.values(THEME_MAP)).size).toBe(hpThemes.length)
  })

  it('leaves the theme alone when HABPanel had one neohab does not know', () => {
    const res = convertHabpanel({ dashboards: [{ id: 'd', widgets: [] }], settings: { theme: 'homebrew' }, customwidgets: {} }, [])
    expect(res.settingsPatch.theme).toBeUndefined()
    expect(res.notes.find((n) => n.message.includes('not one neohab knows'))?.level).toBe('warn')
  })

  it('patches nothing when the panel had no settings', () => {
    const { widget: _w, ...rest } = convertOne({ type: 'switch', item: 'I' })
    expect(rest.notes.some((n) => n.level === 'skip')).toBe(false)
    expect(convertHabpanel(oneWidget({ type: 'switch', item: 'I' }), []).settingsPatch).toEqual({})
  })

  it('maps every HABPanel chart period exactly, so none is an approximation', () => {
    for (const [hp, mapped] of Object.entries(PERIOD_MAP)) {
      expect(mapped.exact, `period ${hp}`).toBe(true)
      expect(mapped.period).toMatch(/^\d+[hdy]$/)
    }
  })
})

describe('custom widgets', () => {
  it('preserves the AngularJS template and settings schema in a widgetdef component', () => {
    const { widgetDefs } = importFixture()
    expect(widgetDefs).toHaveLength(1)
    expect(widgetDefs[0].uid).toBe('widgetdef:fancygauge')
    expect(widgetDefs[0].component).toBe('neohab:widgetdef')
    const config = widgetDefs[0].config as Record<string, unknown>
    expect(config).toMatchObject({ id: 'fancygauge', name: 'Fancy Gauge', source: 'habpanel' })
    expect((config.habpanel as Record<string, unknown>).template).toContain('itemValue(config.item)')
  })

  it('says the imported definitions are in the palette', () => {
    expect(importFixture().notes.some((n) => n.message.includes('widget palette'))).toBe(true)
  })
})

describe('the import report', () => {
  it('counts repeats instead of listing the same note once per widget', () => {
    const res = convertHabpanel(
      {
        dashboards: [
          {
            id: 'd',
            widgets: [
              { type: 'knob', item: 'A' },
              { type: 'knob', item: 'B' },
              { type: 'knob', item: 'C' }
            ]
          }
        ],
        settings: {},
        customwidgets: {}
      },
      []
    )
    const knobNote = res.notes.find((n) => n.message.includes('Knob appearance'))
    expect(knobNote?.count).toBe(3)
  })

  it('orders the report so what was dropped is read before what was approximated', () => {
    const levels = importFixture().notes.map((n) => n.level)
    expect(levels).toEqual(
      [...levels].sort((a, b) => {
        const order = { skip: 0, warn: 1, info: 2 }
        return order[a] - order[b]
      })
    )
  })

  it('keeps a note’s dynamic parts in params so the text stays translatable', () => {
    for (const note of importFixture().notes) {
      const placeholders = [...note.message.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1])
      for (const p of placeholders) expect(note.params?.[p]).toBeDefined()
    }
  })

  it('never mutates the source configuration', () => {
    const cfg = loadFixture()
    const before = JSON.stringify(cfg)
    convertHabpanel(cfg, ['ground-floor'])
    expect(JSON.stringify(cfg)).toBe(before)
  })
})
