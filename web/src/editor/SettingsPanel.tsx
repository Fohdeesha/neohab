/**
 * Widget settings panel, generated from the widget definition's declarative `settings[]`
 * schema. Edits apply to the draft immediately (live preview on the dashboard); same-field
 * changes coalesce into one undo entry.
 */
import { useTranslation } from 'react-i18next'
import { Sheet } from '../components/Sheet'
import { ItemPicker } from '../components/ItemPicker'
import { IconPicker } from '../components/IconPicker'
import { ChartSeriesField, ChartThresholdsField } from './ChartFields'
import { GaugeMarkersField, GaugeSeverityField, GaugeZonesField } from './GaugeFields'
import { StateColorsField, StateIconsField, TimelineSeriesField } from './StateFields'
import { CameraStreamField } from './CameraStreamField'
import { PlanImageField, PlanLightsField } from './FloorplanFields'
import { ItemPatternField, WeatherLocationField } from './WeatherFields'
import { ClockZonesField, TimeZoneField } from './ClockFields'
import type { SettingField } from '../widgets/types'
import { getWidgetDefinition } from '../widgets'
import type { WidgetInstance } from '../model/dashboard'
import type { Surface } from '../model/layout'
import { removeWidget, selectWidget, updateWidgetConfig, updateWidgetConfigs } from '../store/editor'
import { useCatalogStore } from '../store/catalog'
import { useConfigStore } from '../store/config'
import { defSettings, mergedSettingValues, type WidgetDefSetting } from '../model/widgetdef'
import { NumberSetting } from '../components/NumberSetting'
import { mixedContent } from '../model/url'
import { parseColor } from '../themes/contrast'

/**
 * Universal fields, not declared per definition: instance-level presentation (like layout)
 * that the grids read for any widget type. Text size is offered everywhere; the Name
 * alignment/position pair only on widgets whose definition says the Name renders as the
 * shared frame's header row (`hasHeader`).
 */
const HIDE_ON_FIELD: SettingField = {
  key: 'hideOn',
  type: 'hideon',
  label: 'Hide on',
  hint: 'Leave this widget out at the chosen screen sizes. It always stays visible while editing.'
}

const ACCENT_FIELD: SettingField = {
  key: 'accent',
  type: 'select',
  label: 'Tile accent',
  options: [
    // An empty value, so choosing it clears the key: the select's own handler writes undefined
    // for '', and `widgetAccent` reads anything it does not recognise as no accent either way.
    { value: '', label: 'None' },
    { value: 'filled', label: 'Filled' },
    { value: 'tinted', label: 'Tinted' },
    { value: 'outlined', label: 'Outlined' }
  ],
  hint: 'Makes the tile stand out: painted in the accent color (filled), a muted wash of it (tinted), or framed by a rule in it (outlined).'
}

const ACCENT_COLOR_FIELD: SettingField = {
  key: 'accentColor',
  type: 'color',
  label: 'Accent color',
  hint: 'This tile’s own accent: it recolors the filled/tinted accent above, and the panel border and digits in themes with per-tile accents. Empty = the theme accent.'
}

const GROUP_FIELD: SettingField = {
  key: 'group',
  type: 'text',
  label: 'Panel group',
  hint: 'Widgets sharing a name here are framed together as one panel. Leave it empty for a tile that stands alone.'
}

const TEXT_SIZE_FIELD: SettingField = {
  key: 'textSize',
  type: 'number',
  label: 'Text size (%)',
  min: 50,
  max: 300,
  step: 5,
  hint: 'Scales this widget’s text on top of the dashboard sizing. Empty or 100 = normal.'
}

/**
 * Whether the name is drawn at all, offered by every widget that has a header row - a widget
 * whose name is obvious from what it draws (a weather panel, a camera) should not be forced to
 * carry a title. A widget may add choices of its own between these two (`labelModes`); the
 * camera's "Over the picture" is the only one. Only shown once there is a name to show.
 */
function labelModeField(def: { labelModes?: { options: { value: string; label: string }[]; hint?: string } }): SettingField {
  return {
    key: 'labelMode',
    type: 'select',
    label: 'Show the name',
    options: [{ value: 'header', label: 'In the title bar' }, ...(def.labelModes?.options ?? []), { value: 'none', label: 'Not at all' }],
    hint: def.labelModes?.hint
  }
}

/**
 * Name alignment and position both offer an explicit "theme default".
 *
 * Several themes set the alignment they want for every widget, and a widget only follows that
 * while it has made no choice of its own. Showing "Left" for a widget that is actually inheriting
 * a theme's centred default was wrong twice over: it described the widget incorrectly, and
 * touching the field to see what it did silently pinned Left with no way back.
 */
