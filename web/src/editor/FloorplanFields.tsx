/**
 * Floor plan settings fields: the plan image (the shared background control, so uploads work
 * the same everywhere) and the "Edit lights" sheet - a full-screen surface where lights are
 * added, dragged into place on the plan, labelled and removed. Placement cannot happen on the
 * widget itself: in edit mode a tap on a widget selects it, by design.
 */
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { BackgroundField } from '../components/BackgroundField'
import { ItemPicker } from '../components/ItemPicker'
import { updateWidgetConfig } from '../store/editor'
import { subscribeItems, useItemsStore } from '../store/items'
import type { WidgetInstance } from '../model/dashboard'
import type { SettingField, WidgetContext } from '../widgets/types'
import { PlanCanvas } from '../widgets/floorplan'
import { lightsOf, newLightId, type FloorplanConfig, type FloorplanLight } from '../widgets/floorplan/model'

export function PlanImageField({
  field,
  widget,
  value,
}: {
  field: SettingField
  widget: WidgetInstance
  value: unknown
}) {
  const { t } = useTranslation()
  const id = `f-${widget.id}-${field.key}`
  return (
    <div className="nh-field">
      <label className="nh-field__label" htmlFor={id}>
        {t(field.label)}
      </label>
      <BackgroundField
        id={id}
        value={typeof value === 'string' && value !== '' ? value : undefined}
        onChange={(ref) => updateWidgetConfig(widget.id, field.key, ref)}
      />
    </div>
  )
}

export function PlanLightsField({ field, widget }: { field: SettingField; widget: WidgetInstance }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const count = lightsOf(widget.config as FloorplanConfig).length
  return (
    <div className="nh-field">
      <span className="nh-field__label">{t(field.label)}</span>
      <button type="button" className="nh-btn nh-btn--ghost" onClick={() => setOpen(true)}>
        {count > 0 ? t('Edit lights… ({{count}} placed)', { count }) : t('Add lights…')}
      </button>
      {open ? <PlanLightsSheet widget={widget} onClose={() => setOpen(false)} /> : null}
    </div>
  )
}

/** The placement surface. Writes go into the editor draft like every other setting - one
 * coalesced undo entry, saved or discarded with the dashboard. */
