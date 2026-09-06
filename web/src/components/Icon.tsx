import { useEffect, useState, type SyntheticEvent } from 'react'
import { ohUrl } from '../api/base'
import { useConfigStore } from '../store/config'
import { cssUrl } from './download'

export type IconSource = 'mdi' | 'fluent' | 'fc' | 'meteo' | 'custom' | 'oh'

export interface IconRef {
  source: IconSource
  name: string
  iconset: string
}

const PACK_DIRS: Partial<Record<IconSource, string>> = {
  mdi: 'mdi',
  fluent: 'fluent',
  fc: 'fc',
  meteo: 'meteo'
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
  size?: number
  state?: string
  color?: string
  className?: string
}

const hideBroken = (e: SyntheticEvent<HTMLImageElement>) => {
  ;(e.target as HTMLImageElement).style.visibility = 'hidden'
}

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

const showLoaded = (e: SyntheticEvent<HTMLImageElement>) => {
  ;(e.target as HTMLImageElement).style.visibility = ''
}

export function Icon({ icon, size = 32, state, color, className }: IconProps) {
  const ref = parseIconRef(icon)
  const customUri = useConfigStore((s) => (ref?.source === 'custom' ? s.customIcons.find((i) => i.id === ref.name)?.dataUri : undefined))
  const maskUrl = ref?.source === 'mdi' ? packIconUrl('mdi', ref.name) : null
  const maskMissing = useMaskMissing(maskUrl)
  if (!ref) return null

  const dim = `calc(${size}px * var(--nh-iconscale, 1))`

  if (ref.source === 'mdi') {
    if (maskMissing || maskUrl === null) return null
    const mask = `url("${cssUrl(maskUrl)}")`
    return (
      <span
        className={'nh-icon nh-icon--mdi' + (className ? ' ' + className : '')}
        style={{
          width: dim,
          height: dim,
          // a mask declaration the browser drops is NO mask, which paints the icon colour as a solid block
          WebkitMaskImage: mask,
          maskImage: mask,
          backgroundColor: color || undefined
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