const LABEL_ALIGN_FIELD: SettingField = {
  key: 'labelAlign',
  type: 'select',
  label: 'Name alignment',
  options: [
    { value: '', label: 'Theme default' },
    { value: 'left', label: 'Left' },
    { value: 'center', label: 'Center' },
    { value: 'right', label: 'Right' }
  ]
}

const LABEL_POSITION_FIELD: SettingField = {
  key: 'labelPosition',
  type: 'select',
  label: 'Name position',
  options: [
    { value: '', label: 'Theme default' },
    { value: 'top', label: 'Top' },
    { value: 'bottom', label: 'Bottom' }
  ]
}

export function SettingsPanel({ widget }: { widget: WidgetInstance }) {
  const { t } = useTranslation()
  const def = getWidgetDefinition(widget.type)
  if (!def) return null

  // Same defaults-under-config merge the runtime uses, so the form shows effective values
  // (an imported button without an explicit `action` key still shows "Send command").
  const effective = { ...def.defaultConfig(), ...widget.config }
  const customwidget = widget.type === 'template' ? (effective.customwidget as string | undefined) : undefined

  return (
    <Sheet side title={t('{{name}} settings', { name: t(def.name) })} onClose={() => selectWidget(null)}>
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
        {def.hasHeader ? (
          <>
            {String(effective.label ?? '').trim() ? (
              <Field field={labelModeField(def)} widget={widget} value={(effective.labelMode as string) || 'header'} />
            ) : null}
            <Field field={LABEL_ALIGN_FIELD} widget={widget} value={(effective.labelAlign as string) ?? ''} />
            <Field field={LABEL_POSITION_FIELD} widget={widget} value={(effective.labelPosition as string) ?? ''} />
          </>
        ) : null}
        {/* 'none' is the absence of an accent, so it is stored as absent - every other "unset"
            choice in this form clears its key rather than writing a word meaning nothing. */}
        <Field field={ACCENT_FIELD} widget={widget} value={(effective.accent as string) ?? ''} />
        <Field field={ACCENT_COLOR_FIELD} widget={widget} value={effective[ACCENT_COLOR_FIELD.key]} />
        <Field field={GROUP_FIELD} widget={widget} value={effective[GROUP_FIELD.key]} />
        <Field field={TEXT_SIZE_FIELD} widget={widget} value={effective[TEXT_SIZE_FIELD.key]} />
        <Field field={HIDE_ON_FIELD} widget={widget} value={effective[HIDE_ON_FIELD.key]} />
      </div>
      <div className="nh-form__footer">
        <button
          type="button"
          className="nh-btn nh-btn--danger"
          onClick={() => {
            removeWidget(widget.id)
          }}>
          {t('Delete widget')}
        </button>
      </div>
    </Sheet>
  )
}

/**
 * Per-surface visibility. Three toggles rather than three boolean settings: it is one decision
 * ("where does this not belong?"), and three separate rows of chrome in every widget's settings
 * would drown the fields that matter.
 */
function HideOnField({ field, widget, value }: { field: SettingField; widget: WidgetInstance; value: unknown }) {
  const { t } = useTranslation()
  const current = (Array.isArray(value) ? value : typeof value === 'string' ? [value] : []).filter(
    (s): s is Surface => s === 'phone' || s === 'tablet' || s === 'desktop'
  )
  const toggle = (surface: Surface) => {
    const next = current.includes(surface) ? current.filter((s) => s !== surface) : [...current, surface]
    // Absent rather than an empty array for the common case, so a widget that is never hidden
    // carries no key at all.
    updateWidgetConfig(widget.id, field.key, next.length > 0 ? next : undefined)
  }
  const labels: [Surface, string][] = [
    ['phone', 'Phones'],
    ['tablet', 'Tablets'],
    ['desktop', 'Desktops']
  ]
  return (
    <div className="nh-field">
      <span className="nh-field__label">{t(field.label)}</span>
      <div className="nh-hideon">
        {labels.map(([surface, label]) => (
          <button
            key={surface}
            type="button"
            className={'nh-chip' + (current.includes(surface) ? ' nh-chip--on' : '')}
            aria-pressed={current.includes(surface)}
            onClick={() => toggle(surface)}>
            {t(label)}
          </button>
        ))}
      </div>
    </div>
  )
}

