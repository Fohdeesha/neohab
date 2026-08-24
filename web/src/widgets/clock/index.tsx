import { useEffect, useState } from 'react'
import type { WidgetDefinition, WidgetProps } from '../types'
import { WidgetFrame } from '../common/WidgetFrame'
import { ghostFor } from '../common/format'
import { ClockDetail } from './detail'
import { CLOCK_LINES, type ClockLine, fit, lineFit } from './fit'
import { resolveZone, zoneLabelText, zoneParts, type ZoneParts } from './zones'
import { displayNow, msToNextBoundary } from '../../model/servertime'
import { type ClockConfig, clockSource } from './config'
import { acquireServerTime, useServerTimeStore } from '../../store/servertime'

/**
 * The date line, in the browser's own locale so it follows the UI language, and in the clock's
 * own zone so a Tokyo clock rolls over to tomorrow when Tokyo does. Intl decides the wording and
 * the field order for each locale; only which fields to ask for is ours.
 */
function formatDate(now: Date, format: string | undefined, zone: string): string {
  const inZone = zone === '' ? {} : { timeZone: zone }
  switch (format) {
    case 'weekday':
      return now.toLocaleDateString([], { ...inZone, weekday: 'long' })
    case 'monthYear':
      return now.toLocaleDateString([], { ...inZone, month: 'long', year: 'numeric' })
    case 'full':
      return now.toLocaleDateString([], { ...inZone, weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
    case 'numeric':
      return now.toLocaleDateString([], inZone)
    default:
      return now.toLocaleDateString([], { ...inZone, weekday: 'short', month: 'short', day: 'numeric' })
  }
}

/** Hand line from the center at `deg` (0 = 12 o'clock), as an SVG line in a 200x200 viewBox. */
function hand(deg: number, length: number) {
  const rad = ((deg - 90) * Math.PI) / 180
  return { x2: 100 + length * Math.cos(rad), y2: 100 + length * Math.sin(rad) }
}

/**
 * Theme-token analog face: border ring, text-colored hands, primary second hand. Colors come
 * from the CSS variables, so it matches every theme (including custom ones) automatically.
 *
 * Takes the hour, minute and second already resolved in the clock's own zone rather than a Date,
 * because `Date.getHours()` can only ever answer for the browser's zone.
 */
function AnalogFace({ parts, seconds, numbers }: { parts: ZoneParts; seconds: boolean; numbers: boolean }) {
  const m = parts.minute + parts.second / 60
  const h = (parts.hour % 12) + m / 60
  const hourHand = hand(h * 30, 46)
  const minuteHand = hand(m * 6, 70)
  const secondHand = hand(parts.second * 6, 78)

  return (
    <svg className="nh-clock__face" viewBox="0 0 200 200" role="img" aria-hidden="true">
      <circle cx="100" cy="100" r="96" fill="none" stroke="var(--nh-border)" strokeWidth="3" />
      {Array.from({ length: 12 }, (_, i) => {
        const quarter = i % 3 === 0
        const outer = hand(i * 30, 92)
        const inner = hand(i * 30, quarter ? 82 : 87)
        return (
          <line
            key={i}
            x1={inner.x2}
            y1={inner.y2}
            x2={outer.x2}
            y2={outer.y2}
            stroke="var(--nh-text-dim)"
            strokeWidth={quarter ? 4 : 2}
          />
        )
      })}
      {numbers
        ? Array.from({ length: 12 }, (_, i) => {
            const n = i === 0 ? 12 : i
            const pos = hand(i * 30, 68)
            return (
              <text
                key={i}
                x={pos.x2}
                y={pos.y2}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize="17"
                fill="var(--nh-text-dim)"
              >
                {n}
              </text>
            )
          })
        : null}
      <line x1="100" y1="100" x2={hourHand.x2} y2={hourHand.y2} stroke="var(--nh-text)" strokeWidth="7" strokeLinecap="round" />
      <line x1="100" y1="100" x2={minuteHand.x2} y2={minuteHand.y2} stroke="var(--nh-text)" strokeWidth="4" strokeLinecap="round" />
      {seconds ? (
        <line x1="100" y1="100" x2={secondHand.x2} y2={secondHand.y2} stroke="var(--nh-primary)" strokeWidth="2" strokeLinecap="round" />
      ) : null}
      <circle cx="100" cy="100" r="5" fill="var(--nh-primary)" />
    </svg>
  )
}

/** One line's cap (see fit.ts), as the custom property its stylesheet rule reads. */
const capVar = (name: string, css: string): React.CSSProperties => ({ [name]: css }) as React.CSSProperties

/**
 * The instant this clock should draw, and the tick that keeps it current.
 *
 * The offset is the shared one (`store/servertime`), held only while a clock actually asks for
 * it, so a dashboard of device-time clocks issues no requests. Each tick is aimed at the next
 * boundary of the DISPLAYED clock rather than repeated on a fixed interval: with an offset in
 * force those are not the same moment, and a clock showing seconds has to turn over on the
 * second it is showing.
 */
function useClockNow(source: 'device' | 'server', seconds: boolean): Date {
  const [now, setNow] = useState(() => new Date())
  const offsetMs = useServerTimeStore((s) => (source === 'server' ? s.offsetMs : null))

  useEffect(() => {
    if (source !== 'server') return
    return acquireServerTime()
  }, [source])

  const period = seconds ? 1000 : 60_000
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    const schedule = () => {
      // Read through the store rather than a captured value: a sync landing mid-interval moves
      // the boundary, and a stale closure would keep aiming at the old one.
      const offset = source === 'server' ? useServerTimeStore.getState().offsetMs : null
      timer = setTimeout(
        () => {
          setNow(new Date())
          schedule()
        },
        msToNextBoundary(displayNow(Date.now(), offset, source), period)
      )
    }
    schedule()
    return () => clearTimeout(timer)
  }, [period, source])

  return new Date(displayNow(now.getTime(), offsetMs, source))
}

