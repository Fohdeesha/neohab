/**
 * Per-state list editors: icon rules (button/switch/value) and color maps (timeline).
 * Registered as SettingField types 'stateicons'/'statecolors' and rendered by SettingsPanel.
 */
import { useTranslation } from 'react-i18next'
import { IconPicker } from '../components/IconPicker'
import { ItemPicker } from '../components/ItemPicker'
import type { WidgetInstance } from '../model/dashboard'
import { updateWidgetConfig } from '../store/editor'
import type { StateIconRule } from '../widgets/common/stateIcon'
import type { TimelineColorMap, TimelineSeries } from '../widgets/timeline/model'

export function StateIconsField({ widget }: { widget: WidgetInstance }) {
  const { t } = useTranslation()
  const rows = Array.isArray(widget.config.stateIcons) ? (widget.config.stateIcons as StateIconRule[]) : []
  const write = (next: StateIconRule[]) => updateWidgetConfig(widget.id, 'stateIcons', next.length > 0 ? next : undefined)
  const patch = (i: number, p: Partial<StateIconRule>) => write(rows.map((r, j) => (j === i ? { ...r, ...p } : r)))

  return (
    <div className="nh-field">
      <span className="nh-field__label">{t('Per-state icons')}</span>
      {rows.map((r, i) => (
        <div className="nh-chartcard" key={i}>
          <div className="nh-chartcard__head">
            <span className="nh-chartcard__title">{t('State {{n}}', { n: i + 1 })}</span>
            <button
              type="button"
              className="nh-chartcard__btn"
              aria-label={t('Remove state {{n}}', { n: i + 1 })}
              onClick={() => write(rows.filter((_, j) => j !== i))}
            >
              ✕
            </button>
          </div>
          <input
            type="text"
            placeholder={t('State, or a range like 1-49')}
            value={r.state ?? ''}
            onChange={(e) => patch(i, { state: e.target.value })}
          />
          <IconPicker
            id={`f-${widget.id}-stateicon-${i}`}
            value={r.icon ?? ''}
            onChange={(v) => patch(i, { icon: v || undefined })}
          />
          <div className="nh-chartcard__row">
            <label className="nh-chartcard__cell">
              <span>{t('Tint (mono icons)')}</span>
              <span className="nh-colorfield">
                {r.color ? (
                  <button type="button" className="nh-colorfield__clear" onClick={() => patch(i, { color: undefined })}>
                    {t('Auto')}
                  </button>
                ) : (
                  <span className="nh-colorfield__hint">{t('theme')}</span>
                )}
                <input
                  type="color"
                  value={/^#[0-9a-f]{6}$/i.test(r.color ?? '') ? (r.color as string) : '#888888'}
                  onChange={(e) => patch(i, { color: e.target.value })}
                />
              </span>
            </label>
          </div>
        </div>
      ))}
      <button type="button" className="nh-btn" onClick={() => write([...rows, { state: '' }])}>
        {t('Add state icon')}
      </button>
      {rows.length > 0 ? (
        <span className="nh-field__hint">
          {t('The first matching state wins; states match exactly, or as a numeric range like 1-49.')}
        </span>
      ) : null}
    </div>
  )
}

export function TimelineSeriesField({ widget }: { widget: WidgetInstance }) {
  const { t } = useTranslation()
  const rows = Array.isArray(widget.config.series) ? (widget.config.series as TimelineSeries[]) : []
  const write = (next: TimelineSeries[]) => updateWidgetConfig(widget.id, 'series', next)
  const patch = (i: number, p: Partial<TimelineSeries>) => write(rows.map((r, j) => (j === i ? { ...r, ...p } : r)))
  const move = (i: number, d: number) => {
    const next = [...rows]
    const [r] = next.splice(i, 1)
    next.splice(i + d, 0, r)
    write(next)
  }

  return (
    <div className="nh-field">
      <span className="nh-field__label">{t('Items')}</span>
      {rows.map((s, i) => (
        <div className="nh-chartcard" key={i}>
          <div className="nh-chartcard__head">
            <span className="nh-chartcard__title">{t('Row {{n}}', { n: i + 1 })}</span>
            <button
              type="button"
              className="nh-chartcard__btn"
              aria-label={t('Move row {{n}} up', { n: i + 1 })}
              disabled={i === 0}
              onClick={() => move(i, -1)}
            >
              ↑
            </button>
            <button
              type="button"
              className="nh-chartcard__btn"
              aria-label={t('Move row {{n}} down', { n: i + 1 })}
              disabled={i === rows.length - 1}
              onClick={() => move(i, 1)}
            >
              ↓
            </button>
            <button
              type="button"
              className="nh-chartcard__btn"
              aria-label={t('Remove row {{n}}', { n: i + 1 })}
              onClick={() => write(rows.filter((_, j) => j !== i))}
            >
              ✕
            </button>
          </div>
          <ItemPicker
            id={`f-${widget.id}-tlrow-${i}`}
            value={s.item}
            onChange={(v) => patch(i, { item: v })}
          />
          <input
            type="text"
            placeholder={t('Label (optional)')}
            value={s.label ?? ''}
            onChange={(e) => patch(i, { label: e.target.value || undefined })}
          />
        </div>
      ))}
      <button type="button" className="nh-btn" onClick={() => write([...rows, { item: '' }])}>
        {t('Add item')}
      </button>
    </div>
  )
}

export function StateColorsField({ widget }: { widget: WidgetInstance }) {
  const { t } = useTranslation()
  const rows = Array.isArray(widget.config.colorMaps) ? (widget.config.colorMaps as TimelineColorMap[]) : []
  const write = (next: TimelineColorMap[]) =>
    updateWidgetConfig(widget.id, 'colorMaps', next.length > 0 ? next : undefined)
  const patch = (i: number, p: Partial<TimelineColorMap>) => write(rows.map((r, j) => (j === i ? { ...r, ...p } : r)))

  return (
    <div className="nh-field">
      <span className="nh-field__label">{t('State colors')}</span>
      {rows.map((r, i) => (
        <div className="nh-chartcard" key={i}>
          <div className="nh-chartcard__row">
            <label className="nh-chartcard__cell">
              <span>{t('State')}</span>
              <input type="text" value={r.state ?? ''} onChange={(e) => patch(i, { state: e.target.value })} />
            </label>
            <label className="nh-chartcard__cell">
              <span>{t('Color')}</span>
              <input
                type="color"
                value={/^#[0-9a-f]{6}$/i.test(r.color ?? '') ? r.color : '#888888'}
                onChange={(e) => patch(i, { color: e.target.value })}
              />
            </label>
            <button
              type="button"
              className="nh-chartcard__btn"
              aria-label={t('Remove state {{n}}', { n: i + 1 })}
              onClick={() => write(rows.filter((_, j) => j !== i))}
            >
              ✕
            </button>
          </div>
        </div>
      ))}
      <button type="button" className="nh-btn" onClick={() => write([...rows, { state: '', color: '#888888' }])}>
        {t('Add state color')}
      </button>
      <span className="nh-field__hint">
        {t('States without an explicit color get one from the chart palette automatically.')}
      </span>
    </div>
  )
}