/**
 * Any number of the options, as toggle chips - the same control as the hide-on row above, which
 * asks the same kind of question.
 *
 * With nothing stored the field shows the widget's own default set, because an empty row beside a
 * chart already drawing eight chips reads as a bug. The first toggle writes a real list (empty
 * included, which is a deliberate "none"), so a later change to the built-in default cannot move
 * a chart somebody has already tuned.
 */
function MultiSelectField({
  field,
  widget,
  value
}: {
  field: Extract<SettingField, { type: 'multiselect' }>
  widget: WidgetInstance
  value: unknown
}) {
  const { t } = useTranslation()
  const current = Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : (field.defaultValue ?? [])
  const toggle = (option: string) => {
    const picked = new Set(current)
    if (!picked.delete(option)) picked.add(option)
    // Stored in the schema's own order, so the value reads the way the row does.
    updateWidgetConfig(
      widget.id,
      field.key,
      field.options.map((o) => o.value).filter((v) => picked.has(v))
    )
  }
  return (
    <div className="nh-field">
      <span className="nh-field__label">{t(field.label)}</span>
      <div className="nh-multisel">
        {field.options.map((o) => (
          <button
            key={o.value}
            type="button"
            className={'nh-chip' + (current.includes(o.value) ? ' nh-chip--on' : '')}
            aria-pressed={current.includes(o.value)}
            onClick={() => toggle(o.value)}>
            {t(o.label)}
          </button>
        ))}
      </div>
    </div>
  )
}

/** Settings declared by a custom widget definition, writing into the instance's config map. */
function CustomWidgetFields({ widget, defId }: { widget: WidgetInstance; defId: string }) {
  const { t } = useTranslation()
  const def = useConfigStore((s) => s.widgetDefs.find((d) => d.id === defId))
  if (!def) {
    return <p className="nh-settings__text">{t('Custom widget “{{id}}” was not found on this server.', { id: defId })}</p>
  }
  const schema = defSettings(def)
  if (schema.length === 0) {
    return <p className="nh-settings__text">{t('“{{name}}” has no settings.', { name: def.name })}</p>
  }
  const values = mergedSettingValues(def, (widget.config.config as Record<string, unknown>) ?? {})
  const setValue = (id: string, v: unknown) =>
    updateWidgetConfig(widget.id, 'config', { ...((widget.config.config as Record<string, unknown>) ?? {}), [id]: v })

  return (
    <>
      <h3 className="nh-form__section">{t('“{{name}}” settings', { name: def.name })}</h3>
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
/** A colour a `<input type="color">` can show, or null when it cannot be read at all. */
function toHex(value: string): string | null {
  const rgb = parseColor(value)
  if (!rgb) return null
  const two = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n)))
      .toString(16)
      .padStart(2, '0')
  return '#' + two(rgb.r) + two(rgb.g) + two(rgb.b)
}

function numberValue(value: unknown): number | '' {
  if (typeof value === 'number') return Number.isFinite(value) ? value : ''
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value)
    if (Number.isFinite(n)) return n
  }
  return ''
}

function CustomField({ setting, value, onChange }: { setting: WidgetDefSetting; value: unknown; onChange: (v: unknown) => void }) {
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
  const { t } = useTranslation()
  // An address this page will LOAD, typed as http:// while the page itself is https. The browser
  // blocks that outright and says nothing a person can act on, so the widget draws an empty frame
  // or a dead stream. Saying it here means it is answered while the address is being typed rather
  // than puzzled over afterwards. `subresource` is declared per field: a navigate target opens in
  // a new tab, which is allowed, and warning about it would be wrong.
  const mixed = props.field.type === 'text' && props.field.subresource === true && mixedContent(String(props.value ?? ''))
  return (
    <>
      <FieldInput {...props} />
      {props.field.hint ? <p className="nh-field__hint">{t(props.field.hint)}</p> : null}
      {mixed ? (
        <p className="nh-field__warn">
          {t('This page is served over HTTPS, so an insecure http:// address will not load. Use https:// here, or open neohab over http.')}
        </p>
      ) : null}
    </>
  )
}

/**
 * Schema labels, hints, option labels and placeholders are authored in English in each
 * widget's `settings[]` and translated here at render time, so definitions stay plain data
 * and adding a widget needs no i18n plumbing.
 */
