import { useTranslation } from 'react-i18next'
import type { WidgetInstance } from '../model/dashboard'
import { updateWidgetConfig } from '../store/editor'
import type { SettingField } from '../widgets/types'
import { zoneCity, zoneOptions, type ExtraZone } from '../widgets/clock/zones'

function ZoneSelect({
  id,
  value,
  placeholder,
  onChange
}: {
  id?: string
  value: string
  placeholder: string
  onChange: (zone: string) => void
}) {
  const options = zoneOptions()
  const groups: string[] = []
  for (const o of options) if (o.group && !groups.includes(o.group)) groups.push(o.group)
  return (
    <select className="nh-zoneselect" id={id} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{placeholder}</option>
      {groups.map((g) => (
        <optgroup key={g} label={g}>
          {options
            .filter((o) => o.group === g)
            .map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
        </optgroup>
      ))}
    </select>
  )
}

// built on first render, not at module load - as a plain select field these 419 options cost 45ms of every
// dashboard's boot
export function TimeZoneField({ widget, field, value }: { widget: WidgetInstance; field: SettingField; value: unknown }) {
  const { t } = useTranslation()
  const id = `f-${widget.id}-${field.key}`
  return (
    <label className="nh-field" htmlFor={id}>
      <span className="nh-field__label">{t(field.label)}</span>
      <ZoneSelect
        id={id}
        value={typeof value === 'string' ? value : ''}
        placeholder={t('This device')}
        onChange={(zone) => updateWidgetConfig(widget.id, field.key, zone === '' ? undefined : zone)}
      />
    </label>
  )
}

export function ClockZonesField({ widget, field }: { widget: WidgetInstance; field: SettingField }) {
  const { t } = useTranslation()
  const rows: ExtraZone[] = Array.isArray(widget.config[field.key])
    ? (widget.config[field.key] as ExtraZone[]).filter((r) => typeof r === 'object' && r !== null)
    : []
  const write = (next: ExtraZone[]) => updateWidgetConfig(widget.id, field.key, next)
  const patch = (i: number, p: Partial<ExtraZone>) => write(rows.map((r, j) => (j === i ? { ...r, ...p } : r)))

  return (
    <div className="nh-field">
      <span className="nh-field__label">{t(field.label)}</span>
      <p className="nh-field__hint">{t('Listed beside this clock when the tile is held.')}</p>
      {rows.map((row, i) => (
        <div className="nh-chartcard" key={i}>
          <div className="nh-chartcard__head">
            <span className="nh-chartcard__title">
              {typeof row.zone === 'string' && row.zone !== '' ? zoneCity(row.zone) : t('New zone')}
            </span>
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
              <span>{t('Time zone')}</span>
              <ZoneSelect
                value={typeof row.zone === 'string' ? row.zone : ''}
                placeholder={t('Choose a zone…')}
                onChange={(zone) => patch(i, { zone })}
              />
            </label>
            <label className="nh-chartcard__cell">
              <span>{t('Label')}</span>
              <input
                type="text"
                value={typeof row.label === 'string' ? row.label : ''}
                placeholder={typeof row.zone === 'string' && row.zone !== '' ? zoneCity(row.zone) : ''}
                onChange={(e) => patch(i, { label: e.target.value })}
              />
            </label>
          </div>
        </div>
      ))}
      <button type="button" className="nh-btn" onClick={() => write([...rows, { zone: '' }])}>
        {t('Add time zone')}
      </button>
    </div>
  )
}
