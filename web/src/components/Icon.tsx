/**
 * Renders a widget icon from any source:
 *   "mdi:<name>"    - bundled Material Design Icon (monochrome). Rendered as a CSS mask so
 *                     the theme or an explicit `color` tints it.
 *   "fluent:<name>" - bundled Fluent Emoji flat icon (full color)
 *   "fc:<name>"     - bundled icons8 flat-color icon (full color)
 *   "meteo:<name>"  - bundled Meteocons weather icon (full color, animated)
 *   "custom:<id>"   - user-uploaded icon stored in the neohab:config namespace
 *   "oh:<name>"     - openHAB server icon (classic set), rendered by the server and
 *   "oh:<name>@<iconset>"  state-aware when `state` is given (light on/off, dimmer level…)
 *
 * A bare name without a prefix is treated as an openHAB icon (what HABPanel configs contain).
 */
import { useEffect, useState, type SyntheticEvent } from 'react'
import { ohUrl } from '../api/base'
import { useConfigStore } from '../store/config'

export type IconSource = 'mdi' | 'fluent' | 'fc' | 'meteo' | 'custom' | 'oh'

export interface IconRef {
  source: IconSource
  name: string
  /** Only meaningful for `oh` icons. */
  iconset: string
}

/** Bundled packs served from the jar at icons/<dir>/<name>.svg. */
const PACK_DIRS: Partial<Record<IconSource, string>> = {
  mdi: 'mdi',
  fluent: 'fluent',
  fc: 'fc',
  meteo: 'meteo',
}

const PREFIXED_SOURCES: IconSource[] = ['mdi', 'fluent', 'fc', 'meteo', 'custom']

export function parseIconRef(value: string | undefined): IconRef | null {
  if (!value) return null
  const v = value.trim()
  if (!v) return null
  for (const source of PREFIXED_SOURCES) {
    if (v.startsWith(source + ':')) {
      const name = v.slice(source.length + 1).trim()
      return name ? { source, name, iconset: '' } : null
    }
  }
  const raw = v.startsWith('oh:') ? v.slice(3) : v
  const at = raw.indexOf('@')
  const name = (at === -1 ? raw : raw.slice(0, at)).trim()
  const iconset = (at === -1 ? 'classic' : raw.slice(at + 1)).trim() || 'classic'
  return name ? { source: 'oh', name, iconset } : null
}

export function packIconUrl(source: IconSource, name: string): string {
  return `icons/${PACK_DIRS[source]}/${encodeURIComponent(name)}.svg`
}

export function ohIconUrl(name: string, iconset: string, state?: string): string {
  const params = new URLSearchParams({ iconset, anyFormat: 'true', format: 'svg' })
  if (state !== undefined && state !== '') params.set('state', state)
  return ohUrl('/icon/') + encodeURIComponent(name) + '?' + params.toString()
}

interface IconProps {
  icon: string | undefined
  /** Size (square) in px at desktop dashboard scale; inside a grid it is multiplied by the
   *  grid's --nh-iconscale so icons track the cell size on any screen. */
  size?: number
  /** Current item state, for state-aware openHAB icons. */
  state?: string
  /** Explicit tint for monochrome (mdi) icons; overrides theme/active-state tinting. */
  color?: string
  className?: string
}

const hideBroken = (e: SyntheticEvent<HTMLImageElement>) => {
  // unknown icon name: hide the broken-image glyph
  ;(e.target as HTMLImageElement).style.visibility = 'hidden'
}

/**
 * Whether a mask image can actually be loaded.
 *
 * A monochrome icon is drawn as a coloured box masked to the glyph's shape, and CSS says a
 * mask-image that fails to load resolves to `none` — so the box is drawn UNMASKED. A mistyped
 * name ("mdi:lightbub") therefore painted a solid block of the icon colour, which reads as a
 * rendering fault rather than a name that does not exist. The `<img>`-based sources hide
 * themselves through `onError`; a mask has no such event, so the URL is probed once instead.
 *
 * Cached per URL for the session: `Icon` renders on nearly every widget update, and a name that
 * is missing stays missing.
 */