function ClockWidget({ config }: WidgetProps<ClockConfig>) {
  const seconds = config.showSeconds === true && config.hideTime !== true
  const source = clockSource(config)
  const now = useClockNow(source, seconds)
  const zone = resolveZone(config.timeZone)
  // The interface language, which is also what the date is written in.
  const lang = typeof navigator !== 'undefined' ? navigator.language : 'en'
  const zoneText = zoneLabelText(now, zone, lang, config.zoneLabel, config.zoneText)

  const analog = String(config.mode ?? '').toLowerCase() === 'analog'
  const date = formatDate(now, config.dateFormat, zone)
  // Truthiness, not `=== true`: an imported configuration can store this as a string.
  const wantsDate = Boolean(config.showDate)
  // Absent means shown: an existing clock, and one imported from a HABPanel config that did not
  // ask for "No background", both get the card the rest of the dashboard has.
  const bare = config.tileBackground === false

  if (analog) {
    // The face takes whatever the lines beneath it leave, so its captions are capped against the
    // tile directly instead of being solved against one another.
    return (
      <WidgetFrame bare={bare} center>
        <div className="nh-clock nh-clock--analog">
          <AnalogFace
            parts={zoneParts(now, zone)}
            seconds={config.showSeconds === true}
            numbers={config.showNumbers === true}
          />
          {zoneText ? (
            <div className="nh-clock__zone" style={capVar('--nh-clock-zonefit', fit(CLOCK_LINES.zone.em, zoneText, 14, 0.23))}>
              {zoneText}
            </div>
          ) : null}
          {wantsDate ? (
            <div className="nh-clock__date" style={capVar('--nh-clock-datefit', fit(CLOCK_LINES.date.em, date, 14, 0.3))}>
              {date}
            </div>
          ) : null}
        </div>
      </WidgetFrame>
    )
  }

  const time = now.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: config.showSeconds ? '2-digit' : undefined,
    hour12: config.hour12,
    ...(zone === '' ? {} : { timeZone: zone }),
  })

  // Hiding the time leaves the date as the panel's own reading, so it is set as one.
  const dateOnly = config.hideTime === true
  const showDate = wantsDate || dateOnly
  // Which lines this tile is stacking, so each one's cap is worked out against the others that
  // are really there rather than against a fixed pair.
  const present: ClockLine[] = []
  if (!dateOnly) present.push('time')
  if (zoneText) present.push('zone')
  if (showDate) present.push(dateOnly ? 'dateOnly' : 'date')

  return (
    <WidgetFrame bare={bare} center>
      <div className="nh-clock">
        {dateOnly ? null : (
          /* data-ghost is inert metadata: the LCD theme draws it as unlit segments ("8:88")
             behind the time; identical non-digit chars overlay themselves invisibly */
          <div
            className="nh-clock__time"
            style={capVar('--nh-clock-timefit', lineFit('time', present, time))}
            data-ghost={ghostFor(time)}
          >
            {time}
          </div>
        )}
        {zoneText ? (
          <div className="nh-clock__zone" style={capVar('--nh-clock-zonefit', lineFit('zone', present, zoneText))}>
            {zoneText}
          </div>
        ) : null}
        {showDate ? (
          <div
            className={'nh-clock__date' + (dateOnly ? ' nh-clock__date--only' : '')}
            style={capVar('--nh-clock-datefit', lineFit(dateOnly ? 'dateOnly' : 'date', present, date))}
          >
            {date}
          </div>
        ) : null}
      </div>
    </WidgetFrame>
  )
}

