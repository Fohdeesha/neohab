import { useEffect, useState } from 'react'
import type { WidgetDefinition, WidgetProps } from '../types'
import { WidgetFrame } from '../common/WidgetFrame'
import { displayValue, ghostFor, isSegmentable, numericValue, segParts, splitValueUnit } from '../common/format'
import { getItemHistory } from '../../api/persistence'
import { severityColor, type SeverityStop } from '../dial/gauge'
import { referenceValue, statPeriodMs, trendDirection, trendTone, type TrendDirection } from './stat'

interface StatConfig {
  item: string
  label?: string
  unit?: string
  caption?: string
  color?: string
  severity?: SeverityStop[]
  badge?: string
  badgeColor?: string
  trend?: 'none' | 'history' | 'item'
  trendPeriod?: string
  trendItem?: string
  goodDirection?: 'up' | 'down' | 'none'
  subItem?: string
  subText?: string
  subCaption?: string
  align?: 'left' | 'center' | 'right'
  icon?: string
  iconColor?: string
  iconSize?: number
}

const ARROWS: Record<TrendDirection, string> = {
  up: 'M6 0 L11.5 7.2 H8.2 V14 H3.8 V7.2 H0.5 Z',
  down: 'M6 14 L11.5 6.8 H8.2 V0 H3.8 V6.8 H0.5 Z',
  flat: 'M0 5 H12 V9 H0 Z'
}

function StatWidget({ config, ctx }: WidgetProps<StatConfig>) {
  const state = ctx.getItem(config.item)
  const { num, unit } = splitValueUnit(displayValue(state))
  const suffix = config.unit || unit
  const value = numericValue(state)
  const color = (value !== undefined ? severityColor(value, config.severity) : undefined) ?? config.color

  const wantsHistory = config.trend === 'history' && config.item !== ''
  const periodMs = statPeriodMs(config.trendPeriod)
  const [past, setPast] = useState<number | undefined>(undefined)
  useEffect(() => {
    if (!wantsHistory) {
      setPast(undefined)
      return
    }
    let dead = false
    const ctrl = new AbortController()
    const load = async () => {
      try {
        const t0 = Date.now() - periodMs
        const pts = await getItemHistory(config.item, new Date(t0), { boundary: true, signal: ctrl.signal })
        const nums = pts.map((p) => ({ time: p.time, value: parseFloat(p.state) }))
        if (!dead) setPast(referenceValue(nums, t0))
      } catch {
        if (!dead) setPast(undefined)
      }
    }
    void load()
    const timer = setInterval(load, 300_000)
    return () => {
      dead = true
      ctrl.abort()
      clearInterval(timer)
    }
  }, [wantsHistory, config.item, periodMs])

  const reference =
    config.trend === 'history' ? past : config.trend === 'item' ? numericValue(ctx.getItem(config.trendItem ?? '')) : undefined
  const direction = value !== undefined && reference !== undefined ? trendDirection(value, reference) : null
  const tone = direction ? trendTone(direction, config.goodDirection) : null

  const subState = config.subItem ? ctx.getItem(config.subItem) : undefined
  const sub = config.subItem ? displayValue(subState) : config.subText
  const hasFoot = direction !== null || (sub !== undefined && sub !== '')

  const { int, frac } = segParts(num)
  const seg = isSegmentable(num)

  return (
    <WidgetFrame label={config.label} icon={config.icon} iconSize={config.iconSize} iconState={state?.state} iconColor={config.iconColor}>
      <div className={'nh-stat' + (config.align === 'center' || config.align === 'right' ? ' nh-stat--' + config.align : '')}>
        {/* the ink sits on the row, not the value, so the unit beside it can follow the
            reading's color in themes that ask it to (it stays dim in the rest) */}
        <div className="nh-stat__main" style={{ color }}>
          {config.badge ? (
            <span className="nh-stat__badge" style={{ background: config.badgeColor }}>
              {config.badge}
            </span>
          ) : null}
          <span className="nh-stat__value" data-ghost={seg ? ghostFor(int) : undefined}>
            {int}
            {frac !== undefined ? (
              <span className="nh-stat__frac" data-ghost={seg ? ghostFor(frac) : undefined}>
                {frac}
              </span>
            ) : null}
          </span>
          {suffix ? <span className="nh-stat__unit">{suffix}</span> : null}
        </div>
        {config.caption ? <div className="nh-stat__caption">{config.caption}</div> : null}
        {hasFoot ? (
          <div className="nh-stat__foot">
            {direction ? (
              <svg className={'nh-stat__arrow nh-stat__arrow--' + tone} viewBox="0 0 12 14" role="img" aria-label={direction}>
                <path d={ARROWS[direction]} />
              </svg>
            ) : null}
            {sub ? (
              <span className="nh-stat__sub">
                <span className="nh-stat__subvalue">{sub}</span>
                {config.subCaption ? <span className="nh-stat__subcaption">{config.subCaption}</span> : null}
              </span>
            ) : null}
          </div>
        ) : null}
      </div>
    </WidgetFrame>
  )
}

