/**
 * The hue/saturation/brightness sliders and their swatch, with no item behind them. Split out
 * of ColorControl so the same picker serves a live light and a stored value: the preset editor
 * changes what a scene will set a light to, with no device involved, and it should not offer a
 * second, slightly different colour picker to do it.
 *
 * Each track previews what dragging it would do at the CURRENT other channels: hue = the full
 * wheel, saturation = gray to pure colour, brightness = black to full colour.
 */
import { hsbToCss, type Hsb } from '../../model/color'

export function ColorSliders({
  hsb,
  disabled = false,
  onInput,
  onCommit,
  onKeyCommit,
  aside
}: {
  hsb: Hsb
  disabled?: boolean
  /** Every drag frame, and every arrow-key step. */
  onInput: (next: Hsb) => void
  /** Pointer release. Absent where there is nothing to commit to. */
  onCommit?: (next: Hsb) => void
  /** Key release, with the key, so a caller can coalesce arrow stepping into one command. */
  onKeyCommit?: (key: string, next: Hsb) => void
  /**
   * Controls drawn at the right-hand end of the swatch - the colour widget's on and off buttons.
   * Passed in rather than built here because they command an item, and this module deliberately
   * knows nothing about one. Absent everywhere it is not asked for, so a picker without it renders
   * exactly as it always has.
   */
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
      onPointerUp={(e) => onCommit?.({ ...hsb, [key]: Number((e.target as HTMLInputElement).value) })}
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
