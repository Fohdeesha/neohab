import { useEffect, useMemo, useState } from 'react'
import type { ComponentType } from 'react'
import type { WidgetDefinition, WidgetProps } from '../types'
import { displayValue, isSegmentable, numericValue, segParts, splitValueUnit } from '../common/format'
import { resolveStateIcon } from '../common/stateIcon'
import { getItemHistory } from '../../api/persistence'
import { severityColor } from '../dial/gauge'
import { finiteOr } from '../common/itemControl'
import { BarLook, HeroLook, PillLook, PlainLook, SegmentLook, SparkLook, SplitLook, StatLook } from './looks'
import type { LookProps, ValueView } from './looks'
import { ensureSegmentFont } from './segfont'
import {
  alignOf,
  alignable,
  barFraction,
  referenceValue,
  sparkArea,
  sparkPath,
  statPeriodMs,
  styleOf,
  trendDirection,
  trendTone,
  wantsHistory,
  type ValueConfig,
  type ValueStyle
} from './model'

const LOOK_COMPONENTS: Record<ValueStyle, ComponentType<LookProps>> = {
  plain: PlainLook,
  stat: StatLook,
  spark: SparkLook,
  split: SplitLook,
  bar: BarLook,
  segment: SegmentLook,
  pill: PillLook,
  hero: HeroLook
}

// the badge is drawn beside the reading, which only the looks laying one out in a row have room for
const BADGE_LOOKS = new Set<ValueStyle>(['stat', 'spark', 'split'])

interface HistoryState {
  points: { time: number; value: number }[]
  reference: number | undefined
}

const EMPTY: HistoryState = { points: [], reference: undefined }

// Stored config is untrusted: React throws on an object handed to it as a child, and a backup or a
// hand edit can put one in any of these. Guarded here rather than in each look.
const text = (v: unknown): string | undefined => {
  if (typeof v === 'string') return v === '' ? undefined : v
  return typeof v === 'number' && Number.isFinite(v) ? String(v) : undefined
}

function ValueWidget({ config, ctx }: WidgetProps<ValueConfig>) {
  const state = ctx.getItem(config.item)
  const { num, unit } = splitValueUnit(displayValue(state))
  const suffix = text(config.unit) ?? unit
  const value = numericValue(state)
  const style = styleOf(config.style)
  const color = (value !== undefined ? severityColor(value, config.severity) : undefined) ?? config.color

  const history = wantsHistory(config)
  const periodMs = statPeriodMs(config.trendPeriod)
  const [past, setPast] = useState<HistoryState>(EMPTY)
  useEffect(() => {
    if (!history) {
      setPast(EMPTY)
      return
    }
    let dead = false
    const ctrl = new AbortController()
    const load = async () => {
      try {
        const t0 = Date.now() - periodMs
        const pts = await getItemHistory(config.item, new Date(t0), { boundary: true, signal: ctrl.signal })
        const nums = pts.map((p) => ({ time: p.time, value: parseFloat(p.state) }))
        if (!dead) setPast({ points: nums, reference: referenceValue(nums, t0) })
      } catch {
        if (!dead) setPast(EMPTY)
      }
    }
    void load()
    const timer = setInterval(load, 300_000)
    return () => {
      dead = true
      ctrl.abort()
      clearInterval(timer)
    }
  }, [history, config.item, periodMs])

  useEffect(() => {
    if (style === 'segment') ensureSegmentFont()
  }, [style])

  const spark = useMemo(() => {
    if (style !== 'spark') return { line: '', area: '' }
    const line = sparkPath(past.points)
    return { line, area: sparkArea(line) }
  }, [style, past.points])

  const reference =
    config.trend === 'history' ? past.reference : config.trend === 'item' ? numericValue(ctx.getItem(config.trendItem ?? '')) : undefined
  const direction = value !== undefined && reference !== undefined ? trendDirection(value, reference) : null
  const tone = direction ? trendTone(direction, config.goodDirection) : null

  const subState = config.subItem ? ctx.getItem(config.subItem) : undefined
  const sub = config.subItem ? displayValue(subState) : config.subText

  const { icon, color: iconColor } = resolveStateIcon(config, false, state?.state)
  const { int, frac } = segParts(num)

  const view: ValueView = {
    int,
    frac,
    seg: isSegmentable(num),
    unit: suffix,
    color,
    icon,
    iconColor,
    iconSize: config.iconSize,
    state: state?.state,
    caption: text(config.caption),
    badge: BADGE_LOOKS.has(style) ? text(config.badge) : undefined,
    badgeColor: config.badgeColor,
    direction,
    tone,
    sub: text(sub),
    subCaption: text(config.subCaption),
    align: alignable(style) ? alignOf(config.align) : 'left',
    sparkLine: spark.line,
    sparkArea: spark.area,
    bar: style === 'bar' ? barFraction(value, config.min, config.max) : null,
    barMin: String(finiteOr(config.min, 0)),
    barMax: String(finiteOr(config.max, 100))
  }

  const Look = LOOK_COMPONENTS[style]
  return <Look config={config} view={view} />
}

