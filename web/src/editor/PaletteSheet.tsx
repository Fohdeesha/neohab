import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Sheet } from '../components/Sheet'
import { listWidgetDefinitions } from '../widgets'
import { addWidget, cancelPlacing, setPaletteOpen, startPlacing, useEditorStore } from '../store/editor'
import { useConfigStore } from '../store/config'

const DRAG_THRESHOLD_PX = 5

export function PaletteSheet({ canDrag }: { canDrag: boolean }) {
  const { t } = useTranslation()
  const customDefs = useConfigStore((s) => s.widgetDefs)
  const placing = useEditorStore((s) => s.placing)
  const pressRef = useRef<{ x: number; y: number; start: () => void } | null>(null)
  const all = listWidgetDefinitions()
  const templateSize = all.find((d) => d.type === 'template')?.defaultSize ?? { w: 3, h: 3 }

  // 23 built-ins plus every custom widget: after a HABPanel import that was 35 cards, most of them
  // below the fold. Matched against the description too, so "graph" finds the chart.
  const [search, setSearch] = useState('')
  const needle = search.trim().toLowerCase()
  const hits = (...parts: (string | undefined)[]) => needle === '' || parts.some((p) => (p ?? '').toLowerCase().includes(needle))
  const definitions = all.filter((d) => hits(t(d.name), d.name, d.description ? t(d.description) : undefined, d.description))
  const customs = customDefs.filter((d) => hits(d.name))

  const cardHandlers = (start: () => void) => {
    if (!canDrag) return {}
    return {
      onPointerDown: (e: React.PointerEvent) => {
        if (e.button !== 0 && e.pointerType === 'mouse') return
        pressRef.current = { x: e.clientX, y: e.clientY, start }
      },
      onPointerMove: (e: React.PointerEvent) => {
        const press = pressRef.current
        if (!press) return
        if (Math.abs(e.clientX - press.x) > DRAG_THRESHOLD_PX || Math.abs(e.clientY - press.y) > DRAG_THRESHOLD_PX) {
          pressRef.current = null
          press.start()
        }
      },
      onPointerUp: () => {
        pressRef.current = null
      },
      onPointerCancel: () => {
        pressRef.current = null
        cancelPlacing()
      }
    }
  }

  return (
    <Sheet wide title={t('Add a widget')} collapsed={placing !== null} onClose={() => setPaletteOpen(false)}>
      {canDrag ? <p className="nh-palette__hint">{t('Tap to add, or drag onto the dashboard to place it.')}</p> : null}
      <input
        className="nh-palette__search"
        type="search"
        value={search}
        placeholder={t('Search widgets…')}
        aria-label={t('Search widgets…')}
        onChange={(e) => setSearch(e.target.value)}
      />
      <div className="nh-palette">
        {definitions.map((def) => (
          <button
            key={def.type}
            type="button"
            className="nh-palette__card"
            onClick={() => addWidget(def.type)}
            {...cardHandlers(() => startPlacing({ type: def.type, name: t(def.name), w: def.defaultSize.w, h: def.defaultSize.h }))}>
            <span className="nh-palette__name">{t(def.name)}</span>
            <span className="nh-palette__desc">{def.description ? t(def.description) : null}</span>
          </button>
        ))}
      </div>
      {customs.length > 0 ? (
        <>
          <h3 className="nh-palette__section">{t('Custom widgets')}</h3>
          <div className="nh-palette">
            {customs.map((def) => {
              const overrides = { label: def.name, customwidget: def.id, config: {} }
              return (
                <button
                  key={def.id}
                  type="button"
                  className="nh-palette__card"
                  onClick={() => addWidget('template', overrides)}
                  {...cardHandlers(() => startPlacing({ type: 'template', configOverrides: overrides, name: def.name, ...templateSize }))}>
                  <span className="nh-palette__name">{def.name}</span>
                  <span className="nh-palette__desc">{def.kind === 'js' ? t('JavaScript widget') : t('Template widget')}</span>
                </button>
              )
            })}
          </div>
        </>
      ) : null}
      {definitions.length === 0 && customs.length === 0 ? (
        <p className="nh-palette__hint">{t('No widget matches “{{search}}”.', { search: search.trim() })}</p>
      ) : null}
    </Sheet>
  )
}
