/**
 * What a hold on a weather tile opens: everything that was fetched, rather than the part the
 * tile had room for.
 *
 * A compact row shows a temperature and a word; a hero on a phone sheds its strips at 230px and
 * its details at 130px. All of it came out of one seven-day request either way, so the sheet
 * draws the same hero look with every reading turned on, and lays the forecast out for the room
 * a full-screen panel has: the next twelve hours as two rows of six, and the week centred
 * beneath them under a heading of its own. The COLUMNS are the tile's own (`Strip` in looks.tsx),
 * so a change to what a column shows appears in both places; only their arrangement is set here.
 *
 * Twelve hours rather than the twenty-four that were fetched: two tidy rows read at a glance,
 * where 24 across is a strip nobody scrolls and 24 wrapped is four rows of small print. The rest
 * of the day is what the daily row is for.
 *
 * The forecast comes from the same cache the tile filled, so opening this costs no request.
 */
import { useTranslation } from 'react-i18next'
import type { WidgetProps } from '../types'
import { buildForecastView, buildItemsView, clampInt, itemsBinding, locationOf, type ViewOptions } from './model'
import { useWeather } from './useWeather'
import { dayCol, HeroLook, hourCol, Strip } from './looks'

/** Every reading the hero can draw: the tile's own show/hide settings are about the tile. */
const ALL_DETAILS = { feels: true, humidity: true, wind: true, precip: true }

/** Hours the sheet lays out: two rows of six. See the note above on why not all twenty-four. */
const SHEET_HOURS = 12
/** Column drawings, and the current one - a sheet is not a tile and has the room for both. */
const COL_ICON = 46
const HERO_ICON = 104

export function WeatherDetail({ config, ctx }: WidgetProps<Record<string, unknown>>) {
  const { t, i18n } = useTranslation()
  const { source, data, sys, located, failed } = useWeather(config)

  // Everything the request carries, whatever the tile was set to show.
  const opts: ViewOptions = { days: 7, hours: SHEET_HOURS, showPrecip: true, lang: i18n.language || 'en', t }

  let view = null
  let message: string | null = null
  if (source === 'items') {
    const binding = itemsBinding(config)
    if (!binding.temp && !binding.condition) message = t('Pick the items that hold your weather readings.')
    // Items mode has as many days as the patterns name and no hourly data at all, so it is
    // asked for its own day count rather than the seven a forecast carries.
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
