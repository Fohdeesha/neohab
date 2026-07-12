/**
 * Widget settings panel, generated from the widget definition's declarative `settings[]`
 * schema. Edits apply to the draft immediately (live preview on the dashboard); same-field
 * changes coalesce into one undo entry.
 */
import { Sheet } from '../components/Sheet'
import { ItemPicker } from '../components/ItemPicker'
import type { SettingField } from '../widgets/types'
import { getWidgetDefinition } from '../widgets'
import type { WidgetInstance } from '../model/dashboard'
import { removeWidget, selectWidget, updateWidgetConfig } from '../store/editor'

export function SettingsPanel({ widget }: { widget: WidgetInstance }) {
  const def = getWidgetDefinition(widget.type)
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
    case 'multiline':
      return (
        <label className="nh-field" htmlFor={id}>
          <span className="nh-field__label">{field.label}</span>
          <textarea
            id={id}
            rows={4}
            value={typeof value === 'string' ? value : ''}
            placeholder={field.placeholder}
            onChange={(e) => set(e.target.value)}
          />
        </label>
      )
    case 'item':
      return (
        <div className="nh-field">
          <label className="nh-field__label" htmlFor={id}>
            {field.label}
          </label>
          <ItemPicker
            id={id}
            value={typeof value === 'string' ? value : ''}
            itemTypes={field.itemTypes}
            onChange={set}
          />
        </div>
      )
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