const isAnalog = (c: Record<string, unknown>) => String(c.mode ?? '').toLowerCase() === 'analog'
const isDigital = (c: Record<string, unknown>) => !isAnalog(c)

export const clockWidget: WidgetDefinition<ClockConfig> = {
  type: 'clock',
  name: 'Clock',
  description: 'Current time and date',
  defaultSize: { w: 3, h: 3 },
  defaultConfig: () => ({
    mode: 'digital',
    showDate: true,
    showSeconds: false,
    dateFormat: 'short',
    tileBackground: true,
    // The server's clock by default: on a home network that is the NTP-driven one of the two,
    // and a wall panel whose own clock has drifted is exactly what this widget should not show.
    timeSource: 'server',
    timeZone: '',
    zoneLabel: 'none',
  }),
  settings: [
    {
      key: 'mode',
      type: 'select',
      label: 'Style',
      options: [
        { value: 'digital', label: 'Digital' },
        { value: 'analog', label: 'Analog' },
      ],
    },
    { key: 'showDate', type: 'boolean', label: 'Show date' },
    {
      key: 'dateFormat',
      type: 'select',
      label: 'Date format',
      options: [
        { value: 'short', label: 'Fri, Nov 6' },
        { value: 'weekday', label: 'Friday' },
        { value: 'monthYear', label: 'November 2026' },
        { value: 'full', label: 'Friday, November 6, 2026' },
        { value: 'numeric', label: '11/6/2026' },
      ],
      hint: 'Written in the language the interface is set to.',
      showIf: (c) => c.showDate === true || c.hideTime === true,
    },
    { key: 'hideTime', type: 'boolean', label: 'Date only (hide the time)', showIf: isDigital },
    { key: 'showSeconds', type: 'boolean', label: 'Show seconds', showIf: (c) => c.hideTime !== true },
    { key: 'showNumbers', type: 'boolean', label: 'Show numerals', showIf: isAnalog },
    { key: 'hour12', type: 'boolean', label: '12-hour clock', showIf: (c) => isDigital(c) && c.hideTime !== true },
    {
      key: 'timeZone',
      type: 'timezone',
      label: 'Time zone',
      hint: 'A second clock set to another zone is how to keep an eye on another country.',
    },
    {
      key: 'zoneLabel',
      type: 'select',
      label: 'Show the zone',
      options: [
        { value: 'none', label: 'Off' },
        { value: 'short', label: 'Short name' },
        { value: 'offset', label: 'UTC offset' },
        { value: 'custom', label: 'Your own text' },
      ],
    },
    {
      key: 'zoneText',
      type: 'text',
      label: 'Zone label',
      hint: 'Left empty, the zone’s own city is used.',
      showIf: (c) => c.zoneLabel === 'custom',
    },
    {
      key: 'timeSource',
      type: 'select',
      label: 'Time source',
      options: [
        { value: 'device', label: 'This device' },
        { value: 'server', label: 'openHAB server' },
      ],
      hint: 'Which clock this tile follows. The server’s is usually the better kept of the two; hold the tile to compare them.',
    },
    { key: 'otherZones', type: 'clockzones', label: 'Other zones' },
    { key: 'tileBackground', type: 'boolean', label: 'Show the tile background' },
  ],
  Component: ClockWidget,
  DetailView: ClockDetail,
}