type MaskStatus = 'ok' | 'missing'
const maskStatus = new Map<string, MaskStatus>()
const maskProbes = new Map<string, Promise<MaskStatus>>()

function probeMask(url: string): Promise<MaskStatus> {
  let probe = maskProbes.get(url)
  if (!probe) {
    probe = new Promise<MaskStatus>((resolve) => {
      const img = new Image()
      img.onload = () => resolve('ok')
      img.onerror = () => resolve('missing')
      img.src = url
    }).then((status) => {
      maskStatus.set(url, status)
      return status
    })
    maskProbes.set(url, probe)
  }
  return probe
}

/** True once `url` is known not to exist, so the caller can render nothing instead of a block. */
function useMaskMissing(url: string | null): boolean {
  const [missing, setMissing] = useState(() => (url ? maskStatus.get(url) === 'missing' : false))

  useEffect(() => {
    if (!url) {
      setMissing(false)
      return
    }
    const known = maskStatus.get(url)
    if (known !== undefined) {
      setMissing(known === 'missing')
      return
    }
    let alive = true
    void probeMask(url).then((status) => {
      if (alive) setMissing(status === 'missing')
    })
    return () => {
      alive = false
    }
  }, [url])

  return missing
}

/**
 * State-aware openHAB icons re-fetch when the item changes, and a set may have art for one
 * state but not another. The hidden flag is set imperatively, so React won't clear it on the
 * next src - without this an icon that 404s once stays invisible for the rest of the session.
 */
const showLoaded = (e: SyntheticEvent<HTMLImageElement>) => {
  ;(e.target as HTMLImageElement).style.visibility = ''
}

export function Icon({ icon, size = 32, state, color, className }: IconProps) {
  const ref = parseIconRef(icon)
  const customUri = useConfigStore((s) =>
    ref?.source === 'custom' ? s.customIcons.find((i) => i.id === ref.name)?.dataUri : undefined
  )
  // Hooks run for every icon, so the URL is computed before the early return below.
  const maskUrl = ref?.source === 'mdi' ? packIconUrl('mdi', ref.name) : null
  const maskMissing = useMaskMissing(maskUrl)
  if (!ref) return null

  const dim = `calc(${size}px * var(--nh-iconscale, 1))`

  if (ref.source === 'mdi') {
    if (maskMissing) return null
    return (
      <span
        className={'nh-icon nh-icon--mdi' + (className ? ' ' + className : '')}
        style={{
          width: dim,
          height: dim,
          WebkitMaskImage: `url(${maskUrl})`,
          maskImage: `url(${maskUrl})`,
          backgroundColor: color || undefined,
        }}
        aria-hidden
      />
    )
  }

  if (ref.source === 'custom') {
    if (!customUri) return null
    return (
      <img
        className={'nh-icon nh-icon--img' + (className ? ' ' + className : '')}
        src={customUri}
        style={{ width: dim, height: dim }}
        alt=""
      />
    )
  }

  if (ref.source === 'oh') {
    return (
      <img
        className={'nh-icon nh-icon--img nh-icon--oh' + (className ? ' ' + className : '')}
        src={ohIconUrl(ref.name, ref.iconset, state)}
        style={{ width: dim, height: dim }}
        alt=""
        loading="lazy"
        onError={hideBroken}
        onLoad={showLoaded}
      />
    )
  }

  // bundled full-color packs (fluent / fc / meteo)
  return (
    <img
      className={'nh-icon nh-icon--img' + (className ? ' ' + className : '')}
      src={packIconUrl(ref.source, ref.name)}
      style={{ width: dim, height: dim }}
      alt=""
      loading="lazy"
      onError={hideBroken}
      onLoad={showLoaded}
    />
  )
}