const trending = (c: Record<string, unknown>) => c.trend === 'history' || c.trend === 'item'

export const statWidget: WidgetDefinition<StatConfig> = {
  type: 'stat',
  name: 'Stat',
  description: 'A headline reading with a trend arrow and a second, smaller figure',
  defaultSize: { w: 2, h: 2 },
  hasHeader: true,
  defaultConfig: () => ({ item: '', trend: 'none', trendPeriod: '24h', goodDirection: 'none', align: 'left' }),
  settings: [
    { key: 'item', type: 'item', label: 'openHAB Item' },
    { key: 'label', type: 'text', label: 'Name' },
    { key: 'unit', type: 'text', label: 'Unit suffix' },
    { key: 'caption', type: 'text', label: 'Caption', hint: 'A small line under the reading, naming what it measures.' },
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
      label: 'Compare with',
      options: [
        { value: '1h', label: '1h ago' },
        { value: '24h', label: '24h ago' },
        { value: '7d', label: '7 days ago' },
        { value: '30d', label: '30 days ago' }
      ],
      showIf: (c) => c.trend === 'history'
    },
    { key: 'trendItem', type: 'item', label: 'Compare with item', showIf: (c) => c.trend === 'item' },
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
    { key: 'subItem', type: 'item', label: 'Second reading' },
    { key: 'subText', type: 'text', label: 'Second reading (fixed text)', showIf: (c) => !c.subItem },
    { key: 'subCaption', type: 'text', label: 'Second caption' },
    { key: 'sec-appearance', type: 'section', label: 'Appearance' },
    {
      key: 'align',
      type: 'select',
      label: 'Alignment',
      options: [
        { value: 'left', label: 'Left' },
        { value: 'center', label: 'Center' },
        { value: 'right', label: 'Right' }
      ]
    },
    { key: 'color', type: 'color', label: 'Value color' },
    { key: 'severity', type: 'gaugeseverity', label: 'Color stops' },
    { key: 'badge', type: 'text', label: 'Badge', hint: 'A short marker beside the reading, e.g. an exception code.' },
    { key: 'badgeColor', type: 'color', label: 'Badge color', showIf: (c) => typeof c.badge === 'string' && c.badge !== '' },
    { key: 'icon', type: 'icon', label: 'Icon' },
    { key: 'iconColor', type: 'color', label: 'Icon color (mono icons)' },
    { key: 'iconSize', type: 'number', label: 'Icon size', min: 16, max: 128 }
  ],
  itemKeys: (c) => [
    c.item,
    ...(typeof c.subItem === 'string' && c.subItem !== '' ? [c.subItem] : []),
    ...(c.trend === 'item' && typeof c.trendItem === 'string' && c.trendItem !== '' ? [c.trendItem] : [])
  ],
  canCommand: () => false,
  Component: StatWidget
}
