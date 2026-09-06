import { useTranslation } from 'react-i18next'
import { ItemPicker } from '../components/ItemPicker'
import type { WidgetInstance } from '../model/dashboard'
import { updateWidgetConfig } from '../store/editor'
import type { SettingField } from '../widgets/types'
import type { GaugeMarker, GaugeZone, SeverityStop } from '../widgets/dial/gauge'

const MARKER_ITEM_TYPES = ['Number', 'Dimmer']

export function GaugeSeverityField({ widget, field }: { widget: WidgetInstance; field: SettingField }) {
  const { t } = useTranslation()
  const rows = Array.isArray(widget.config[field.key]) ? (widget.config[field.key] as SeverityStop[]) : []
  const write = (next: SeverityStop[]) => updateWidgetConfig(widget.id, field.key, next)
  const patch = (i: number, p: Partial<SeverityStop>) => write(rows.map((r, j) => (j === i ? { ...r, ...p } : r)))

  return (
    <div className="nh-field">
      <span className="nh-field__label">{t(field.label)}</span>
      {rows.map((s, i) => (
        <div className="nh-chartcard" key={i}>
          <div className="nh-chartcard__head">
            <span className="nh-chart__dot" style={{ background: s.color || '#4caf50' }} />
            <span className="nh-chartcard__title">{t('Stop {{n}}', { n: i + 1 })}</span>
            <button
              type="button"
              className="nh-chartcard__btn"
              aria-label={t('Remove stop {{n}}', { n: i + 1 })}
              onClick={() => write(rows.filter((_, j) => j !== i))}>
              ✕
            </button>
          </div>
          <div className="nh-chartcard__row">
            <label className="nh-chartcard__cell">
              <span>{t('Up to value')}</span>
              <input
                type="number"
                value={typeof s.value === 'number' ? s.value : ''}
                onChange={(e) => patch(i, { value: e.target.value === '' ? undefined : Number(e.target.value) })}
              />
            </label>
            <label className="nh-chartcard__cell">
              <span>{t('Color')}</span>
              <input
                type="color"
                value={/^#[0-9a-f]{6}$/i.test(s.color ?? '') ? (s.color as string) : '#4caf50'}
                onChange={(e) => patch(i, { color: e.target.value })}
              />
            </label>
          </div>
        </div>
      ))}
      <button type="button" className="nh-btn" onClick={() => write([...rows, { color: '#4caf50' }])}>
        {t('Add color stop')}
      </button>
      <span className="nh-field__hint">
        {t('The LEDs and glow take the color of the first stop at or above the value; with no stops they follow the theme.')}
      </span>
    </div>
  )
}

export function GaugeMarkersField({ widget }: { widget: WidgetInstance }) {
  const { t } = useTranslation()
  const rows = Array.isArray(widget.config.markers) ? (widget.config.markers as GaugeMarker[]) : []
  const write = (next: GaugeMarker[]) => updateWidgetConfig(widget.id, 'markers', next)
  const patch = (i: number, p: Partial<GaugeMarker>) => write(rows.map((r, j) => (j === i ? { ...r, ...p } : r)))

  return (
    <div className="nh-field">
      <span className="nh-field__label">{t('Markers')}</span>
      {rows.map((m, i) => (
        <div className="nh-chartcard" key={i}>
          <div className="nh-chartcard__head">
            <span className="nh-chart__dot" style={{ background: m.color || '#ffffff' }} />
            <span className="nh-chartcard__title">{t('Marker {{n}}', { n: i + 1 })}</span>
            <button
              type="button"
              className="nh-chartcard__btn"
              aria-label={t('Remove marker {{n}}', { n: i + 1 })}
              onClick={() => write(rows.filter((_, j) => j !== i))}>
              ✕
            </button>
          </div>
          <div className="nh-chartcard__row">
            <label className="nh-chartcard__cell">
              <span>{t('At value')}</span>
              <input
                type="number"
                value={typeof m.value === 'number' ? m.value : ''}
                onChange={(e) => patch(i, { value: e.target.value === '' ? undefined : Number(e.target.value) })}
              />
            </label>
            <label className="nh-chartcard__cell">
              <span>{t('Color')}</span>
              <input
                type="color"
                value={/^#[0-9a-f]{6}$/i.test(m.color ?? '') ? (m.color as string) : '#ffffff'}
                onChange={(e) => patch(i, { color: e.target.value })}
              />
            </label>
          </div>
          <ItemPicker
            id={`f-${widget.id}-marker-${i}`}
            value={m.item ?? ''}
            itemTypes={MARKER_ITEM_TYPES}
            onChange={(v) => patch(i, { item: v || undefined })}
          />
          <span className="nh-chartcard__hint">{t('With an item, the marker follows its live value instead.')}</span>
          <input
            type="text"
            placeholder={t('Label (optional)')}
            value={m.label ?? ''}
            onChange={(e) => patch(i, { label: e.target.value || undefined })}
          />
        </div>
      ))}
      <button type="button" className="nh-btn" onClick={() => write([...rows, {}])}>
        {t('Add marker')}
      </button>
    </div>
  )
}

export function GaugeZonesField({ widget }: { widget: WidgetInstance }) {
  const { t } = useTranslation()
  const rows = Array.isArray(widget.config.zones) ? (widget.config.zones as GaugeZone[]) : []
  const write = (next: GaugeZone[]) => updateWidgetConfig(widget.id, 'zones', next)
  const patch = (i: number, p: Partial<GaugeZone>) => write(rows.map((r, j) => (j === i ? { ...r, ...p } : r)))

  return (
    <div className="nh-field">
      <span className="nh-field__label">{t('Zones')}</span>
      {rows.map((z, i) => (
        <div className="nh-chartcard" key={i}>
          <div className="nh-chartcard__head">
            <span className="nh-chart__dot" style={{ background: z.color || '#d03b3b' }} />
            <span className="nh-chartcard__title">{t('Zone {{n}}', { n: i + 1 })}</span>
            <button
              type="button"
              className="nh-chartcard__btn"
              aria-label={t('Remove zone {{n}}', { n: i + 1 })}
              onClick={() => write(rows.filter((_, j) => j !== i))}>
              ✕
            </button>
          </div>
          <div className="nh-chartcard__row">
            <label className="nh-chartcard__cell">
              <span>{t('From')}</span>
              <input
                type="number"
                value={typeof z.from === 'number' ? z.from : ''}
                onChange={(e) => patch(i, { from: e.target.value === '' ? undefined : Number(e.target.value) })}
              />
            </label>
            <label className="nh-chartcard__cell">
              <span>{t('To')}</span>
              <input
                type="number"
                value={typeof z.to === 'number' ? z.to : ''}
                onChange={(e) => patch(i, { to: e.target.value === '' ? undefined : Number(e.target.value) })}
              />
            </label>
            <label className="nh-chartcard__cell">
              <span>{t('Color')}</span>
              <input
                type="color"
                value={/^#[0-9a-f]{6}$/i.test(z.color ?? '') ? (z.color as string) : '#d03b3b'}
                onChange={(e) => patch(i, { color: e.target.value })}
              />
            </label>
          </div>
        </div>
      ))}
      <button type="button" className="nh-btn" onClick={() => write([...rows, {}])}>
        {t('Add zone')}
      </button>
    </div>
  )
}
