export interface ClockConfig extends Record<string, unknown> {
  mode?: string
  showDate?: boolean
  showSeconds?: boolean
  hour12?: boolean
  showNumbers?: boolean
  dateFormat?: 'short' | 'weekday' | 'monthYear' | 'full' | 'numeric'
  hideTime?: boolean
  timeSource?: 'device' | 'server'
  timeZone?: string
  zoneLabel?: 'none' | 'short' | 'offset' | 'custom'
  zoneText?: string
  otherZones?: { zone: string; label?: string }[]
  tileBackground?: boolean
}

export function clockSource(config: Record<string, unknown>): 'device' | 'server' {
  return config.timeSource === 'server' ? 'server' : 'device'
}
