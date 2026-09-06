import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { WidgetProps } from '../types'
import { clockDifference, displayNow, formatDuration } from '../../model/servertime'
import { acquireServerTime, syncServerTime, useServerTimeStore } from '../../store/servertime'
import { clockSource } from './config'
import { deviceZone, extraZones, resolveZone, zoneCity, zoneLongName, zoneOffsetLabel } from './zones'

function ZoneRow({
  now,
  zone,
  label,
  lang,
  hour12
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
          ...(zone === '' ? {} : { timeZone: zone })
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

  useEffect(() => {
    const id = setInterval(() => setTick(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

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
  const otherName = source === 'server' ? deviceName : serverName

  let difference: string
  let tone: 'same' | 'off' | 'unknown' = 'unknown'
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

  const device = deviceZone()
  const others = []
  const listed = new Set([zone])
  for (const row of [
    ...(device !== '' ? [{ zone: device, label: deviceName }] : []),
    ...extraZones(config.otherZones).map((z) => ({ zone: z.zone, label: z.label ?? zoneCity(z.zone) }))
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
