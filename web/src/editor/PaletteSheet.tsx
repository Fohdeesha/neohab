/**
 * Widget palette.
 *
 * Tap a card and the widget lands at the first free spot; drag a card onto the grid and it lands
 * exactly where it is dropped (the grid previews the cell - see EditableGrid). While a drag is in
 * flight the sheet gets out of the way, since a bottom sheet covers the rows you are aiming at.
 * Dragging is offered only on the grid surface: the single-column stack has no cells to aim at,
 * so there a card is tap-to-add as before.
 */
import { useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Sheet } from '../components/Sheet'
import { useGridEditSurface } from '../components/useEditSurface'
import { listWidgetDefinitions } from '../widgets'
import { addWidget, cancelPlacing, setPaletteOpen, startPlacing, useEditorStore } from '../store/editor'
import { useConfigStore } from '../store/config'

/** Movement past this many pixels turns a press on a card into a drag, matching the grid. */
const DRAG_THRESHOLD_PX = 5

export function PaletteSheet() {
  const { t } = useTranslation()
  const customDefs = useConfigStore((s) => s.widgetDefs)
  const placing = useEditorStore((s) => s.placing)
  const canDrag = useGridEditSurface()
  // The press that may become a drag. A ref: it changes on pointer events that must not
  // re-render the palette mid-gesture.
  const pressRef = useRef<{ x: number; y: number; start: () => void } | null>(null)
  const definitions = listWidgetDefinitions()
  // Custom widgets are template instances, so a dragged one is the size a tapped one would be.
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
      // The grid's window-level handler owns the release once a drag has started; this only has
      // to forget a press that never moved (that release is an ordinary click → tap-to-add).
      onPointerUp: () => {
        pressRef.current = null
      },
      onPointerCancel: () => {
        pressRef.current = null
        cancelPlacing()
      },
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
            {...cardHandlers(() =>
              startPlacing({ type: def.type, name: t(def.name), w: def.defaultSize.w, h: def.defaultSize.h })
            )}
          >
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
                  {...cardHandlers(() => startPlacing({ type: 'template', configOverrides: overrides, name: def.name, ...templateSize }))}
                >
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
