/**
 * What a hold on a clock tile opens.
 *
 * A clock is set for a glance - often just "08:25" and a short date, and on a small tile the
 * date is shed altogether. This is the rest of it: the time to the second, the date written
 * out in full, which zone that is, and the same moment in any other zones the widget carries.
 * All of it in the interface's own language, like the tile: Intl decides the wording and the
 * field order, and only which fields to ask for is ours.
 *
 * It also answers the question a clock showing the SERVER's time raises, which is how far this
 * device is from it. Both clocks are named, the one on screen is marked, and the gap between
 * them is put into words and inked: the good colour when they agree, the bad one when they do
 * not. Anything under a second reads as identical, because one reading of the `Date` header
 * cannot resolve a difference that small (see `model/servertime.ts`) and printing a number for
 * it would be inventing precision.
 */
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { WidgetProps } from '../types'
import { clockDifference, displayNow, formatDuration } from '../../model/servertime'
import { acquireServerTime, syncServerTime, useServerTimeStore } from '../../store/servertime'
import { clockSource } from './config'
import {
  deviceZone,
  extraZones,
  resolveZone,
  zoneCity,
  zoneLongName,
  zoneOffsetLabel,
} from './zones'

/**
 * The same instant in one zone, as one row of the other-zones list.
 *
 * Takes the clock's own 12/24-hour choice: read against the big reading above it, a row in the
 * other form is a second thing to work out rather than an answer.
 */
function ZoneRow({
  now,
  zone,
  label,
  lang,
  hour12,
}: {
  now: Date
  zone: string
  label: string
  lang: string
  hour12: boolean | undefined
}) {
  return (
    <div className="nh-clockdetail__zonerow">
      <span className="nh-clockdetail__zonename">{label}</span>
      <span className="nh-clockdetail__zonetime">
        {now.toLocaleTimeString(lang, {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12,
          ...(zone === '' ? {} : { timeZone: zone }),
        })}
      </span>
      <span className="nh-clockdetail__zoneoff">{zoneOffsetLabel(now, zone)}</span>
    </div>
  )
}

export function ClockDetail({ config }: WidgetProps<Record<string, unknown>>) {
  const { t, i18n } = useTranslation()
  const [tick, setTick] = useState(() => Date.now())
  const source = clockSource(config)
  const offsetMs = useServerTimeStore((s) => s.offsetMs)
  const syncing = useServerTimeStore((s) => s.syncing)
  const failed = useServerTimeStore((s) => s.failed)

  // Seconds always, whatever the tile shows: reading the exact time is most of the point of
  // opening this. The sheet is one panel, not a wall of tiles, so a per-second tick is cheap.
  useEffect(() => {
    const id = setInterval(() => setTick(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  // Both clocks are named here whichever one the tile draws, so the sheet needs a reading even
  // for a device-time clock. Holding it keeps the periodic sync alive while the sheet is open;
  // the explicit call gets a fresh one now, and is folded into any request already in flight.
  useEffect(() => {
    const release = acquireServerTime()
    void syncServerTime()
    return release
  }, [])

  const lang = i18n.language || 'en'
  const now = new Date(displayNow(tick, offsetMs, source))
  const zone = resolveZone(config.timeZone)
  const hour12 = config.hour12 === true ? true : config.hour12 === false ? false : undefined
  const inZone = zone === '' ? {} : { timeZone: zone }
  const time = now.toLocaleTimeString(lang, { ...inZone, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12 })
  const date = now.toLocaleDateString(lang, { ...inZone, weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })

  const serverName = t('openHAB server')
  const deviceName = t('This device')
  /** The clock NOT on screen, which is the one the difference describes. */
  const otherName = source === 'server' ? deviceName : serverName

  let difference: string
  /** Which way to ink the row: the two agree, they do not, or nothing has been read. */
  let tone: 'same' | 'off' | 'unknown' = 'unknown'
  // Nothing read yet: it is either still being asked for, or the asking failed. A previous
  // reading, if there is one, is shown rather than thrown away - a clock that has been right for
  // four minutes should not go blank because one request was refused.
  if (offsetMs === null) difference = failed && !syncing ? t('Could not be reached') : t('Checking…')
  else {
    const gap = clockDifference(offsetMs, source)
    tone = gap.identical ? 'same' : 'off'
    difference = gap.identical
      ? t('Identical')
      : gap.ahead
        ? t('{{time}} ahead', { time: formatDuration(gap.ms, lang) })
        : t('{{time}} behind', { time: formatDuration(gap.ms, lang) })
  }

  // This device's own zone belongs in the list whenever the clock is not already showing it -
  // "and what is that in my time" is the first thing a world clock is asked. It goes first,
  // because it is what a reader orients by.
  //
  // Deduplicated across both sources: `extraZones` only removes duplicates within the stored
  // list, so a widget whose extras happen to name THIS device's zone would otherwise put the same
  // zone in twice - two rows saying the same thing, under one React key.
  const device = deviceZone()
  const others = []
  const listed = new Set([zone])
  for (const row of [
    ...(device !== '' ? [{ zone: device, label: deviceName }] : []),
    ...extraZones(config.otherZones).map((z) => ({ zone: z.zone, label: z.label ?? zoneCity(z.zone) })),
  ]) {
    if (listed.has(row.zone)) continue
    listed.add(row.zone)
    others.push(row)
  }

  return (
    <div className="nh-clockdetail">
      {/* The reading, on a panel of its own: it is the answer, and the facts below it are the
          footnotes. Everything is centred - a clock is one reading, not a form. */}
      <div className="nh-clockdetail__hero">
        <div className="nh-clockdetail__time">{time}</div>
        <div className="nh-clockdetail__date">{date}</div>
      </div>
      <dl className="nh-detail__facts nh-clockdetail__facts">
        {zone ? (
          <div className="nh-detail__row">
            <dt>{t('Time zone')}</dt>
            <dd>
              {zoneLongName(now, zone, lang)}
              <span className="nh-clockdetail__zoneid">{zone}</span>
            </dd>
          </div>
        ) : null}
        <div className="nh-detail__row">
          <dt>{t('Offset from UTC')}</dt>
          <dd>{zoneOffsetLabel(now, zone)}</dd>
        </div>
        <div className="nh-detail__row">
          <dt>{t('Time source')}</dt>
          <dd>{source === 'server' ? serverName : deviceName}</dd>
        </div>
        <div className="nh-detail__row">
          <dt>{otherName}</dt>
          <dd className={'nh-clockdetail__diff nh-clockdetail__diff--' + tone}>{difference}</dd>
        </div>
      </dl>
      {others.length > 0 ? (
        <>
          <h3 className="nh-clockdetail__head">{t('Other zones')}</h3>
          <div className="nh-clockdetail__zones">
            {others.map((z) => (
              <ZoneRow key={z.zone} now={now} zone={z.zone} label={z.label} lang={lang} hour12={hour12} />
            ))}
          </div>
        </>
      ) : null}
    </div>
  )
}
