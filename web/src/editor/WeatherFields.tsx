import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { SettingField } from '../widgets/types'
import type { WidgetInstance } from '../model/dashboard'
import { updateWidgetConfig } from '../store/editor'
import { ensureCatalog, useCatalogStore } from '../store/catalog'
import { clampInt, locationOf, patternItems } from '../widgets/weather/model'
import { searchLocations, type GeoPlace } from '../widgets/weather/openmeteo'

export function WeatherLocationField({ field, widget, value }: { field: SettingField; widget: WidgetInstance; value: unknown }) {
  const { t, i18n } = useTranslation()
  const [query, setQuery] = useState('')
  const [found, setFound] = useState<GeoPlace[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const id = `f-${widget.id}-${field.key}`

  const loc = locationOf(value)
  const raw = typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {}

  const set = (patch: Record<string, unknown>) => {
    updateWidgetConfig(widget.id, field.key, { ...raw, ...patch })
  }

  const search = async () => {
    const q = query.trim()
    if (q === '') return
    setBusy(true)
    setError(null)
    try {
      const places = await searchLocations(q, i18n.language || 'en')
      setFound(places)
      if (places.length === 0) setError(t('No places found for that search.'))
    } catch {
      setFound(null)
      setError(t('The place search is unreachable from this device. Type the coordinates below instead.'))
    } finally {
      setBusy(false)
    }
  }

  const num = (v: unknown): number | '' => (typeof v === 'number' && Number.isFinite(v) ? v : '')

  return (
    <div className="nh-field">
      <label className="nh-field__label" htmlFor={id}>
        {t(field.label)}
      </label>
      <div className="nh-camerafield">
        <input
          id={id}
          type="text"
          value={query}
          placeholder={t('Search for a place…')}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              void search()
            }
          }}
        />
        <button type="button" className="nh-camerafield__find" onClick={() => void search()} disabled={busy}>
          {busy ? t('Searching…') : t('Search')}
        </button>
      </div>
      {found && found.length > 0 ? (
        <div className="nh-camerafield__list">
          {found.map((p) => (
            <button
              key={p.label + p.lat + ',' + p.lon}
              type="button"
              className={'nh-camerafield__pick' + (loc && loc.lat === p.lat && loc.lon === p.lon ? ' nh-camerafield__pick--on' : '')}
              onClick={() => {
                updateWidgetConfig(widget.id, field.key, { name: p.label, lat: p.lat, lon: p.lon })
                setFound(null)
                setQuery('')
              }}>
              {p.label}
            </button>
          ))}
        </div>
      ) : null}
      {error ? <p className="nh-field__hint">{error}</p> : null}
      {loc?.name ? <p className="nh-weatherloc__current">{loc.name}</p> : null}
      <div className="nh-weatherloc__coords">
        <label className="nh-weatherloc__coord">
          <span>{t('Latitude')}</span>
          <input
            type="number"
            step="0.0001"
            min={-90}
            max={90}
            value={num(raw.lat)}
            onChange={(e) => set({ lat: e.target.value === '' ? undefined : Number(e.target.value) })}
          />
        </label>
        <label className="nh-weatherloc__coord">
          <span>{t('Longitude')}</span>
          <input
            type="number"
            step="0.0001"
            min={-180}
            max={180}
            value={num(raw.lon)}
            onChange={(e) => set({ lon: e.target.value === '' ? undefined : Number(e.target.value) })}
          />
        </label>
      </div>
    </div>
  )
}

export function ItemPatternField({
  field,
  widget,
  value
}: {
  field: Extract<SettingField, { type: 'itempattern' }>
  widget: WidgetInstance
  value: unknown
}) {
  const { t } = useTranslation()
  ensureCatalog()
  const items = useCatalogStore((s) => s.items)
  const loaded = useCatalogStore((s) => s.loaded)
  const id = `f-${widget.id}-${field.key}`

  const config = widget.config as Record<string, unknown>
  const days = clampInt(config.days, 1, 7, 5)
  const first = clampInt(config.dayFirstNumber, 0, 99, 1)
  const text = typeof value === 'string' ? value : ''

  let preview: string | null = null
  if (text.trim() !== '') {
    const names = patternItems(text, first, days)
    if (!names) {
      preview = t('The pattern needs {n} where the day number goes.')
    } else if (loaded) {
      const known = new Set(items.map((i) => i.name))
      const missing = names.filter((n) => !known.has(n))
      preview =
        missing.length === 0
          ? t('Every day resolves to an item.')
          : t('Found {{found}} of {{total}}. Missing: {{missing}}', {
              found: names.length - missing.length,
              total: names.length,
              missing: missing.slice(0, 3).join(', ') + (missing.length > 3 ? '…' : '')
            })
    }
  }

  return (
    <div className="nh-field">
      <label className="nh-field__label" htmlFor={id}>
        {t(field.label)}
      </label>
      <input
        id={id}
        type="text"
        value={text}
        placeholder={field.placeholder}
        onChange={(e) => updateWidgetConfig(widget.id, field.key, e.target.value || undefined)}
      />
      {preview ? <p className="nh-field__hint">{preview}</p> : null}
    </div>
  )
}
