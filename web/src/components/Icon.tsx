/**
 * Renders a widget icon from either source:
 *   "mdi:<name>"              - bundled Material Design Icon, tinted by the current text color
 *                               (CSS mask, so themes and active states recolor it for free)
 *   "oh:<name>"               - openHAB server icon (classic set), rendered by the server and
 *   "oh:<name>@<iconset>"       state-aware when `state` is given (light on/off, dimmer level…)
 *
 * A bare name without a prefix is treated as an openHAB icon (what HABPanel configs contain).
 */

export interface IconRef {
  source: 'mdi' | 'oh'
  name: string
  iconset: string
}

export function parseIconRef(value: string | undefined): IconRef | null {
  if (!value) return null
  const v = value.trim()
  if (!v) return null
  if (v.startsWith('mdi:')) {
    const name = v.slice(4).trim()
    return name ? { source: 'mdi', name, iconset: '' } : null
  }
  const raw = v.startsWith('oh:') ? v.slice(3) : v
  const at = raw.indexOf('@')
  const name = (at === -1 ? raw : raw.slice(0, at)).trim()
  const iconset = (at === -1 ? 'classic' : raw.slice(at + 1)).trim() || 'classic'
  return name ? { source: 'oh', name, iconset } : null
}

export function ohIconUrl(name: string, iconset: string, state?: string): string {
  const params = new URLSearchParams({ iconset, anyFormat: 'true', format: 'svg' })
  if (state !== undefined && state !== '') params.set('state', state)
  return '/icon/' + encodeURIComponent(name) + '?' + params.toString()
}

interface IconProps {
  icon: string | undefined
  /** Pixel size (square). */
  size?: number
  /** Current item state, for state-aware openHAB icons. */
  state?: string
  className?: string
}

export function Icon({ icon, size = 32, state, className }: IconProps) {
  const ref = parseIconRef(icon)
  if (!ref) return null

  if (ref.source === 'mdi') {
    const url = `icons/mdi/${encodeURIComponent(ref.name)}.svg`
    return (
      <span
        className={'nh-icon nh-icon--mdi' + (className ? ' ' + className : '')}
        style={{ width: size, height: size, WebkitMaskImage: `url(${url})`, maskImage: `url(${url})` }}
        aria-hidden
      />
    )
  }

  return (
    <img
      className={'nh-icon nh-icon--oh' + (className ? ' ' + className : '')}
      src={ohIconUrl(ref.name, ref.iconset, state)}
      width={size}
      height={size}
      alt=""
      loading="lazy"
      onError={(e) => {
        // unknown icon name: hide the broken-image glyph
        ;(e.target as HTMLImageElement).style.visibility = 'hidden'
      }}
    />
  )
}
