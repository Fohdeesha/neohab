import { useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Sheet } from '../components/Sheet'
import { useGridEditSurface } from '../components/useEditSurface'
import { listWidgetDefinitions } from '../widgets'
import { addWidget, cancelPlacing, setPaletteOpen, startPlacing, useEditorStore } from '../store/editor'
import { useConfigStore } from '../store/config'

const DRAG_THRESHOLD_PX = 5

export function PaletteSheet() {
  const { t } = useTranslation()
  const customDefs = useConfigStore((s) => s.widgetDefs)
  const placing = useEditorStore((s) => s.placing)
  const canDrag = useGridEditSurface()
  const pressRef = useRef<{ x: number; y: number; start: () => void } | null>(null)
  const definitions = listWidgetDefinitions()
  const templateSize = definitions.find((d) => d.type === 'template')?.defaultSize ?? { w: 3, h: 3 }

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
    <Sheet title={t('Add a widget')} collapsed={placing !== null} onClose={() => setPaletteOpen(false)}>
      {canDrag ? <p className="nh-palette__hint">{t('Tap to add, or drag onto the dashboard to place it.')}</p> : null}
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
      {customDefs.length > 0 ? (
        <>
          <h3 className="nh-palette__section">{t('Custom widgets')}</h3>
          <div className="nh-palette">
            {customDefs.map((def) => {
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
    </Sheet>
  )
}