function FieldInput({ field, widget, value }: { field: SettingField; widget: WidgetInstance; value: unknown }) {
  const { t } = useTranslation()
  const set = (v: unknown) => updateWidgetConfig(widget.id, field.key, v)
  const id = `f-${widget.id}-${field.key}`

  switch (field.type) {
    case 'boolean':
      return (
        <label className="nh-field nh-field--row" htmlFor={id}>
          <span className="nh-field__label">{t(field.label)}</span>
          <input id={id} type="checkbox" checked={value === true} onChange={(e) => set(e.target.checked)} />
        </label>
      )
    case 'number':
      // Through NumberSetting, like every other numeric field in the app. Written directly, this
      // one committed on each keystroke: typing 150 into the min-50 text size stored 1, then 15,
      // then 150, and clicking away halfway left 1 behind. Every reader clamps, so it rendered
      // correctly - but an out-of-range value in storage is one every reader then has to guard,
      // and the live preview jumped about while it was being typed. `live` because this edits the
      // local draft, where previewing is the point and costs no write.
      return (
        <NumberSetting
          id={id}
          className="nh-field"
          label={<span className="nh-field__label">{t(field.label)}</span>}
          value={numberValue(value)}
          min={field.min ?? Number.MIN_SAFE_INTEGER}
          max={field.max ?? Number.MAX_SAFE_INTEGER}
          step={field.step}
          mode="live"
          onCommit={(n) => set(n)}
          onClear={() => set(undefined)}
        />
      )
    case 'select': {
      const current = typeof value === 'string' ? value : ''
      // Ungrouped options first, in their declared order, then one <optgroup> per group in the
      // order the groups first appear. A 419-entry list is unusable without them.
      const loose = field.options.filter((o) => !o.group)
      const groups: string[] = []
      for (const o of field.options) if (o.group && !groups.includes(o.group)) groups.push(o.group)
      return (
        <label className="nh-field" htmlFor={id}>
          <span className="nh-field__label">{t(field.label)}</span>
          <select id={id} value={current} onChange={(e) => set(e.target.value === '' ? undefined : e.target.value)}>
            {/* placeholder row only when nothing (not even a default) resolves */}
            {field.options.some((o) => o.value === current) ? null : <option value={current} />}
            {loose.map((o) => (
              <option key={o.value} value={o.value}>
                {t(o.label)}
              </option>
            ))}
            {groups.map((g) => (
              <optgroup key={g} label={g}>
                {field.options
                  .filter((o) => o.group === g)
                  .map((o) => (
                    /* Not translated: see SettingField. These are environment names, not UI copy. */
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
              </optgroup>
            ))}
          </select>
        </label>
      )
    }
    case 'color': {
      const hasValue = typeof value === 'string' && value !== ''
      return (
        <label className="nh-field nh-field--row" htmlFor={id}>
          <span className="nh-field__label">{t(field.label)}</span>
          <span className="nh-colorfield">
            {hasValue ? (
              <button type="button" className="nh-colorfield__clear" onClick={() => set(undefined)}>
                {t('Auto')}
              </button>
            ) : (
              <span className="nh-colorfield__hint">{t('theme')}</span>
            )}
            {/* `<input type="color">` accepts only `#rrggbb` and shows black for anything else,
                so an imported HABPanel colour like `rgb(1,2,3)` or `#f80` previewed as black
                although the dashboard drew it correctly - and touching the swatch then silently
                rewrote it to that black. `parseColor` reads the hex and rgb() forms; a named
                colour it cannot read falls back to the neutral placeholder, which at least does
                not claim to be the stored value. */}
            <input
              id={id}
              type="color"
              value={(hasValue ? toHex(value as string) : null) ?? '#888888'}
              onChange={(e) => set(e.target.value)}
            />
          </span>
        </label>
      )
    }
    case 'multiline':
      return (
        <label className="nh-field" htmlFor={id}>
          <span className="nh-field__label">{t(field.label)}</span>
          <textarea
            id={id}
            rows={4}
            value={typeof value === 'string' ? value : ''}
            placeholder={translatablePlaceholder(field.placeholder, t)}
            onChange={(e) => set(e.target.value)}
          />
        </label>
      )
    case 'item':
      return (
        <div className="nh-field">
          <label className="nh-field__label" htmlFor={id}>
            {t(field.label)}
          </label>
          <ItemPicker
            id={id}
            value={typeof value === 'string' ? value : ''}
            itemTypes={field.itemTypes}
            onChange={(name) => bindItem(widget, field.key, name)}
          />
        </div>
      )
    case 'icon':
      return (
        <div className="nh-field">
          <label className="nh-field__label" htmlFor={id}>
            {t(field.label)}
          </label>
          <IconPicker id={id} value={typeof value === 'string' ? value : ''} onChange={set} />
        </div>
      )
    case 'chartseries':
      return <ChartSeriesField widget={widget} />
    case 'chartthresholds':
      return <ChartThresholdsField widget={widget} />
    case 'stateicons':
      return <StateIconsField widget={widget} />
    case 'statecolors':
      return <StateColorsField widget={widget} />
    case 'timelineseries':
      return <TimelineSeriesField widget={widget} />
    case 'gaugeseverity':
      return <GaugeSeverityField widget={widget} field={field} />
    case 'gaugemarkers':
      return <GaugeMarkersField widget={widget} />
    case 'gaugezones':
      return <GaugeZonesField widget={widget} />
    case 'camerastream':
      return <CameraStreamField field={field} widget={widget} value={value} />
    case 'planimage':
      return <PlanImageField field={field} widget={widget} value={value} />
    case 'planlights':
      return <PlanLightsField field={field} widget={widget} />
    case 'clockzones':
      return <ClockZonesField field={field} widget={widget} />
    case 'timezone':
      return <TimeZoneField field={field} widget={widget} value={value} />
    case 'weatherlocation':
      return <WeatherLocationField field={field} widget={widget} value={value} />
    case 'itempattern':
      return <ItemPatternField field={field} widget={widget} value={value} />
    case 'dashboard':
      return <DashboardField field={field} widget={widget} value={value} />
    case 'hideon':
      return <HideOnField field={field} widget={widget} value={value} />
    case 'multiselect':
      return <MultiSelectField field={field} widget={widget} value={value} />
    default:
      return (
        <label className="nh-field" htmlFor={id}>
          <span className="nh-field__label">{t(field.label)}</span>
          <input
            id={id}
            type="text"
            value={typeof value === 'string' ? value : ''}
            placeholder={translatablePlaceholder('placeholder' in field ? field.placeholder : undefined, t)}
            onChange={(e) => set(e.target.value)}
          />
        </label>
      )
  }
}

/**
 * Bind an item, and name the widget after it when it has no name yet.
 *
 * A widget added from the palette carries no Name, so a switch bound to `kitchen_lights` and
 * saved reads as a bare "OFF" on the dashboard - the first tile most people make, and it says
 * nothing about what it controls. The item's own label is what the person just picked out of a
 * list, so it is the name they meant; typing over it afterwards is one edit either way.
 *
 * Deliberately narrow. Only the conventional primary key ('item'), never a widget's second or
 * third item (a thermostat's fan is not what the tile is called), only when the widget really has
 * a Name field, and only while that field is empty - so it never overwrites a name, and clearing
 * the item leaves the name alone. Both keys land in one change, so one undo puts both back.
 */
function bindItem(widget: WidgetInstance, key: string, itemName: string): void {
  const def = getWidgetDefinition(widget.type)
  const named = def?.settings.some((f) => f.key === 'label' && f.type === 'text')
  const hasName = String((widget.config.label as string) ?? '').trim() !== ''
  if (key !== 'item' || !named || hasName || !itemName) {
    updateWidgetConfig(widget.id, key, itemName)
    return
  }
  const label = useCatalogStore
    .getState()
    .items.find((i) => i.name === itemName)
    ?.label?.trim()
  if (!label) {
    updateWidgetConfig(widget.id, key, itemName)
    return
  }
  updateWidgetConfigs(widget.id, { [key]: itemName, label })
}

/**
 * Dashboard picker: a select over the dashboards that actually exist. A stored id that no
 * longer resolves stays visible as its raw id rather than being silently dropped.
 */
function DashboardField({
  field,
  widget,
  value
}: {
  field: Extract<SettingField, { type: 'dashboard' }>
  widget: WidgetInstance
  value: unknown
}) {
  const { t } = useTranslation()
  const dashboards = useConfigStore((s) => s.dashboards)
  const current = typeof value === 'string' ? value : ''
  const id = `f-${widget.id}-${field.key}`
  return (
    <label className="nh-field" htmlFor={id}>
      <span className="nh-field__label">{t(field.label)}</span>
      <select id={id} value={current} onChange={(e) => updateWidgetConfig(widget.id, field.key, e.target.value || undefined)}>
        <option value="">{t('None')}</option>
        {current && !dashboards.some((d) => d.id === current) ? <option value={current}>{current}</option> : null}
        {dashboards.map((d) => (
          <option key={d.id} value={d.id}>
            {d.name}
          </option>
        ))}
      </select>
    </label>
  )
}

/**
 * Schema placeholders that are syntax examples (template snippets with {{ }}, command lists)
 * must not go through i18next - it would treat the braces as interpolation and eat them.
 */
function translatablePlaceholder(placeholder: string | undefined, t: (k: string) => string): string | undefined {
  if (!placeholder) return undefined
  if (placeholder.includes('{{') || placeholder.includes('=')) return placeholder
  return t(placeholder)
}
