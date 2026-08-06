/**
 * Settings section for custom widget definitions: create, edit, and delete `widgetdef:<id>`
 * components. Template widgets edit their HTML and a settings schema (each row becomes a field
 * in the widget's settings panel); JavaScript widgets edit their sandboxed script instead, and
 * an administrator can stop them running at all.
 */
import { Fragment, useState } from 'react'
import { useTranslation } from 'react-i18next'
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
import { exportComponent } from '../editor/exportComponent'

const SETTING_TYPES = ['string', 'number', 'boolean', 'item', 'color', 'choices', 'icon', 'heading'] as const

export function WidgetDefManager({ onNotice }: { onNotice: (m: string | null) => void }) {
  const { t } = useTranslation()
  const defs = useConfigStore((s) => s.widgetDefs)
  const allowJs = useConfigStore((s) => s.settings.allowJsWidgets === true)
  const [editing, setEditing] = useState<CustomWidgetDef | null>(null)
  // The list row the editor was opened from, so it renders right under what was clicked
  // instead of below the whole list. Null = a new widget (editor sits under the New buttons).
  const [anchor, setAnchor] = useState<string | null>(null)

  const newDef = (kind: 'template' | 'js') => {
    setAnchor(null)
    setEditing({
      version: 1,
      id: 'widget-' + Math.random().toString(36).slice(2, 8),
      name: kind === 'js' ? t('My JS widget') : t('My widget'),
      kind,
      template: kind === 'template' ? '<div style="padding:8px">{{itemState(config.item)}}</div>' : undefined,
      script: kind === 'js' ? "oh.onReady(function () {\n  document.body.textContent = 'Hello ' + (oh.config.item || 'world')\n})" : undefined,
      settings: [{ id: 'item', type: 'item', label: 'Item' }],
    })
  }

  const edit = (def: CustomWidgetDef) => {
    setAnchor(def.id)
    // normalize imported defs into editable shape without touching the stored original yet
    setEditing({
      ...def,
      template: def.kind === 'js' ? undefined : defTemplate(def),
      settings: defSettings(def),
    })
  }

  const close = () => {
    setEditing(null)
    setAnchor(null)
  }

  const toggleJs = async (enabled: boolean) => {
    onNotice(null)
    const err = await saveSettings({ allowJsWidgets: enabled })
    if (err) onNotice(t('Saving failed: {{error}} — sign in as an administrator.', { error: err }))
  }

  return (
    <section>
      <h2 className="nh-settings__h">{t('Custom widgets')}</h2>
      <p className="nh-settings__text">
        {t(
          'Template widgets are HTML with expressions (HABPanel-compatible) and are always safe to run. JavaScript widgets execute code, but only inside a sandbox that cannot reach this dashboard, your session or your token. Turn them off to stop them running at all.'
        )}
      </p>
      <label className="nh-field nh-field--row" htmlFor="allow-js">
        <span className="nh-field__label">{t('Enable JavaScript widgets')}</span>
        <input id="allow-js" type="checkbox" checked={allowJs} onChange={(e) => void toggleJs(e.target.checked)} />
      </label>

      {defs.length > 0 ? (
        <div className="nh-deflist">
          {defs.map((def) => (
            <Fragment key={def.id}>
              <div className="nh-deflist__row">
                <span className="nh-deflist__name">{def.name}</span>
                <span className="nh-deflist__meta">
                  {def.kind === 'js' ? t('JavaScript') : t('Template')}
                  {def.source ? ' · ' + t('imported from {{source}}', { source: def.source }) : ''}
                </span>
                <button
                  type="button"
                  className="nh-btn nh-btn--ghost"
                  title={t('Export this widget as a file')}
                  onClick={() => void exportComponent('widgetdef', def.id, onNotice)}
                >
                  {t('Export')}
                </button>
                <button type="button" className="nh-btn nh-btn--ghost" onClick={() => edit(def)}>
                  {t('Edit')}
                </button>
              </div>
              {editing && anchor === def.id ? (
                <DefEditor def={editing} exists onChange={setEditing} onClose={close} onNotice={onNotice} />
              ) : null}
            </Fragment>
          ))}
        </div>
      ) : (
        <p className="nh-settings__text">{t('No custom widgets yet.')}</p>
      )}

      <div className="nh-settings__row">
        <button type="button" className="nh-btn" onClick={() => newDef('template')}>
          {t('New template widget')}
        </button>
        <button type="button" className="nh-btn nh-btn--ghost" onClick={() => newDef('js')}>
          {t('New JavaScript widget')}
        </button>
      </div>

      {/* new widgets (and an anchor that vanished from the list) edit down here */}
      {editing && !defs.some((d) => d.id === anchor) ? (
        <DefEditor
          def={editing}
          exists={defs.some((d) => d.id === editing.id)}
          onChange={setEditing}
          onClose={close}
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
  const { t } = useTranslation()
  const isJs = def.kind === 'js'
  const settings = def.settings ?? []

  const save = async () => {
    onNotice(null)
    if (!def.id.trim() || !def.name.trim()) {
      onNotice(t('A custom widget needs both an id and a name.'))
      return
    }
    try {
      await saveWidgetDef(def)
      onClose()
    } catch (err) {
      onNotice(t('Saving the widget failed: {{error}}', { error: err instanceof Error ? err.message : String(err) }))
    }
  }

  const remove = async () => {
    if (!window.confirm(t('Delete custom widget “{{name}}”? Dashboards using it will show a notice.', { name: def.name })))
      return
    onNotice(null)
    try {
      await deleteWidgetDef(def.id)
      onClose()
    } catch (err) {
      onNotice(t('Deleting the widget failed: {{error}}', { error: err instanceof Error ? err.message : String(err) }))
    }
  }

  const setSetting = (index: number, patch: Partial<WidgetDefSetting>) => {
    const next = settings.map((s, i) => (i === index ? { ...s, ...patch } : s))
    onChange({ ...def, settings: next })
  }

  return (
    <div className="nh-defeditor">
      <h3 className="nh-form__section">
        {exists
          ? isJs
            ? t('Edit JavaScript widget')
            : t('Edit template widget')
          : isJs
            ? t('New JavaScript widget')
            : t('New template widget')}
      </h3>
      <div className="nh-form">
        <label className="nh-field" htmlFor="def-name">
          <span className="nh-field__label">{t('Name')}</span>
          <input id="def-name" type="text" value={def.name} onChange={(e) => onChange({ ...def, name: e.target.value })} />
        </label>
        <label className="nh-field" htmlFor="def-id">
          <span className="nh-field__label">{exists ? t('Id (fixed once created)') : t('Id')}</span>
          <input
            id="def-id"
            type="text"
            value={def.id}
            disabled={exists}
            onChange={(e) => onChange({ ...def, id: e.target.value.toLowerCase().replace(/[^a-z0-9-_]+/g, '-') })}
          />
        </label>
        <label className="nh-field" htmlFor="def-body">
          <span className="nh-field__label">
            {isJs ? t('Script (runs sandboxed, use the `oh` SDK)') : t('Template (HTML)')}
          </span>
          <textarea
            id="def-body"
            rows={12}
            className="nh-defeditor__code"
            spellCheck={false}
            value={(isJs ? def.script : def.template) ?? ''}
            onChange={(e) => onChange(isJs ? { ...def, script: e.target.value } : { ...def, template: e.target.value })}
          />
        </label>

        <h3 className="nh-form__section">{t('Settings offered to each instance')}</h3>
        {settings.map((s, i) => (
          <div key={i} className="nh-defeditor__setting">
            <input
              type="text"
              placeholder={t('id')}
              aria-label={t('Setting id')}
              value={s.id}
              onChange={(e) => setSetting(i, { id: e.target.value.replace(/[^\w]+/g, '_') })}
            />
            <select
              aria-label={t('Setting type')}
              value={s.type ?? 'string'}
              onChange={(e) => setSetting(i, { type: e.target.value })}
            >
              {SETTING_TYPES.map((st) => (
                <option key={st} value={st}>
                  {st}
                </option>
              ))}
            </select>
            <input
              type="text"
              placeholder={t('label')}
              aria-label={t('Setting label')}
              value={s.label ?? ''}
              onChange={(e) => setSetting(i, { label: e.target.value })}
            />
            <button
              type="button"
              className="nh-iconbtn"
              aria-label={t('Remove setting')}
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
          {t('Add setting')}
        </button>
      </div>
      <div className="nh-settings__row">
        {exists ? (
          <button type="button" className="nh-btn nh-btn--danger" onClick={() => void remove()}>
            {t('Delete')}
          </button>
        ) : null}
        <span className="nh-dash__spacer" />
        <button type="button" className="nh-btn nh-btn--ghost" onClick={onClose}>
          {t('Close')}
        </button>
        <button type="button" className="nh-btn nh-btn--primary" onClick={() => void save()}>
          {t('Save widget')}
        </button>
      </div>
    </div>
  )
}
