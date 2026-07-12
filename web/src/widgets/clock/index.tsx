import { useEffect, useState } from 'react'
import type { WidgetDefinition, WidgetProps } from '../types'
import { WidgetFrame } from '../common/WidgetFrame'

interface ClockConfig {
  showDate?: boolean
  showSeconds?: boolean
  hour12?: boolean
}

function ClockWidget({ config }: WidgetProps<ClockConfig>) {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  const time = now.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: config.showSeconds ? '2-digit' : undefined,
    hour12: config.hour12,
  })
  const date = now.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })

  return (
    <WidgetFrame bare center>
      <div className="nh-clock">
        <div className="nh-clock__time">{time}</div>
        {config.showDate ? <div className="nh-clock__date">{date}</div> : null}
      </div>
    </WidgetFrame>
  )
}

export const clockWidget: WidgetDefinition<ClockConfig> = {
  type: 'clock',
  name: 'Clock',
  description: 'Current time and date',
  defaultSize: { w: 3, h: 3 },
  defaultConfig: () => ({ showDate: true, showSeconds: false }),
  settings: [
    { key: 'showDate', type: 'boolean', label: 'Show date' },
    { key: 'showSeconds', type: 'boolean', label: 'Show seconds' },
    { key: 'hour12', type: 'boolean', label: '12-hour clock' },
  ],
  Component: ClockWidget,
}
