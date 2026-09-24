import { useTranslation } from 'react-i18next'
import { appLocale } from '../../i18n'
import type { WidgetProps } from '../types'
import { buildForecastView, buildItemsView, clampInt, itemsBinding, locationOf, type ViewOptions } from './model'
import { useWeather } from './useWeather'
import { dayCol, HeroLook, hourCol, Strip } from './looks'

const ALL_DETAILS = { feels: true, humidity: true, wind: true, precip: true }

const SHEET_HOURS = 12
const COL_ICON = 46
const HERO_ICON = 104

export function WeatherDetail({ config, ctx }: WidgetProps<Record<string, unknown>>) {
  const { t } = useTranslation()
  const { source, data, sys, located, failed } = useWeather(config)

  const opts: ViewOptions = { days: 7, hours: SHEET_HOURS, showPrecip: true, lang: appLocale(), t }

  let view = null
  let message: string | null = null
  if (source === 'items') {
    const binding = itemsBinding(config)
    if (!binding.temp && !binding.condition) message = t('Pick the items that hold your weather readings.')
    else view = buildItemsView(binding, ctx.getItem, { ...opts, days: clampInt(config.days, 1, 7, 5), now: new Date() })
  } else if (!located) {
    message = t('Set a location to fetch the forecast.')
  } else if (data) {
    view = buildForecastView(data, sys ?? 'metric', opts)
  } else if (failed) {
    message = t('Could not fetch the forecast. It keeps retrying; check that this device can reach the internet.')
  } else {
    message = t('Loading…')
  }

  const place = locationOf(config.location)?.name
  return (
    <div className="nh-wdetail">
      {source === 'openmeteo' && place ? <p className="nh-wdetail__place">{place}</p> : null}
      {view ? (
        <>
          {/* The hero draws the current conditions only: the strips are laid out below, where
              this surface can give them rows of their own instead of one scrolling line. */}
          <HeroLook
            view={view}
            iconStyle={config.iconStyle}
            t={t}
            showHourly={false}
            showDaily={false}
            details={ALL_DETAILS}
            heroIconSize={HERO_ICON}
          />
          {/* Items mode has no hourly readings at all, however roomy the sheet is. */}
          {view.hours.length > 0 ? (
            <section className="nh-wdetail__block">
              <h3 className="nh-wdetail__head">{t('Hourly forecast')}</h3>
              <Strip cols={view.hours.map(hourCol)} iconStyle={config.iconStyle} className="nh-wdetail__hours" iconSize={COL_ICON} />
            </section>
          ) : null}
          {view.days.length > 0 ? (
            <section className="nh-wdetail__block">
              <h3 className="nh-wdetail__head">{t('Weekly forecast')}</h3>
              <Strip cols={view.days.map(dayCol)} iconStyle={config.iconStyle} days className="nh-wdetail__days" iconSize={COL_ICON} />
            </section>
          ) : null}
        </>
      ) : (
        <p className="nh-weather__empty">{message}</p>
      )}
    </div>
  )
}
