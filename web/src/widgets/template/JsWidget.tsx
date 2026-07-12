/**
 * Tier-2 custom widget: user JavaScript running inside a sandboxed iframe.
 *
 * The frame is sandbox="allow-scripts" WITHOUT allow-same-origin, so the script runs in an
 * opaque origin: no access to the app's DOM, cookies, localStorage (tokens), or credentialed
 * requests. Its only bridge is a small postMessage SDK exposed as `oh`:
 *
 *   oh.config / oh.theme            - instance settings and current theme tokens
 *   oh.getItem(name) -> Promise     - one-shot item state
 *   oh.onChange(name, cb)           - live updates for an item
 *   oh.sendCommand(name, command)   - send a command
 *   oh.onReady(cb)                  - config/theme are populated
 *
 * JavaScript widgets only run when an administrator has enabled them in Settings
 * (settings.allowJsWidgets); otherwise a notice renders instead.
 */
import { useEffect, useRef } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useConfigStore } from '../../store/config'
import { subscribeItems, useItemsStore } from '../../store/items'
import { sendCommand } from '../../api/items'
import { resolveTheme } from '../../themes/themes'
import type { CustomWidgetDef } from '../../model/widgetdef'

interface JsWidgetProps {
  def: CustomWidgetDef
  values: Record<string, unknown>
  label: string
  editing: boolean
  bare?: boolean
}

/** The SDK bootstrapped into every widget frame, ahead of the user script. */
const SDK_SOURCE = `
(function () {
  'use strict'
  var pending = new Map()
  var seq = 0
  var subs = new Map()
  var readyCbs = []
  var ready = false
  var oh = {
    config: {},
    theme: {},
    getItem: function (name) {
      return new Promise(function (resolve) {
        var id = ++seq
        pending.set(id, resolve)
        parent.postMessage({ neohab: true, type: 'getItem', id: id, name: String(name) }, '*')
      })
    },
    sendCommand: function (name, command) {
      parent.postMessage({ neohab: true, type: 'sendCommand', name: String(name), command: String(command) }, '*')
    },
    onChange: function (name, cb) {
      name = String(name)
      if (!subs.has(name)) {
        subs.set(name, [])
        parent.postMessage({ neohab: true, type: 'subscribe', names: [name] }, '*')
      }
      subs.get(name).push(cb)
    },
    onReady: function (cb) {
      if (ready) cb()
      else readyCbs.push(cb)
    },
  }
  window.oh = oh
  window.addEventListener('message', function (e) {
    var m = e.data
    if (!m || m.neohab !== true) return
    if (m.type === 'result' && pending.has(m.id)) {
      pending.get(m.id)(m.value)
      pending.delete(m.id)
    } else if (m.type === 'item') {
      var cbs = subs.get(m.name) || []
      for (var i = 0; i < cbs.length; i++) cbs[i](m.state)
    } else if (m.type === 'init' || m.type === 'theme') {
      if (m.config) oh.config = m.config
      if (m.theme) {
        oh.theme = m.theme
        for (var k in m.theme) document.documentElement.style.setProperty('--nh-' + k, m.theme[k])
      }
      if (m.type === 'init' && !ready) {
        ready = true
        for (var j = 0; j < readyCbs.length; j++) readyCbs[j]()
      }
    }
  })
  parent.postMessage({ neohab: true, type: 'ready' }, '*')
})()
`

function buildSrcdoc(script: string): string {
  // a literal </script> in the user source would break out of the tag
  const safe = script.replace(/<\/script/gi, '<\\/script')
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<style>
  html, body { margin: 0; height: 100%; background: transparent; color: var(--nh-text, inherit); font-family: system-ui, sans-serif; }
  * { box-sizing: border-box; }
</style>
<script>${SDK_SOURCE}</script>
</head>
<body>
<script>${safe}</script>
</body>
</html>`
}

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
  const { theme, customThemes } = useConfigStore(
    useShallow((s) => ({ theme: s.settings.theme, customThemes: s.customThemes }))
  )
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const editingRef = useRef(editing)
  editingRef.current = editing
  const valuesKey = JSON.stringify(values)

  // The iframe is keyed on its content below, so a config/script change replaces the frame and
  // this bridge together - the SDK's subscription state and ours can never drift apart. Theme
  // changes deliberately do NOT tear this down (they're pushed via postMessage instead).
  useEffect(() => {
    if (!allow) return
    const iframe = iframeRef.current
    if (!iframe) return

    const post = (msg: Record<string, unknown>) => iframe.contentWindow?.postMessage({ neohab: true, ...msg }, '*')
    const themeTokens = () =>
      resolveTheme(useConfigStore.getState().settings.theme, useConfigStore.getState().customThemes).tokens
    const subscribed = new Set<string>()
    const unsubs: (() => void)[] = []

    const onMessage = (event: MessageEvent<BridgeMessage>) => {
      if (event.source !== iframe.contentWindow) return
      const m = event.data
      if (!m || m.neohab !== true) return
      switch (m.type) {
        case 'ready':
          post({ type: 'init', config: JSON.parse(valuesKey) as Record<string, unknown>, theme: themeTokens(), label })
          break
        case 'getItem':
          if (typeof m.name === 'string') {
            post({ type: 'result', id: m.id, value: useItemsStore.getState().states[m.name] ?? null })
          }
          break
        case 'sendCommand':
          if (!editingRef.current && typeof m.name === 'string' && typeof m.command === 'string') {
            void sendCommand(m.name, m.command)
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

    // push live updates for subscribed items
    const storeUnsub = useItemsStore.subscribe((state, prev) => {
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
  }, [allow, valuesKey, label, def.script])

  // theme changes propagate without reloading the frame
  useEffect(() => {
    if (!allow) return
    iframeRef.current?.contentWindow?.postMessage(
      { neohab: true, type: 'theme', theme: resolveTheme(theme, customThemes).tokens },
      '*'
    )
  }, [allow, theme, customThemes])

  if (!allow) {
    return (
      <div className={'nh-widget' + (bare ? ' nh-widget--bare' : '')}>
        <div className="nh-template">
          <span className="nh-template__badge">javascript</span>
          <span className="nh-template__text">
            “{def.name}” is a JavaScript widget. These are disabled until an administrator enables
            them in Settings.
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
        srcDoc={buildSrcdoc(def.script ?? '')}
      />
    </div>
  )
}
