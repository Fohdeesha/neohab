/**
 * Widget settings panel, generated from the widget definition's declarative `settings[]`
 * schema. Edits apply to the draft immediately (live preview on the dashboard); same-field
 * changes coalesce into one undo entry.
 */
import { useEffect } from 'react'
import { Sheet } from '../components/Sheet'
import type { SettingField } from '../widgets/types'
import { getWidgetDefinition } from '../widgets'
import type { WidgetInstance } from '../model/dashboard'
import { removeWidget, selectWidget, updateWidgetConfig } from '../store/editor'
import { ensureCatalog, useCatalogStore } from '../store/catalog'

export function SettingsPanel({ widget }: { widget: WidgetInstance }) {
  const def = getWidgetDefinition(widget.type)

  useEffect(() => {
    if (def?.settings.some((f) => f.type === 'item')) ensureCatalog()
  }, [def])

  if (!def) return null

  return (
    <Sheet side title={def.name + ' settings'} onClose={() => selectWidget(null)}>
      <div className="nh-form">
        {def.settings.map((field) => (
          <Field key={field.key} field={field} widget={widget} />
        ))}
      </div>
      <div className="nh-form__footer">
        <button
          type="button"
          className="nh-btn nh-btn--danger"
          onClick={() => {
            removeWidget(widget.id)
          }}
        >
          Delete widget
        </button>
      </div>
    </Sheet>
  )
}

function Field({ field, widget }: { field: SettingField; widget: WidgetInstance }) {
  const value = widget.config[field.key]
  const set = (v: unknown) => updateWidgetConfig(widget.id, field.key, v)
  const id = `f-${widget.id}-${field.key}`

  switch (field.type) {
    case 'boolean':
      return (
        <label className="nh-field nh-field--row" htmlFor={id}>
          <span className="nh-field__label">{field.label}</span>
          <input id={id} type="checkbox" checked={value === true} onChange={(e) => set(e.target.checked)} />
        </label>
      )
    case 'number':
      return (
        <label className="nh-field" htmlFor={id}>
          <span className="nh-field__label">{field.label}</span>
          <input
            id={id}
            type="number"
            value={typeof value === 'number' ? value : ''}
            min={field.min}
            max={field.max}
            step={field.step}
            onChange={(e) => set(e.target.value === '' ? undefined : Number(e.target.value))}
          />
        </label>
      )
    case 'select':
      return (
        <label className="nh-field" htmlFor={id}>
          <span className="nh-field__label">{field.label}</span>
          <select id={id} value={typeof value === 'string' ? value : ''} onChange={(e) => set(e.target.value)}>
            <option value="" />
            {field.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      )
    case 'color':
      return (
        <label className="nh-field nh-field--row" htmlFor={id}>
          <span className="nh-field__label">{field.label}</span>
          <input
            id={id}
            type="color"
            value={typeof value === 'string' && value ? value : '#888888'}
            onChange={(e) => set(e.target.value)}
          />
        </label>
      )
    case 'item':
      return <ItemField field={field} id={id} value={value} set={set} />
    default:
      return (
        <label className="nh-field" htmlFor={id}>
          <span className="nh-field__label">{field.label}</span>
          <input
            id={id}
            type="text"
            value={typeof value === 'string' ? value : ''}
            placeholder={'placeholder' in field ? field.placeholder : undefined}
            onChange={(e) => set(e.target.value)}
          />
        </label>
      )
  }
}

function ItemField({
  field,
  id,
  value,
  set,
}: {
  field: Extract<SettingField, { type: 'item' }>
  id: string
  value: unknown
  set: (v: unknown) => void
}) {
  const items = useCatalogStore((s) => s.items)
  const filtered = field.itemTypes
    ? items.filter((i) => field.itemTypes!.some((t) => i.type.startsWith(t) || i.type.startsWith('Group')))
    : items

  return (
    <label className="nh-field" htmlFor={id}>
      <span className="nh-field__label">{field.label}</span>
      <input
        id={id}
        type="text"
        list={id + '-list'}
        value={typeof value === 'string' ? value : ''}
        placeholder="Item name…"
        onChange={(e) => set(e.target.value)}
      />
      <datalist id={id + '-list'}>
        {filtered.map((i) => (
          <option key={i.name} value={i.name}>
            {i.label ? `${i.label} (${i.type})` : i.type}
          </option>
        ))}
      </datalist>
    </label>
  )
}
