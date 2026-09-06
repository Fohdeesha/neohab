import { Icon } from '../../components/Icon'
import { ghostFor, isSegmentable } from '../common/format'
import { meteoIcon, type DayColumn, type HourColumn, type WeatherView } from './model'

export interface LookProps {
  view: WeatherView
  iconStyle: unknown
  t: (s: string) => string
  showHourly: boolean
  showDaily: boolean
  details: { feels: boolean; humidity: boolean; wind: boolean; precip: boolean }
  heroIconSize?: number
}

function TempText({ view }: { view: WeatherView }) {
  const seg = isSegmentable(view.temp.num)
  return (
    <span className="nh-weather__templine">
      <span className="nh-weather__temp" data-ghost={seg ? ghostFor(view.temp.num) : undefined}>
        {view.temp.num}
      </span>
      {view.temp.unit ? <span className="nh-weather__tempunit">{view.temp.unit}</span> : null}
    </span>
  )
}

interface StripCol {
  key: string
  label: string
  icon: string
  main: string
  sub?: string
  prob?: string
}

export const hourCol = (h: HourColumn): StripCol => ({ key: h.key, label: h.label, icon: h.icon, main: h.temp, prob: h.precipProb })
export const dayCol = (d: DayColumn): StripCol => ({
  key: d.key,
  label: d.label,
  icon: d.icon,
  main: d.high,
  sub: d.low,
  prob: d.precipProb
})

export function Strip({
  cols,
  iconStyle,
  days,
  className,
  iconSize = 30
}: {
  cols: StripCol[]
  iconStyle: unknown
  days?: boolean
  className?: string
  iconSize?: number
}) {
  const anyProb = cols.some((c) => c.prob !== undefined)
  return (
    <div className={'nh-weather__strip' + (days ? ' nh-weather__strip--days' : '') + (className ? ' ' + className : '')}>
      {cols.map((c) => (
        <div key={c.key} className="nh-weather__col">
          <span className="nh-weather__collabel">{c.label}</span>
          <Icon icon={meteoIcon(c.icon, iconStyle)} size={iconSize} className="nh-weather__colicon" />
          <span className="nh-weather__colmain">
            {c.main}
            {c.sub !== undefined ? <span className="nh-weather__colsub">{c.sub}</span> : null}
          </span>
          {anyProb ? <span className="nh-weather__colprob">{c.prob ?? ' '}</span> : null}
        </div>
      ))}
    </div>
  )
}

function DetailsRow({ view, t, details }: Pick<LookProps, 'view' | 't' | 'details'>) {
  const rows: { key: string; label: string; value: string }[] = []
  if (details.feels && view.feels !== undefined) rows.push({ key: 'feels', label: t('Feels like'), value: view.feels })
  if (details.humidity && view.humidity !== undefined) rows.push({ key: 'hum', label: t('Humidity'), value: view.humidity })
  if (details.wind && view.wind !== undefined) rows.push({ key: 'wind', label: t('Wind'), value: view.wind })
  if (details.precip && view.precipProb !== undefined) rows.push({ key: 'prob', label: t('Precipitation'), value: view.precipProb })
  if (rows.length === 0) return null
  return (
    <div className="nh-weather__details">
      {rows.map((r) => (
        <span key={r.key} className="nh-weather__detail">
          <span className="nh-weather__detlabel">{r.label}</span>
          <span className="nh-weather__detvalue">{r.value}</span>
        </span>
      ))}
    </div>
  )
}

export function HeroLook({ view, iconStyle, t, showHourly, showDaily, details, heroIconSize = 76 }: LookProps) {
  return (
    <div className="nh-weather nh-weather--hero">
      <div className="nh-weather__heromain">
        <div className="nh-weather__now">
          <Icon icon={meteoIcon(view.icon, iconStyle)} size={heroIconSize} className="nh-weather__bigicon" />
          <div className="nh-weather__reading">
            <TempText view={view} />
            <span className="nh-weather__cond">{view.label}</span>
            {view.high !== undefined && view.low !== undefined ? (
              <span className="nh-weather__range">
                {view.high} / {view.low}
              </span>
            ) : null}
          </div>
        </div>
        <DetailsRow view={view} t={t} details={details} />
      </div>
      {showHourly && view.hours.length > 0 ? <Strip cols={view.hours.map(hourCol)} iconStyle={iconStyle} /> : null}
      {showDaily && view.days.length > 0 ? <Strip cols={view.days.map(dayCol)} iconStyle={iconStyle} days /> : null}
    </div>
  )
}

export function CompactLook({ view, iconStyle }: LookProps) {
  return (
    <div className="nh-weather nh-weather--compact">
      <Icon icon={meteoIcon(view.icon, iconStyle)} size={44} className="nh-weather__bigicon" />
      <TempText view={view} />
      <span className="nh-weather__compactmeta">
        {view.label ? <span className="nh-weather__cond">{view.label}</span> : null}
        {view.high !== undefined && view.low !== undefined ? (
          <span className="nh-weather__range">
            {view.high} / {view.low}
          </span>
        ) : null}
      </span>
    </div>
  )
}

export function StripLook({ view, iconStyle, t, showCurrent, stripOf }: LookProps & { showCurrent: boolean; stripOf: unknown }) {
  const hours = stripOf === 'hours' && view.hours.length > 0
  const cols = hours ? view.hours.map(hourCol) : view.days.map(dayCol)
  return (
    <div className="nh-weather nh-weather--striplook">
      {showCurrent ? (
        <div className="nh-weather__mini">
          <Icon icon={meteoIcon(view.icon, iconStyle)} size={40} className="nh-weather__bigicon" />
          <TempText view={view} />
        </div>
      ) : null}
      {cols.length > 0 ? (
        <Strip cols={cols} iconStyle={iconStyle} days={!hours} />
      ) : (
        <span className="nh-weather__nodata">{t('No forecast data')}</span>
      )}
    </div>
  )
}
