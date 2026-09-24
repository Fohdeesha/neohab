import { useEffect, useRef } from 'react'
import { useConfigStore } from '../../store/config'
import { subscribeItems, useItemsStore } from '../../store/items'
import { commandItem } from '../common/command'
import { getActiveTheme, useActiveTheme } from '../../themes/active'
import i18n from '../../i18n'
import type { CustomWidgetDef } from '../../model/widgetdef'

interface JsWidgetProps {
  def: CustomWidgetDef
  values: Record<string, unknown>
  label: string
  editing: boolean
  bare?: boolean
}

// a page of its own in the jar rather than a srcdoc: a srcdoc frame inherits the app's content policy,
// which refuses inline script, and this is the one place a person's own script is meant to run
const SANDBOX_PAGE = 'jswidget.html'

interface BridgeMessage {
  neohab?: boolean
  type?: string
  id?: number
  name?: string
  command?: string
  names?: string[]
}

export function JsWidget({ def, values, label, editing, bare }: JsWidgetProps) {
  const allow = useConfigStore((s) => s.settings.allowJsWidgets === true)
  const activeTheme = useActiveTheme()
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const editingRef = useRef(editing)
  editingRef.current = editing
  const valuesKey = JSON.stringify(values)

  useEffect(() => {
    if (!allow) return
    const iframe = iframeRef.current
    if (!iframe) return

    const post = (msg: Record<string, unknown>) => iframe.contentWindow?.postMessage({ neohab: true, ...msg }, '*')
    const themeTokens = () => getActiveTheme().tokens
    const subscribed = new Set<string>()
    const unsubs: (() => void)[] = []

    const onMessage = (event: MessageEvent<BridgeMessage>) => {
      if (event.source !== iframe.contentWindow) return
      const m = event.data
      if (!m || m.neohab !== true) return
      switch (m.type) {
        case 'ready':
          post({
            type: 'init',
            script: def.script ?? '',
            config: JSON.parse(valuesKey) as Record<string, unknown>,
            theme: themeTokens(),
            label
          })
          break
        case 'getItem':
          if (typeof m.name === 'string') {
            post({ type: 'result', id: m.id, value: useItemsStore.getState().states[m.name] ?? null })
          }
          break
        case 'sendCommand':
          if (!editingRef.current && typeof m.name === 'string' && typeof m.command === 'string') {
            void commandItem(m.name, m.command)
          }
          break
        case 'subscribe': {
          const names = (m.names ?? []).filter((n): n is string => typeof n === 'string' && !subscribed.has(n))
          for (const n of names) subscribed.add(n)
          if (names.length > 0) {
            unsubs.push(subscribeItems(names))
            for (const n of names) {
              const state = useItemsStore.getState().states[n]
              if (state) post({ type: 'item', name: n, state })
            }
          }
          break
        }
      }
    }

    const storeUnsub = useItemsStore.subscribe((state, prev) => {
      if (subscribed.size === 0 || state.states === prev.states) return
      for (const n of subscribed) {
        if (state.states[n] !== prev.states[n]) post({ type: 'item', name: n, state: state.states[n] })
      }
    })

    window.addEventListener('message', onMessage)
    return () => {
      window.removeEventListener('message', onMessage)
      storeUnsub()
      for (const u of unsubs) u()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allow, valuesKey, def.script])

  useEffect(() => {
    if (!allow) return
    iframeRef.current?.contentWindow?.postMessage({ neohab: true, type: 'theme', theme: activeTheme.tokens }, '*')
  }, [allow, activeTheme])

  if (!allow) {
    return (
      <div className={'nh-widget' + (bare ? ' nh-widget--bare' : '')}>
        <div className="nh-template">
          <span className="nh-template__badge">{i18n.t('JavaScript')}</span>
          <span className="nh-template__text">
            {i18n.t('“{{name}}” is a JavaScript widget. An administrator has disabled these in Settings.', {
              name: def.name
            })}
          </span>
        </div>
      </div>
    )
  }

  return (
    <div className={'nh-widget nh-template__wrap' + (bare ? ' nh-widget--bare' : '')}>
      <iframe
        key={(def.script ?? '') + '|' + valuesKey}
        ref={iframeRef}
        className="nh-template__frame"
        title={label || def.name}
        sandbox="allow-scripts"
        src={SANDBOX_PAGE}
      />
    </div>
  )
}
