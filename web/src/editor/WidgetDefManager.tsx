/**
 * Settings section for custom widget definitions: create, edit, and delete `widgetdef:<id>`
 * components. Template widgets edit their HTML and a settings schema (each row becomes a field
 * in the widget's settings panel); JavaScript widgets edit their sandboxed script instead, and
 * an administrator can stop them running at all.
 */
import { useState } from 'react'
import {
  deleteWidgetDef,
  saveSettings,
  saveWidgetDef,
  useConfigStore,
} from '../store/config'
import {
  defSettings,
  defTemplate,
  type CustomWidgetDef,
  type WidgetDefSetting,
} from '../model/widgetdef'

const SETTING_TYPES = ['string', 'number', 'boolean', 'item', 'color', 'choices', 'icon', 'heading'] as const

export function WidgetDefManager({ onNotice }: { onNotice: (m: string | null) => void }) {
  const defs = useConfigStore((s) => s.widgetDefs)
  const allowJs = useConfigStore((s) => s.settings.allowJsWidgets === true)
  const [editing, setEditing] = useState<CustomWidgetDef | null>(null)

  const newDef = (kind: 'template' | 'js') => {
    setEditing({
      version: 1,
      id: 'widget-' + Math.random().toString(36).slice(2, 8),
      name: kind === 'js' ? 'My JS widget' : 'My widget',
      kind,
      template: kind === 'template' ? '<div style="padding:8px">{{itemState(config.item)}}</div>' : undefined,
      script: kind === 'js' ? "oh.onReady(function () {\n  document.body.textContent = 'Hello ' + (oh.config.item || 'world')\n})" : undefined,
      settings: [{ id: 'item', type: 'item', label: 'Item' }],
    })
  }

  const edit = (def: CustomWidgetDef) => {
    // normalize imported defs into editable shape without touching the stored original yet
    setEditing({
      ...def,
      template: def.kind === 'js' ? undefined : defTemplate(def),
      settings: defSettings(def),
    })
  }

  const toggleJs = async (enabled: boolean) => {
    onNotice(null)
    const err = await saveSettings({ allowJsWidgets: enabled })
    if (err) onNotice('Saving failed: ' + err + ' — sign in as an administrator.')
  }

  return (
    <section>
      <h2 className="nh-settings__h">Custom widgets</h2>
      <p className="nh-settings__text">
        Template widgets are HTML with expressions (HABPanel-compatible) and are always safe to
        run. JavaScript widgets execute code, but only inside a sandbox that cannot reach this
        dashboard, your session or your token. Turn them off to stop them running at all.
      </p>
      <label className="nh-field nh-field--row" htmlFor="allow-js">
        <span className="nh-field__label">Enable JavaScript widgets</span>
        <input id="allow-js" type="checkbox" checked={allowJs} onChange={(e) => void toggleJs(e.target.checked)} />
      </label>

      {defs.length > 0 ? (
        <div className="nh-deflist">
          {defs.map((def) => (
            <div key={def.id} className="nh-deflist__row">
              <span className="nh-deflist__name">{def.name}</span>
              <span className="nh-deflist__meta">
                {def.kind === 'js' ? 'JavaScript' : 'Template'}
                {def.source ? ` · imported from ${def.source}` : ''}
              </span>
              <button type="button" className="nh-btn nh-btn--ghost" onClick={() => edit(def)}>
                Edit
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="nh-settings__text">No custom widgets yet.</p>
      )}

      <div className="nh-settings__row">
        <button type="button" className="nh-btn" onClick={() => newDef('template')}>
          New template widget
        </button>
        <button type="button" className="nh-btn nh-btn--ghost" onClick={() => newDef('js')}>
          New JavaScript widget
        </button>
      </div>

      {editing ? (
        <DefEditor
          def={editing}
          exists={defs.some((d) => d.id === editing.id)}
          onChange={setEditing}
          onClose={() => setEditing(null)}
          onNotice={onNotice}
        />
      ) : null}
    </section>
  )
}

function DefEditor({
  def,
  exists,
  onChange,
  onClose,
  onNotice,
}: {
  def: CustomWidgetDef
  exists: boolean
  onChange: (d: CustomWidgetDef) => void
  onClose: () => void
  onNotice: (m: string | null) => void
}) {
  const isJs = def.kind === 'js'
  const settings = def.settings ?? []

  const save = async () => {
    onNotice(null)
    if (!def.id.trim() || !def.name.trim()) {
      onNotice('A custom widget needs both an id and a name.')
      return
    }
    try {
      await saveWidgetDef(def)
      onClose()
    } catch (err) {
      onNotice('Saving the widget failed: ' + (err instanceof Error ? err.message : String(err)))
    }
  }

  const remove = async () => {
    if (!window.confirm(`Delete custom widget “${def.name}”? Dashboards using it will show a notice.`)) return
    onNotice(null)
    try {
      await deleteWidgetDef(def.id)
      onClose()
    } catch (err) {
      onNotice('Deleting the widget failed: ' + (err instanceof Error ? err.message : String(err)))
    }
  }

  const setSetting = (index: number, patch: Partial<WidgetDefSetting>) => {
    const next = settings.map((s, i) => (i === index ? { ...s, ...patch } : s))
    onChange({ ...def, settings: next })
  }

  return (
    <div className="nh-defeditor">
      <h3 className="nh-form__section">{exists ? 'Edit' : 'New'} {isJs ? 'JavaScript' : 'template'} widget</h3>
      <div className="nh-form">
        <label className="nh-field" htmlFor="def-name">
          <span className="nh-field__label">Name</span>
          <input id="def-name" type="text" value={def.name} onChange={(e) => onChange({ ...def, name: e.target.value })} />
        </label>
        <label className="nh-field" htmlFor="def-id">
          <span className="nh-field__label">Id {exists ? '(fixed once created)' : ''}</span>
          <input
            id="def-id"
            type="text"
            value={def.id}
            disabled={exists}
            onChange={(e) => onChange({ ...def, id: e.target.value.toLowerCase().replace(/[^a-z0-9-_]+/g, '-') })}
          />
        </label>
        <label className="nh-field" htmlFor="def-body">
          <span className="nh-field__label">{isJs ? 'Script (runs sandboxed, use the `oh` SDK)' : 'Template (HTML)'}</span>
          <textarea
            id="def-body"
            rows={12}
            className="nh-defeditor__code"
            spellCheck={false}
            value={(isJs ? def.script : def.template) ?? ''}
            onChange={(e) => onChange(isJs ? { ...def, script: e.target.value } : { ...def, template: e.target.value })}
          />
        </label>

        <h3 className="nh-form__section">Settings offered to each instance</h3>
        {settings.map((s, i) => (
          <div key={i} className="nh-defeditor__setting">
            <input
              type="text"
              placeholder="id"
              aria-label="Setting id"
              value={s.id}
              onChange={(e) => setSetting(i, { id: e.target.value.replace(/[^\w]+/g, '_') })}
            />
            <select
              aria-label="Setting type"
              value={s.type ?? 'string'}
              onChange={(e) => setSetting(i, { type: e.target.value })}
            >
              {SETTING_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <input
              type="text"
              placeholder="label"
              aria-label="Setting label"
              value={s.label ?? ''}
              onChange={(e) => setSetting(i, { label: e.target.value })}
            />
            <button
              type="button"
              className="nh-iconbtn"
              aria-label="Remove setting"
              onClick={() => onChange({ ...def, settings: settings.filter((_, j) => j !== i) })}
            >
              ✕
            </button>
          </div>
        ))}
        <button
          type="button"
          className="nh-btn nh-btn--ghost"
          onClick={() => onChange({ ...def, settings: [...settings, { id: 'setting_' + (settings.length + 1), type: 'string', label: '' }] })}
        >
          Add setting
        </button>
      </div>
      <div className="nh-settings__row">
        {exists ? (
          <button type="button" className="nh-btn nh-btn--danger" onClick={() => void remove()}>
            Delete
          </button>
        ) : null}
        <span className="nh-dash__spacer" />
        <button type="button" className="nh-btn nh-btn--ghost" onClick={onClose}>
          Close
        </button>
        <button type="button" className="nh-btn nh-btn--primary" onClick={() => void save()}>
          Save widget
        </button>
      </div>
    </div>
  )
}
