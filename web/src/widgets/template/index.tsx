/**
 * Template widget: renders HABPanel-style declarative templates (Tier 1) and, when enabled by
 * an administrator, sandboxed JavaScript widgets (Tier 2, see ./JsWidget).
 *
 * A template comes either inline (`config.template`) or from a custom widget definition
 * (`config.customwidget` -> `widgetdef:<id>` component), whose settings schema supplies
 * per-instance `config.*` values. Templates render into a shadow root so their <style> blocks
 * can't leak into the app, and re-render only when an item they actually read changes: the
 * scope helpers record every item name touched during a pass, and the widget subscribes to
 * exactly that set.
 *
 * The engine (sanitizer + evaluator) is lazy-loaded as a separate chunk on first use.
 */
import { useEffect, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import type { WidgetDefinition, WidgetProps } from '../types'
import { WidgetFrame } from '../common/WidgetFrame'
import { useConfigStore } from '../../store/config'
import { subscribeItems, useItemsStore } from '../../store/items'
import { ensureCatalog, useCatalogStore } from '../../store/catalog'
import { sendCommand } from '../../api/items'
import { resolveTheme } from '../../themes/themes'
import { defTemplate, mergedSettingValues, type CustomWidgetDef } from '../../model/widgetdef'
import type { Scope } from '../../template/evaluator'
import { JsWidget } from './JsWidget'

interface TemplateConfig {
  label?: string
  template?: string
  customwidget?: string
  config?: Record<string, unknown>
  dontwrap?: boolean
  nobackground?: boolean
}

type Engine = typeof import('../../template/engine')

let enginePromise: Promise<Engine> | null = null
const loadEngine = () => (enginePromise ??= import('../../template/engine'))

/** Build the expression scope for one render pass, recording touched item names into `deps`. */
function buildScope(opts: {
  deps: Set<string>
  config: Record<string, unknown>
  label: string
  editing: boolean
  theme: Record<string, string>
}): Scope {
  const { deps, config, label, editing, theme } = opts
  const liveState = (name: string) => {
    deps.add(name)
    return useItemsStore.getState().states[name]
  }
  const catalogItems = () => useCatalogStore.getState().items

  const itemState = (name: unknown, ignoreTransform?: unknown): string => {
    if (typeof name !== 'string' || !name) return ''
    void ignoreTransform // transforms come through displayState; raw state keeps numbers usable
    return liveState(name)?.state ?? ''
  }
  const getItem = (name: unknown) => {
    if (typeof name !== 'string' || !name) return undefined
    const live = liveState(name)
    const meta = catalogItems().find((i) => i.name === name)
    return {
      name,
      state: live?.state ?? meta?.state ?? '',
      displayState: live?.displayState,
      numericState: live?.numericState,
      unit: live?.unit,
      type: live?.type ?? meta?.type,
      label: meta?.label,
    }
  }
  const groupItems = (filter: (i: { groupNames?: string[]; tags?: string[] }) => boolean) =>
    catalogItems()
      .filter(filter)
      .map((i) => ({ name: i.name, label: i.label, type: i.type, state: liveState(i.name)?.state ?? i.state }))

  // null prototype: a bare identifier like `constructor` must resolve to undefined,
  // not fall through to Object.prototype
  return Object.assign(Object.create(null) as Scope, {
    config,
    ngModel: { name: label },
    vm: { widget: { name: label } },
    theme,
    itemState,
    itemValue: itemState,
    getItem,
    sendCmd: (item: unknown, value: unknown) => {
      if (editing || typeof item !== 'string' || !item) return
      void sendCommand(item, String(value ?? ''))
    },
    itemsInGroup: (group: unknown) => groupItems((i) => Array.isArray(i.groupNames) && i.groupNames.includes(String(group))),
    itemsWithTag: (tag: unknown) => groupItems((i) => Array.isArray(i.tags) && i.tags.includes(String(tag))),
  })
}

function TemplateWidget({ config, ctx }: WidgetProps<TemplateConfig>) {
  const widgetDefs = useConfigStore((s) => s.widgetDefs)
  const { settings, customThemes } = useConfigStore(
    useShallow((s) => ({ settings: s.settings, customThemes: s.customThemes }))
  )

  const def: CustomWidgetDef | undefined = config.customwidget
    ? widgetDefs.find((d) => d.id === config.customwidget)
    : undefined
  const missingDef = Boolean(config.customwidget) && !def
  const template = def ? defTemplate(def) : (config.template ?? '')
  const values = def ? mergedSettingValues(def, config.config) : (config.config ?? {})
  const valuesKey = JSON.stringify(values)
  const label = config.label || def?.name || ''

  const hostRef = useRef<HTMLDivElement>(null)
  const [engine, setEngine] = useState<Engine | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [deps, setDeps] = useState<string[]>([])
  const depsKey = deps.join('\n')

  useEffect(() => {
    let alive = true
    loadEngine().then(
      (m) => alive && setEngine(m),
      (err) => alive && setError('Template engine failed to load: ' + String(err))
    )
    return () => {
      alive = false
    }
  }, [])

  // group/tag helpers need the item catalog; load it only when the template mentions them
  useEffect(() => {
    if (/itemsInGroup|itemsWithTag/.test(template)) ensureCatalog()
  }, [template])
  const catalogLoaded = useCatalogStore((s) => s.loaded)

  useEffect(() => subscribeItems(depsKey ? depsKey.split('\n') : []), [depsKey])
  const states = useItemsStore(
    useShallow((s) => Object.fromEntries((depsKey ? depsKey.split('\n') : []).map((n) => [n, s.states[n]])))
  )

  const isJs = def?.kind === 'js'

  useEffect(() => {
    if (isJs || !engine || !hostRef.current || missingDef) return
    const host = hostRef.current
    const shadow = host.shadowRoot ?? host.attachShadow({ mode: 'open' })
    const recorded = new Set<string>()
    const scope = buildScope({
      deps: recorded,
      config: values,
      label,
      editing: ctx.editing,
      theme: resolveTheme(settings.theme, customThemes).tokens as unknown as Record<string, string>,
    })
    try {
      const frag = engine.renderTemplate(engine.compileTemplate(template), scope)
      const style = document.createElement('style')
      style.textContent = engine.TEMPLATE_BASE_CSS
      shadow.replaceChildren(style, frag)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
    const next = [...recorded].sort().join('\n')
    if (next !== depsKey) setDeps(next ? next.split('\n') : [])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine, template, valuesKey, label, ctx.editing, states, catalogLoaded, settings.theme, customThemes, isJs, missingDef])

  if (isJs && def) {
    return <JsWidget def={def} values={values} label={label} editing={ctx.editing} bare={config.nobackground || config.dontwrap} />
  }

  const notice = missingDef
    ? `Custom widget “${config.customwidget}” was not found.`
    : !template.trim()
      ? 'Empty template — configure this widget.'
      : error

  const body = notice ? (
    <div className="nh-template">
      <span className="nh-template__badge">template</span>
      <span className="nh-template__text">{notice}</span>
    </div>
  ) : (
    <div ref={hostRef} className="nh-template__host" />
  )

  // dontwrap = no card chrome at all (overlay-style templates rely on filling the whole cell)
  if (config.dontwrap) return <div className="nh-widget nh-widget--bare nh-template__wrap">{body}</div>
  return (
    <WidgetFrame label={label || undefined} bare={config.nobackground}>
      {body}
    </WidgetFrame>
  )
}

export const templateWidget: WidgetDefinition<TemplateConfig> = {
  type: 'template',
  name: 'Template',
  description: 'Custom HTML widget (HABPanel-compatible)',
  defaultSize: { w: 4, h: 3 },
  defaultConfig: () => ({ template: '' }),
  settings: [
    { key: 'label', type: 'text', label: 'Name' },
    { key: 'template', type: 'multiline', label: 'Template (HTML)', placeholder: '<div>{{itemState(\'MyItem\')}}</div>' },
    { key: 'nobackground', type: 'boolean', label: 'No card background' },
    { key: 'dontwrap', type: 'boolean', label: 'Fill the cell (no frame)' },
  ],
  Component: TemplateWidget,
}
