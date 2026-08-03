import { useEffect, useState } from 'react'
import type { WidgetDefinition, WidgetProps } from '../types'
import { WidgetFrame } from '../common/WidgetFrame'
import { ghostFor } from '../common/format'

interface ClockConfig {
  /** 'digital' (default) or 'analog' (SVG face, colored by the theme tokens). */
  mode?: string
  showDate?: boolean
  showSeconds?: boolean
  hour12?: boolean
  /** Analog only: numerals around the face. */
  showNumbers?: boolean
}

/** Hand line from the center at `deg` (0 = 12 o'clock), as an SVG line in a 200x200 viewBox. */
function hand(deg: number, length: number) {
  const rad = ((deg - 90) * Math.PI) / 180
  return { x2: 100 + length * Math.cos(rad), y2: 100 + length * Math.sin(rad) }
}

/**
 * Theme-token analog face: border ring, text-colored hands, primary second hand. Colors come
 * from the CSS variables, so it matches every theme (including custom ones) automatically.
 */
function AnalogFace({ now, seconds, numbers }: { now: Date; seconds: boolean; numbers: boolean }) {
  const m = now.getMinutes() + now.getSeconds() / 60
  const h = (now.getHours() % 12) + m / 60
  const hourHand = hand(h * 30, 46)
  const minuteHand = hand(m * 6, 70)
  const secondHand = hand(now.getSeconds() * 6, 78)

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

function ClockWidget({ config }: WidgetProps<ClockConfig>) {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  const analog = String(config.mode ?? '').toLowerCase() === 'analog'
  const date = now.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })

  if (analog) {
    return (
      <WidgetFrame bare center>
        <div className="nh-clock nh-clock--analog">
          <AnalogFace now={now} seconds={config.showSeconds === true} numbers={config.showNumbers === true} />
          {config.showDate ? <div className="nh-clock__date">{date}</div> : null}
        </div>
      </WidgetFrame>
    )
  }

  const time = now.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: config.showSeconds ? '2-digit' : undefined,
    hour12: config.hour12,
  })

  return (
    <WidgetFrame bare center>
      <div className="nh-clock">
        {/* data-ghost is inert metadata: the LCD theme draws it as unlit segments ("8:88")
            behind the time; identical non-digit chars overlay themselves invisibly */}
        <div className="nh-clock__time" data-ghost={ghostFor(time)}>
          {time}
        </div>
        {config.showDate ? <div className="nh-clock__date">{date}</div> : null}
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
  defaultConfig: () => ({ mode: 'digital', showDate: true, showSeconds: false }),
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
    { key: 'showSeconds', type: 'boolean', label: 'Show seconds' },
    { key: 'showNumbers', type: 'boolean', label: 'Show numerals', showIf: isAnalog },
    { key: 'hour12', type: 'boolean', label: '12-hour clock', showIf: isDigital },
  ],
  Component: ClockWidget,
}
