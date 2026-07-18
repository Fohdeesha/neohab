/**
 * Widget settings panel, generated from the widget definition's declarative `settings[]`
 * schema. Edits apply to the draft immediately (live preview on the dashboard); same-field
 * changes coalesce into one undo entry.
 */
import { Sheet } from '../components/Sheet'
import { ItemPicker } from '../components/ItemPicker'
import { IconPicker } from '../components/IconPicker'
import { ChartSeriesField, ChartThresholdsField } from './ChartFields'
import type { SettingField } from '../widgets/types'
import { getWidgetDefinition } from '../widgets'
import type { WidgetInstance } from '../model/dashboard'
import { removeWidget, selectWidget, updateWidgetConfig } from '../store/editor'
import { useConfigStore } from '../store/config'
import { defSettings, mergedSettingValues, type WidgetDefSetting } from '../model/widgetdef'

export function SettingsPanel({ widget }: { widget: WidgetInstance }) {
  const def = getWidgetDefinition(widget.type)
  if (!def) return null

  // Same defaults-under-config merge the runtime uses, so the form shows effective values
  // (an imported button without an explicit `action` key still shows "Send command").
  const effective = { ...def.defaultConfig(), ...widget.config }
  const customwidget = widget.type === 'template' ? (effective.customwidget as string | undefined) : undefined

  return (
    <Sheet side title={def.name + ' settings'} onClose={() => selectWidget(null)}>
      <div className="nh-form">
        {def.settings
          // an instance driven by a custom widget definition ignores its inline template
          .filter((f) => !(customwidget && f.key === 'template'))
          // fields another setting has made irrelevant (navigate targets on a command button)
          .filter((f) => !f.showIf || f.showIf(effective))
          .map((field) => (
            <Field key={field.key} field={field} widget={widget} value={effective[field.key]} />
          ))}
        {customwidget ? <CustomWidgetFields widget={widget} defId={customwidget} /> : null}
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

/** Settings declared by a custom widget definition, writing into the instance's config map. */
function CustomWidgetFields({ widget, defId }: { widget: WidgetInstance; defId: string }) {
  const def = useConfigStore((s) => s.widgetDefs.find((d) => d.id === defId))
  if (!def) {
    return <p className="nh-settings__text">Custom widget “{defId}” was not found on this server.</p>
  }
  const schema = defSettings(def)
  if (schema.length === 0) {
    return <p className="nh-settings__text">“{def.name}” has no settings.</p>
  }
  const values = mergedSettingValues(def, (widget.config.config as Record<string, unknown>) ?? {})
  const setValue = (id: string, v: unknown) =>
    updateWidgetConfig(widget.id, 'config', { ...((widget.config.config as Record<string, unknown>) ?? {}), [id]: v })

  return (
    <>
      <h3 className="nh-form__section">“{def.name}” settings</h3>
      {schema.map((s) => (
        <CustomField key={s.id} setting={s} value={values[s.id]} onChange={(v) => setValue(s.id, v)} />
      ))}
    </>
  )
}

/**
 * Value for a number input. Imported and hand-edited configs store numbers as strings, and a
 * field that silently renders blank looks like an unset setting the user is about to lose.
 */
function numberValue(value: unknown): number | '' {
  if (typeof value === 'number') return Number.isFinite(value) ? value : ''
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value)
    if (Number.isFinite(n)) return n
  }
  return ''
}

function CustomField({
  setting,
  value,
  onChange,
}: {
  setting: WidgetDefSetting
  value: unknown
  onChange: (v: unknown) => void
}) {
  const id = 'cw-' + setting.id
  const label = setting.label ?? setting.id
  switch (setting.type) {
    case 'item':
      return (
        <div className="nh-field">
          <label className="nh-field__label" htmlFor={id}>
            {label}
          </label>
          <ItemPicker id={id} value={typeof value === 'string' ? value : ''} onChange={onChange} />
        </div>
      )
    case 'boolean':
      return (
        <label className="nh-field nh-field--row" htmlFor={id}>
          <span className="nh-field__label">{label}</span>
          <input id={id} type="checkbox" checked={value === true || value === 'true'} onChange={(e) => onChange(e.target.checked)} />
        </label>
      )
    case 'number':
      return (
        <label className="nh-field" htmlFor={id}>
          <span className="nh-field__label">{label}</span>
          <input
            id={id}
            type="number"
            value={numberValue(value)}
            onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))}
          />
        </label>
      )
    case 'heading':
      return <h3 className="nh-form__section">{label}</h3>
    default:
      return (
        <label className="nh-field" htmlFor={id}>
          <span className="nh-field__label">{label}</span>
          <input
            id={id}
            type="text"
            value={typeof value === 'string' ? value : value === undefined || value === null ? '' : String(value)}
            placeholder={setting.description}
            onChange={(e) => onChange(e.target.value)}
          />
        </label>
      )
  }
}

function Field(props: { field: SettingField; widget: WidgetInstance; value: unknown }) {
  return (
    <>
      <FieldInput {...props} />
      {props.field.hint ? <p className="nh-field__hint">{props.field.hint}</p> : null}
    </>
  )
}

function FieldInput({ field, widget, value }: { field: SettingField; widget: WidgetInstance; value: unknown }) {
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
            value={numberValue(value)}
            min={field.min}
            max={field.max}
            step={field.step}
            onChange={(e) => set(e.target.value === '' ? undefined : Number(e.target.value))}
          />
        </label>
      )
    case 'select': {
      const current = typeof value === 'string' ? value : ''
      return (
        <label className="nh-field" htmlFor={id}>
          <span className="nh-field__label">{field.label}</span>
          <select id={id} value={current} onChange={(e) => set(e.target.value)}>
            {/* placeholder row only when nothing (not even a default) resolves */}
            {field.options.some((o) => o.value === current) ? null : <option value={current} />}
            {field.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      )
    }
    case 'color': {
      const hasValue = typeof value === 'string' && value !== ''
      return (
        <label className="nh-field nh-field--row" htmlFor={id}>
          <span className="nh-field__label">{field.label}</span>
          <span className="nh-colorfield">
            {hasValue ? (
              <button type="button" className="nh-colorfield__clear" onClick={() => set(undefined)}>
                Auto
              </button>
            ) : (
              <span className="nh-colorfield__hint">theme</span>
            )}
            <input
              id={id}
              type="color"
              value={hasValue ? (value as string) : '#888888'}
              onChange={(e) => set(e.target.value)}
            />
          </span>
        </label>
      )
    }
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
    case 'icon':
      return (
        <div className="nh-field">
          <label className="nh-field__label" htmlFor={id}>
            {field.label}
          </label>
          <IconPicker id={id} value={typeof value === 'string' ? value : ''} onChange={set} />
        </div>
      )
    case 'chartseries':
      return <ChartSeriesField widget={widget} />
    case 'chartthresholds':
      return <ChartThresholdsField widget={widget} />
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

