import { hsbToCss, type Hsb } from '../../model/color'

export function ColorSliders({
  hsb,
  disabled = false,
  onInput,
  onCommit,
  onKeyCommit,
  onPointerDown,
  onPointerMove,
  onPointerCancel,
  aside
}: {
  hsb: Hsb
  disabled?: boolean
  onInput: (next: Hsb) => void
  onCommit?: (next: Hsb) => void
  onKeyCommit?: (key: string, next: Hsb) => void
  onPointerDown?: (e: React.PointerEvent) => void
  onPointerMove?: (e: React.PointerEvent) => void
  onPointerCancel?: (e: React.PointerEvent) => void
  aside?: React.ReactNode
}) {
  const swatch = hsbToCss(hsb)
  const trackFor = (key: keyof Hsb): string => {
    if (key === 'h') {
      const stops = [0, 60, 120, 180, 240, 300, 360].map((h) => hsbToCss({ h, s: Math.max(40, hsb.s), b: Math.max(50, hsb.b) })).join(', ')
      return `linear-gradient(to right, ${stops})`
    }
    if (key === 's') {
      return `linear-gradient(to right, ${hsbToCss({ ...hsb, s: 0 })}, ${hsbToCss({ ...hsb, s: 100 })})`
    }
    return `linear-gradient(to right, ${hsbToCss({ ...hsb, b: 0 })}, ${hsbToCss({ ...hsb, b: 100 })})`
  }

  const channel = (key: keyof Hsb, max: number) => (
    <input
      type="range"
      className={'nh-color__track nh-color__' + key}
      style={{ '--nh-track': trackFor(key) } as React.CSSProperties}
      min={0}
      max={max}
      step={1}
      value={Math.round(hsb[key])}
      disabled={disabled}
      aria-label={key}
      onChange={(e) => onInput({ ...hsb, [key]: Number(e.target.value) })}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={(e) => onCommit?.({ ...hsb, [key]: Number((e.target as HTMLInputElement).value) })}
      onPointerCancel={onPointerCancel}
      onKeyUp={(e) => onKeyCommit?.(e.key, { ...hsb, [key]: Number((e.target as HTMLInputElement).value) })}
    />
  )

  return (
    <div className={'nh-color' + (aside ? ' nh-color--aside' : '')}>
      <div className="nh-color__swatch" style={{ background: swatch }} />
      {aside ? <div className="nh-color__aside">{aside}</div> : null}
      <div className="nh-color__channels">
        {channel('h', 360)}
        {channel('s', 100)}
        {channel('b', 100)}
      </div>
    </div>
  )
}
