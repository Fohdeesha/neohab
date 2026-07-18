/**
 * Chart-specific settings editors: the series list and the thresholds list. Registered as
 * SettingField types 'chartseries'/'chartthresholds' and rendered by SettingsPanel.
 */
import { ItemPicker } from '../components/ItemPicker'
import type { WidgetInstance } from '../model/dashboard'
import { updateWidgetConfig } from '../store/editor'
import {
  effectiveSeries,
  type ChartConfig,
  type ChartSeries,
  type ChartThreshold,
} from '../widgets/chart/model'
import { chartScheme, seriesColor } from '../widgets/chart/palette'

const CHART_ITEM_TYPES = ['Number', 'Dimmer', 'Switch', 'Contact', 'Rollershutter']

export function ChartSeriesField({ widget }: { widget: WidgetInstance }) {
  // Show the RAW stored list - a just-added row has an empty item and must stay editable,
  // so this can't go through effectiveSeries (the renderer filters empty rows, not the form).
  // A legacy single-`item` config shows up as its implied series; any change writes `series`.
  const raw = Array.isArray(widget.config.series) ? (widget.config.series as ChartSeries[]) : []
  const rows = raw.length > 0 ? raw : effectiveSeries(widget.config as ChartConfig)
  const scheme = chartScheme()
  const write = (next: ChartSeries[]) => updateWidgetConfig(widget.id, 'series', next)
  const patch = (i: number, p: Partial<ChartSeries>) =>
    write(rows.map((r, j) => (j === i ? { ...r, ...p } : r)))
  const move = (i: number, d: number) => {
    const next = [...rows]
    const [r] = next.splice(i, 1)
    next.splice(i + d, 0, r)
    write(next)
  }

  return (
    <div className="nh-field">
      <span className="nh-field__label">Series</span>
      {rows.map((s, i) => (
        <div className="nh-chartcard" key={i}>
          <div className="nh-chartcard__head">
            <span className="nh-chart__dot" style={{ background: s.color || seriesColor(i, scheme) }} />
            <span className="nh-chartcard__title">Series {i + 1}</span>
            <button
              type="button"
              className="nh-chartcard__btn"
              aria-label={`Move series ${i + 1} up`}
              disabled={i === 0}
              onClick={() => move(i, -1)}
            >
              ↑
            </button>
            <button
              type="button"
              className="nh-chartcard__btn"
              aria-label={`Move series ${i + 1} down`}
              disabled={i === rows.length - 1}
              onClick={() => move(i, 1)}
            >
              ↓
            </button>
            <button
              type="button"
              className="nh-chartcard__btn"
              aria-label={`Remove series ${i + 1}`}
              onClick={() => write(rows.filter((_, j) => j !== i))}
            >
              ✕
            </button>
          </div>
          <ItemPicker
            id={`f-${widget.id}-series-${i}`}
            value={s.item}
            itemTypes={CHART_ITEM_TYPES}
            onChange={(v) => patch(i, { item: v })}
          />
          <input
            type="text"
            placeholder="Label (optional)"
            value={s.label ?? ''}
            onChange={(e) => patch(i, { label: e.target.value || undefined })}
          />
          <div className="nh-chartcard__row">
            <label className="nh-chartcard__cell">
              <span>Color</span>
              <span className="nh-colorfield">
                {s.color ? (
                  <button type="button" className="nh-colorfield__clear" onClick={() => patch(i, { color: undefined })}>
                    Auto
                  </button>
                ) : (
                  <span className="nh-colorfield__hint">auto</span>
                )}
                <input
                  type="color"
                  value={/^#[0-9a-f]{6}$/i.test(s.color ?? '') ? (s.color as string) : seriesColor(i, scheme)}
                  onChange={(e) => patch(i, { color: e.target.value })}
                />
              </span>
            </label>
            <label className="nh-chartcard__cell">
              <span>Axis</span>
              <select
                value={s.axis === 'y2' ? 'y2' : 'y'}
                onChange={(e) => patch(i, { axis: e.target.value === 'y2' ? 'y2' : undefined })}
              >
                <option value="y">Left</option>
                <option value="y2">Right</option>
              </select>
            </label>
            <label className="nh-chartcard__cell">
              <span>Style</span>
              <select
                value={s.mode ?? 'smooth'}
                onChange={(e) =>
                  patch(i, { mode: e.target.value === 'smooth' ? undefined : (e.target.value as ChartSeries['mode']) })
                }
              >
                <option value="smooth">Smooth</option>
                <option value="linear">Linear</option>
                <option value="step">Step</option>
              </select>
            </label>
          </div>
          <div className="nh-chartcard__row">
            <label className="nh-chartcard__cell">
              <span>Line width</span>
              <input
                type="number"
                min={0}
                max={8}
                step={0.5}
                value={s.width ?? 2}
                onChange={(e) => patch(i, { width: e.target.value === '' ? undefined : Number(e.target.value) })}
              />
            </label>
            <label className="nh-chartcard__cell">
              <span>Fill %</span>
              <input
                type="number"
                min={0}
                max={100}
                step={5}
                value={s.fill ?? 20}
                onChange={(e) => patch(i, { fill: e.target.value === '' ? undefined : Number(e.target.value) })}
              />
            </label>
            <label className="nh-chartcard__cell nh-chartcard__cell--check">
              <span>Points</span>
              <input
                type="checkbox"
                checked={s.points === true}
                onChange={(e) => patch(i, { points: e.target.checked || undefined })}
              />
            </label>
          </div>
        </div>
      ))}
      <button type="button" className="nh-btn" onClick={() => write([...rows, { item: '' }])}>
        Add series
      </button>
    </div>
  )
}

export function ChartThresholdsField({ widget }: { widget: WidgetInstance }) {
  const rows = Array.isArray(widget.config.thresholds)
    ? (widget.config.thresholds as ChartThreshold[])
    : []
  const write = (next: ChartThreshold[]) => updateWidgetConfig(widget.id, 'thresholds', next)
  const patch = (i: number, p: Partial<ChartThreshold>) =>
    write(rows.map((r, j) => (j === i ? { ...r, ...p } : r)))
  const numField = (i: number, key: 'from' | 'to', value: number | undefined) => (
    <label className="nh-chartcard__cell">
      <span>{key === 'from' ? 'From' : 'To (band)'}</span>
      <input
        type="number"
        value={typeof value === 'number' ? value : ''}
        onChange={(e) => patch(i, { [key]: e.target.value === '' ? undefined : Number(e.target.value) })}
      />
    </label>
  )

  return (
    <div className="nh-field">
      <span className="nh-field__label">Thresholds</span>
      {rows.map((t, i) => (
        <div className="nh-chartcard" key={i}>
          <div className="nh-chartcard__head">
            <span className="nh-chart__dot" style={{ background: t.color || '#d03b3b' }} />
            <span className="nh-chartcard__title">Threshold {i + 1}</span>
            <button
              type="button"
              className="nh-chartcard__btn"
              aria-label={`Remove threshold ${i + 1}`}
              onClick={() => write(rows.filter((_, j) => j !== i))}
            >
              ✕
            </button>
          </div>
          <div className="nh-chartcard__row">
            {numField(i, 'from', typeof t.from === 'number' ? t.from : undefined)}
            {numField(i, 'to', typeof t.to === 'number' ? t.to : undefined)}
            <label className="nh-chartcard__cell">
              <span>Color</span>
              <input
                type="color"
                value={/^#[0-9a-f]{6}$/i.test(t.color ?? '') ? (t.color as string) : '#d03b3b'}
                onChange={(e) => patch(i, { color: e.target.value })}
              />
            </label>
          </div>
          <div className="nh-chartcard__row">
            <label className="nh-chartcard__cell">
              <span>Label</span>
              <input
                type="text"
                value={t.label ?? ''}
                onChange={(e) => patch(i, { label: e.target.value || undefined })}
              />
            </label>
            <label className="nh-chartcard__cell">
              <span>Axis</span>
              <select
                value={t.axis === 'y2' ? 'y2' : 'y'}
                onChange={(e) => patch(i, { axis: e.target.value === 'y2' ? 'y2' : undefined })}
              >
                <option value="y">Left</option>
                <option value="y2">Right</option>
              </select>
            </label>
          </div>
        </div>
      ))}
      <button type="button" className="nh-btn" onClick={() => write([...rows, { from: undefined }])}>
        Add threshold
      </button>
    </div>
  )
}