function PlanLightsSheet({ widget, onClose }: { widget: WidgetInstance; onClose: () => void }) {
  const { t } = useTranslation()
  const config = widget.config as FloorplanConfig
  const lights = lightsOf(config)
  const [sel, setSel] = useState<string | null>(lights[0]?.id ?? null)
  const [pickItem, setPickItem] = useState('')

  // Live glows while placing, so the plan being edited looks like the plan being used.
  const itemsKey = JSON.stringify(lights.map((l) => l.item))
  const itemNames = useMemo(() => JSON.parse(itemsKey) as string[], [itemsKey])
  useEffect(() => subscribeItems(itemNames), [itemNames])
  const states = useItemsStore((s) => s.states)
  const ctx: WidgetContext = {
    widgetId: widget.id,
    getItem: (n) => states[n],
    sendCommand: async () => false,
    editing: true,
  }

  const setLights = (next: FloorplanLight[]) => updateWidgetConfig(widget.id, 'lights', next)
  const patchLight = (id: string, patch: Partial<FloorplanLight>) =>
    setLights(lights.map((l) => (l.id === id ? { ...l, ...patch } : l)))

  const addLight = () => {
    if (!pickItem) return
    const id = newLightId()
    setLights([...lights, { id, item: pickItem, x: 50, y: 50 }])
    setSel(id)
    setPickItem('')
  }

  const placeSelected = (e: React.PointerEvent) => {
    // A press on the plan background moves the selected light there; presses on markers are
    // handled by the markers themselves (drag).
    if (!sel || e.target !== e.currentTarget) return
    const layer = (e.currentTarget as HTMLElement).getBoundingClientRect()
    if (layer.width <= 0 || layer.height <= 0) return
    const x = Math.min(100, Math.max(0, ((e.clientX - layer.left) / layer.width) * 100))
    const y = Math.min(100, Math.max(0, ((e.clientY - layer.top) / layer.height) * 100))
    patchLight(sel, { x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 })
  }

  return (
    <div className="nh-planedit" role="dialog" aria-label={t('Edit lights')}>
      <header className="nh-planedit__bar">
        <h2>{t('Edit lights')}</h2>
        <p className="nh-planedit__hint">{t('Drag a light onto its lamp. Tap the plan to move the selected light there.')}</p>
        <button type="button" className="nh-btn nh-btn--primary" onClick={onClose}>
          {t('Done')}
        </button>
      </header>
      <div className="nh-planedit__body">
        <div className="nh-planedit__plan">
          <PlanCanvas config={config} ctx={ctx} onPlanPointerDown={placeSelected}>
            {() => (
              <DragMarkers lights={lights} sel={sel} onSelect={setSel} onMove={(id, x, y) => patchLight(id, { x, y })} />
            )}
          </PlanCanvas>
        </div>
        <aside className="nh-planedit__side">
          <div className="nh-planedit__add">
            <ItemPicker id="planedit-item" value={pickItem} onChange={(v) => setPickItem(typeof v === 'string' ? v : '')} />
            <button type="button" className="nh-btn" disabled={!pickItem} onClick={addLight}>
              {t('Add')}
            </button>
          </div>
          <div className="nh-planedit__list">
            {lights.length === 0 ? <p className="nh-planedit__none">{t('No lights on this plan yet.')}</p> : null}
            {lights.map((l) => (
              <div
                key={l.id}
                className={'nh-planedit__row' + (sel === l.id ? ' nh-planedit__row--sel' : '')}
                onClick={() => setSel(l.id)}
              >
                <span className="nh-planedit__item" title={l.item}>
                  {l.item}
                </span>
                <input
                  type="text"
                  className="nh-planedit__label"
                  placeholder={t('Label')}
                  value={l.label ?? ''}
                  onChange={(e) => patchLight(l.id, { label: e.target.value || undefined })}
                />
                <button
                  type="button"
                  className="nh-iconbtn"
                  aria-label={t('Remove light')}
                  onClick={(e) => {
                    e.stopPropagation()
                    setLights(lights.filter((x) => x.id !== l.id))
                    if (sel === l.id) setSel(null)
                  }}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </aside>
      </div>
    </div>
  )
}

/** Markers that drag. Position updates locally per frame; the config is written once on drop. */
function DragMarkers({
  lights,
  sel,
  onSelect,
  onMove,
}: {
  lights: FloorplanLight[]
  sel: string | null
  onSelect: (id: string) => void
  onMove: (id: string, x: number, y: number) => void
}) {
  const [drag, setDrag] = useState<{ id: string; x: number; y: number } | null>(null)

  const pctFromEvent = (e: React.PointerEvent): { x: number; y: number } | null => {
    const layer = (e.currentTarget as HTMLElement).parentElement?.getBoundingClientRect()
    if (!layer || layer.width <= 0 || layer.height <= 0) return null
    return {
      x: Math.round(Math.min(100, Math.max(0, ((e.clientX - layer.left) / layer.width) * 100)) * 10) / 10,
      y: Math.round(Math.min(100, Math.max(0, ((e.clientY - layer.top) / layer.height) * 100)) * 10) / 10,
    }
  }

  return (
    <>
      {lights.map((l) => {
        const pos = drag?.id === l.id ? drag : l
        return (
          <button
            key={l.id}
            type="button"
            className={
              'nh-fplan__marker nh-fplan__marker--edit' + (sel === l.id ? ' nh-fplan__marker--sel' : '')
            }
            style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
            title={l.label ?? l.item}
            aria-label={l.label ?? l.item}
            onPointerDown={(e) => {
              e.preventDefault()
              e.stopPropagation()
              onSelect(l.id)
              ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
              setDrag({ id: l.id, x: l.x, y: l.y })
            }}
            onPointerMove={(e) => {
              if (!drag || drag.id !== l.id) return
              const p = pctFromEvent(e)
              if (p) setDrag({ id: l.id, ...p })
            }}
            onPointerUp={() => {
              if (drag && drag.id === l.id) onMove(l.id, drag.x, drag.y)
              setDrag(null)
            }}
            onPointerCancel={() => setDrag(null)}
          />
        )
      })}
    </>
  )
}