// the plain look is a single row - the reading, its unit and an icon beside them - with nowhere to
// put a line underneath, so it is the one style that offers no caption
const hasCaption = (c: Record<string, unknown>) => styleOf(c.style) !== 'plain'
const isBar = (c: Record<string, unknown>) => styleOf(c.style) === 'bar'
const hasBadge = (c: Record<string, unknown>) => BADGE_LOOKS.has(styleOf(c.style))
const isAlignable = (c: Record<string, unknown>) => alignable(styleOf(c.style))
const trending = (c: Record<string, unknown>) => c.trend === 'history' || c.trend === 'item'
const needsWindow = (c: Record<string, unknown>) => c.trend === 'history' || styleOf(c.style) === 'spark'

export const valueWidget: WidgetDefinition<ValueConfig> = {
  type: 'value',
  name: 'Value',
  description: 'A reading from an item, drawn eight ways',
  defaultSize: { w: 2, h: 2 },
  hasHeader: true,
  minPixelHeight: (c) => {
    const style = styleOf(c.style)
    if (style === 'spark' || style === 'bar') return 120
    return style === 'split' ? 100 : 0
  },
  defaultConfig: () => ({ item: '', style: 'plain', trend: 'none', trendPeriod: '24h', goodDirection: 'none', align: 'left' }),
  settings: [
    { key: 'item', type: 'item', label: 'openHAB Item', readOnly: true },
    { key: 'label', type: 'text', label: 'Name' },
    { key: 'unit', type: 'text', label: 'Unit suffix' },
    {
      key: 'caption',
      type: 'text',
      label: 'Caption',
      showIf: hasCaption,
      hint: 'A small line under the reading, naming what it measures.'
    },
    { key: 'sec-appearance', type: 'section', label: 'Appearance' },
    {
      key: 'style',
      type: 'select',
      label: 'Style',
      options: [
        { value: 'plain', label: 'Plain' },
        { value: 'stat', label: 'Stat' },
        { value: 'spark', label: 'Sparkline' },
        { value: 'split', label: 'Split' },
        { value: 'bar', label: 'Bar' },
        { value: 'segment', label: 'Segment' },
        { value: 'pill', label: 'Pill' },
        { value: 'hero', label: 'Hero' }
      ],
      hint: 'How the reading is drawn. Everything else on this panel works the same in all of them.'
    },
    {
      key: 'align',
      type: 'select',
      label: 'Alignment',
      options: [
        { value: 'left', label: 'Left' },
        { value: 'center', label: 'Center' },
        { value: 'right', label: 'Right' }
      ],
      showIf: isAlignable
    },
    {
      key: 'min',
      type: 'number',
      label: 'Input minimum',
      showIf: isBar,
      hint: 'The two ends of the bar. The reading is placed between them.'
    },
    { key: 'max', type: 'number', label: 'Input maximum', showIf: isBar },
    { key: 'color', type: 'color', label: 'Value color' },
    { key: 'severity', type: 'gaugeseverity', label: 'Color stops' },
    { key: 'badge', type: 'text', label: 'Badge', showIf: hasBadge, hint: 'A short marker beside the reading, e.g. an exception code.' },
    {
      key: 'badgeColor',
      type: 'color',
      label: 'Badge color',
      showIf: (c) => hasBadge(c) && typeof c.badge === 'string' && c.badge !== ''
    },
    { key: 'icon', type: 'icon', label: 'Icon' },
    { key: 'iconColor', type: 'color', label: 'Icon color (mono icons)' },
    { key: 'iconSize', type: 'number', label: 'Icon size', min: 16, max: 128 },
    { key: 'stateIcons', type: 'stateicons', label: 'Per-state icons' },
    { key: 'sec-trend', type: 'section', label: 'Trend' },
    {
      key: 'trend',
      type: 'select',
      label: 'Trend arrow',
      options: [
        { value: 'none', label: 'None' },
        { value: 'history', label: 'Against its own history' },
        { value: 'item', label: 'Against another item' }
      ]
    },
    {
      key: 'trendPeriod',
      type: 'select',
      label: 'History window',
      options: [
        { value: '1h', label: '1h' },
        { value: '24h', label: '24h' },
        { value: '7d', label: '7d' },
        { value: '30d', label: '30d' }
      ],
      showIf: needsWindow,
      hint: 'How far back the sparkline reaches, and the point the trend arrow compares with.'
    },
    { key: 'trendItem', type: 'item', label: 'Compare with item', readOnly: true, showIf: (c) => c.trend === 'item' },
    {
      key: 'goodDirection',
      type: 'select',
      label: 'Good direction',
      options: [
        { value: 'none', label: 'No judgement' },
        { value: 'up', label: 'Up is good' },
        { value: 'down', label: 'Down is good' }
      ],
      hint: 'Arrows are drawn green when the reading moved the good way and red when it moved the other way.',
      showIf: trending
    },
    { key: 'sec-second-reading', type: 'section', label: 'Second reading' },
    { key: 'subItem', type: 'item', label: 'Second reading', readOnly: true },
    { key: 'subText', type: 'text', label: 'Second reading (fixed text)', showIf: (c) => !c.subItem },
    { key: 'subCaption', type: 'text', label: 'Second caption' }
  ],
  itemKeys: (c) => [
    c.item,
    ...(typeof c.subItem === 'string' && c.subItem !== '' ? [c.subItem] : []),
    ...(c.trend === 'item' && typeof c.trendItem === 'string' && c.trendItem !== '' ? [c.trendItem] : [])
  ],
  canCommand: () => false,
  // every item here is read and none is commanded, so the hold sheet gets no control for any of them
  controlFor: () => undefined,
  Component: ValueWidget
}
