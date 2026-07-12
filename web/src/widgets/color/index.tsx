import { useState } from 'react'
import type { WidgetDefinition, WidgetProps } from '../types'
import { WidgetFrame } from '../common/WidgetFrame'
import { useKeyboardCommit } from '../common/useKeyboardCommit'

interface ColorConfig {
  item: string
  label?: string
}

interface Hsb {
  h: number
  s: number
  b: number
}

function parseHsb(state: string | undefined): Hsb {
  if (!state) return { h: 0, s: 0, b: 0 }
  const [h, s, b] = state.split(',').map(Number)
  return { h: h || 0, s: s || 0, b: b || 0 }
}

/** HSB (H 0-360, S/B 0-100) to a CSS rgb() string for the swatch preview. */
function hsbToCss({ h, s, b }: Hsb): string {
  const sat = s / 100
  const val = b / 100
  const c = val * sat
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = val - c
  const seg = Math.floor(h / 60) % 6
  const [r, g, bl] = [
    [c, x, 0],
    [x, c, 0],
    [0, c, x],
    [0, x, c],
    [x, 0, c],
    [c, 0, x],
  ][seg]
  const to255 = (n: number) => Math.round((n + m) * 255)
  return `rgb(${to255(r)}, ${to255(g)}, ${to255(bl)})`
}

/**
 * Color widget - hue/saturation/brightness sliders with a live swatch, sending "H,S,B" commands.
 * Deliberately dependency-free; the uniform widget contract lets this be swapped for a richer
 * wheel picker later without touching the rest of the app.
 */
function ColorWidget({ config, ctx }: WidgetProps<ColorConfig>) {
  const state = ctx.getItem(config.item)
  const [draft, setDraft] = useState<Hsb | null>(null)
  const hsb = draft ?? parseHsb(state?.state)

  const update = (patch: Partial<Hsb>) => setDraft({ ...hsb, ...patch })
  const commit = (next: Hsb) => {
    setDraft(null)
    if (!ctx.editing) {
      ctx.sendCommand(config.item, `${Math.round(next.h)},${Math.round(next.s)},${Math.round(next.b)}`)
    }
  }
  const commitOn = useKeyboardCommit(commit)

  const channel = (key: keyof Hsb, max: number) => (
    <input
      type="range"
      className={'nh-slider__input nh-color__' + key}
      min={0}
      max={max}
      step={1}
      value={Math.round(hsb[key])}
      disabled={ctx.editing}
      aria-label={key}
      onChange={(e) => update({ [key]: Number(e.target.value) })}
      onPointerUp={(e) => commitOn.now({ ...hsb, [key]: Number((e.target as HTMLInputElement).value) })}
      onKeyUp={(e) => commitOn.key(e.key, { ...hsb, [key]: Number((e.target as HTMLInputElement).value) })}
    />
  )

  return (
    <WidgetFrame label={config.label}>
      <div className="nh-color">
        <div className="nh-color__swatch" style={{ background: hsbToCss(hsb) }} />
        <div className="nh-color__channels">
          {channel('h', 360)}
          {channel('s', 100)}
          {channel('b', 100)}
        </div>
      </div>
    </WidgetFrame>
  )
}

export const colorWidget: WidgetDefinition<ColorConfig> = {
  type: 'color',
  name: 'Color',
  description: 'Pick a color for a Color item',
  defaultSize: { w: 3, h: 5 },
  minPixelHeight: 150,
  defaultConfig: () => ({ item: '' }),
  settings: [
    { key: 'item', type: 'item', label: 'openHAB Item', itemTypes: ['Color'] },
    { key: 'label', type: 'text', label: 'Name' },
  ],
  itemKeys: (c) => [c.item],
  Component: ColorWidget,
}
