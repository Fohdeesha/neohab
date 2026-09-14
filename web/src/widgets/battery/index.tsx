import { useId, useRef } from 'react'
import type { ComponentType, CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'
import type { WidgetDefinition, WidgetProps } from '../types'
import { WidgetFrame } from '../common/WidgetFrame'
import { numericValue } from '../common/format'
import { useBoxSize } from '../../components/useBoxSize'
import { useActiveTheme } from '../../themes/active'
import { BarLook, CellsLook, GlowLook, MeterLook, NeonLook, PodsLook, RingLook, WaveLook } from './looks'
import type { BatteryView, Box } from './looks'
import {
  animateOf,
  chargingOf,
  colorModeOf,
  displayPercent,
  inputRange,
  levelOf,
  percentOf,
  showTextOf,
  styleOf,
  thresholdsOf
} from './model'
import type { BatteryConfig, BatteryStyle } from './model'

const LOOK_COMPONENTS: Record<BatteryStyle, ComponentType<{ box: Box; view: BatteryView; uid: string }>> = {
  glow: GlowLook,
  neon: NeonLook,
  cells: CellsLook,
  ring: RingLook,
  pods: PodsLook,
  bar: BarLook,
  wave: WaveLook,
  meter: MeterLook
}

const LEVEL_COLOR = { good: 'var(--bt-good)', mid: 'var(--bt-mid)', low: 'var(--bt-low)' } as const

function BatteryWidget({ config, ctx }: WidgetProps<BatteryConfig>) {
  const { t } = useTranslation()
  const theme = useActiveTheme()
  const ref = useRef<HTMLDivElement>(null)
  const box = useBoxSize(ref)
  // React's ids carry colons, which a url(#...) reference would rather not
  const uid = 'bt' + useId().replace(/[^a-zA-Z0-9]/g, '')

  const style = styleOf(config.style)
  const state = ctx.getItem(config.item)
  const pct = percentOf(numericValue(state), inputRange(config.min, config.max))
  const level = levelOf(pct, thresholdsOf(config.lowBelow, config.midBelow))
  const mode = colorModeOf(config.colorMode)
  const charging =
    typeof config.chargingItem === 'string' && config.chargingItem !== '' ? chargingOf(ctx.getItem(config.chargingItem)) : false
  const color = pct === null ? 'var(--bt-unknown)' : mode === 'accent' ? 'var(--bt-accent)' : LEVEL_COLOR[level ?? 'good']

  if (!config.item) {
    return (
      <WidgetFrame label={config.label} center>
        <div className="nh-battery__empty">{t('No item configured')}</div>
      </WidgetFrame>
    )
  }

  const view: BatteryView = {
    pct: pct ?? 0,
    known: pct !== null,
    percentText: displayPercent(pct),
    color,
    charging,
    text: showTextOf(config.showText),
    caption: typeof config.caption === 'string' && config.caption.trim() !== '' ? config.caption : undefined,
    icon: typeof config.icon === 'string' && config.icon !== '' ? config.icon : undefined,
    animate: animateOf(config.animate) && !window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    chargingLabel: t('Charging'),
    scheme: theme.scheme === 'light' ? 'light' : 'dark',
    // the reference's green bolt, unless the tube itself is green, then a warm white neon
    neonBolt: mode === 'level' && level === 'good' ? '#f6ffd8' : '#5cff4a'
  }
  const Look = LOOK_COMPONENTS[style]
  const light = view.scheme === 'light'
  const rootStyle = {
    '--bt-color': color,
    '--bt-ink': light ? 'var(--nh-text)' : '#ffffff',
    '--bt-neon-ink': light ? 'color-mix(in srgb, var(--bt-color) 50%, black)' : '#eafcff'
  } as CSSProperties
  return (
    <WidgetFrame label={config.label}>
      <div
        ref={ref}
        className={'nh-battery nh-battery--' + style + (charging ? ' nh-battery--charging' : '')}
        data-level={level ?? 'unknown'}
        style={rootStyle}>
        {box.width > 0 && box.height > 0 ? <Look box={{ w: box.width, h: box.height }} view={view} uid={uid} /> : null}
      </div>
    </WidgetFrame>
  )
}

const isLevel = (c: Record<string, unknown>) => colorModeOf(c.colorMode) === 'level'
const isPods = (c: Record<string, unknown>) => styleOf(c.style) === 'pods'
const isWave = (c: Record<string, unknown>) => styleOf(c.style) === 'wave'

export const batteryWidget: WidgetDefinition<BatteryConfig> = {
  type: 'battery',
  name: 'Battery',
  description: 'The charge of a battery, drawn eight ways',
  defaultSize: { w: 3, h: 3 },
  minPixelHeight: 140,
  hasHeader: true,
  defaultConfig: () => ({
    item: '',
    style: 'neon',
    showText: true,
    min: 0,
    max: 100,
    colorMode: 'level',
    lowBelow: 20,
    midBelow: 45,
    animate: true
  }),
  settings: [
    { key: 'item', type: 'item', label: 'openHAB Item', readOnly: true, hint: 'A Number or Dimmer item holding the charge.' },
    { key: 'label', type: 'text', label: 'Name' },
    {
      key: 'min',
      type: 'number',
      label: 'Input minimum',
      hint: 'The item value that means empty, and below the one that means full. Anything in between is scaled to a percent.'
    },
    { key: 'max', type: 'number', label: 'Input maximum' },
    {
      key: 'chargingItem',
      type: 'item',
      label: 'Charging item',
      readOnly: true,
      hint: 'An item that is ON, OPEN or above zero while charging. It lights the bolt.'
    },
    { key: 'sec-appearance', type: 'section', label: 'Appearance' },
    {
      key: 'style',
      type: 'select',
      label: 'Style',
      options: [
        { value: 'glow', label: 'Glow' },
        { value: 'neon', label: 'Neon' },
        { value: 'cells', label: 'Cells' },
        { value: 'ring', label: 'Ring' },
        { value: 'pods', label: 'Pods' },
        { value: 'bar', label: 'Bar' },
        { value: 'wave', label: 'Wave' },
        { value: 'meter', label: 'Meter' }
      ]
    },
    { key: 'showText', type: 'boolean', label: 'Show the percent' },
    {
      key: 'colorMode',
      type: 'select',
      label: 'Color',
      options: [
        { value: 'level', label: 'By level' },
        { value: 'accent', label: 'Tile accent' }
      ],
      hint: 'By level is green, amber below one threshold and red below the other. Tile accent uses the Accent color set on this tile, or the theme accent.'
    },
    { key: 'midBelow', type: 'number', label: 'Amber below', min: 0, max: 100, showIf: isLevel },
    { key: 'lowBelow', type: 'number', label: 'Red below', min: 0, max: 100, showIf: isLevel },
    {
      key: 'caption',
      type: 'text',
      label: 'Caption',
      showIf: isPods,
      hint: 'Shown under the number. While charging it says Charging instead.'
    },
    { key: 'icon', type: 'icon', label: 'Icon', showIf: isPods, hint: 'Drawn in a white disc on the lozenge. Leave empty for none.' },
    { key: 'animate', type: 'boolean', label: 'Move the wave', showIf: isWave }
  ],
  itemKeys: (c) => (typeof c.chargingItem === 'string' && c.chargingItem !== '' ? [c.item, c.chargingItem] : [c.item]),
  canCommand: () => false,
  // both items are read, never commanded, so the hold sheet gets no control for either
  controlFor: () => undefined,
  Component: BatteryWidget
}
