/**
 * The clock's stored shape, and the readers both the tile and its detail sheet need.
 *
 * Its own module so the two can share them without importing one another: the definition in
 * `index.tsx` names `detail.tsx` as its detail view, so anything the sheet reached back for would
 * close a cycle.
 */

export interface ClockConfig extends Record<string, unknown> {
  /** 'digital' (default) or 'analog' (SVG face, colored by the theme tokens). */
  mode?: string
  showDate?: boolean
  showSeconds?: boolean
  hour12?: boolean
  /** Analog only: numerals around the face. */
  showNumbers?: boolean
  /** How the date line is written; all of them follow the UI language. */
  dateFormat?: 'short' | 'weekday' | 'monthYear' | 'full' | 'numeric'
  /** Date only: the panel says what day it is, not what time it is. */
  hideTime?: boolean
  /**
   * Whose clock the tile draws: the openHAB server's (the default), read from the `Date` header
   * on its own responses, or this device's. See `model/servertime.ts`.
   */
  timeSource?: 'device' | 'server'
  /** IANA zone id. Absent, empty or unknown all mean this device's own zone. */
  timeZone?: string
  /** Whether the tile names its zone, and how. See `zoneLabelText`. */
  zoneLabel?: 'none' | 'short' | 'offset' | 'custom'
  /** The text for `zoneLabel: 'custom'`; empty falls back to the zone's own city. */
  zoneText?: string
  /** Extra zones the detail sheet lists beside this one: `[{ zone, label? }]`. */
  otherZones?: { zone: string; label?: string }[]
  /**
   * The tile's own card, on by default like every other widget's. Turning it off leaves the
   * time on the dashboard background with nothing around it - which is what HABPanel's own
   * clock calls "No background", and what this widget used to be unconditionally.
   */
  tileBackground?: boolean
}

/**
 * Which clock a config asks for.
 *
 * The server is the DEFAULT, and `defaultConfig()` is what supplies it - so this reads the
 * effective config (definition defaults under the stored keys), which is the same one the tile
 * renders from. What is decided here is the other direction: anything that is not an explicit
 * 'server' draws this device's clock, so a stored value from somewhere else lands on the reading
 * that cannot fail rather than on one that waits for a request.
 */
export function clockSource(config: Record<string, unknown>): 'device' | 'server' {
  return config.timeSource === 'server' ? 'server' : 'device'
}
