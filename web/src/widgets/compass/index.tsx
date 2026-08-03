/**
 * Compass: a bearing (wind direction, heading) drawn as a rotating pointer on a compass
 * face, with the nearest cardinal name in the center. An optional center item puts a second
 * reading (typically wind speed) in the middle of the face — the weather-console layout —
 * and the cardinal drops to a small line beneath it. Display-only - a direction is a
 * reading, not a command.
 */
import { useTranslation } from 'react-i18next'
import type { WidgetDefinition, WidgetProps } from '../types'
import { WidgetFrame } from '../common/WidgetFrame'
import { displayValue, splitValueUnit } from '../common/format'
import { bearingFrom, cardinalFor } from './model'

interface CompassConfig {
  item: string
  label?: string
  /** Second reading shown big in the middle of the face (wind speed beside direction). */
  centerItem?: string
  /** Unit under the center reading; the item's own formatted unit when unset. */
  centerUnit?: string
  /** Numeric degrees under the cardinal name. */
  showDegrees?: boolean
  /** Fixed cardinal letters just inside the ring. */
  rose?: boolean
  /** Pointer + center color; the theme accent when unset. */
  color?: string
}

/** Fixed rose letter positions (bearing degrees -> letter); diagonals render smaller. */
const ROSE: [number, string, boolean][] = [
  [0, 'N', false],
  [45, 'NE', true],
  [90, 'E', false],
  [135, 'SE', true],
  [180, 'S', false],
  [225, 'SW', true],
  [270, 'W', false],
  [315, 'NW', true],
]

function roseXY(deg: number, r: number): { x: number; y: number } {
  const rad = ((deg - 90) * Math.PI) / 180
  return { x: 50 + r * Math.cos(rad), y: 50 + r * Math.sin(rad) }
}

function CompassWidget({ config, ctx }: WidgetProps<CompassConfig>) {
  const { t } = useTranslation()
  const state = ctx.getItem(config.item)
  const bearing = bearingFrom(state?.state)
  const ink = config.color || 'var(--nh-primary)'
  const centerState = config.centerItem ? ctx.getItem(config.centerItem) : undefined
  const center = config.centerItem ? splitValueUnit(displayValue(centerState)) : undefined
  const centerUnit = config.centerItem ? config.centerUnit || center?.unit : undefined

  if (!config.item) {
    return (
      <WidgetFrame label={config.label} center>
        <div className="nh-compass__empty">{t('No item configured')}</div>
      </WidgetFrame>
    )
  }

  return (
    <WidgetFrame label={config.label} center>
      <svg className="nh-compass" viewBox="0 0 100 100" role="img" aria-label={t('Compass')}>
        <circle className="nh-compass__ring" cx="50" cy="50" r="40" />
        {/* 16-wind tick ring (majors on the cardinals) - the instrument bezel */}
        {Array.from({ length: 16 }, (_, i) => {
          const major = i % 4 === 0
          const outer = roseXY(i * 22.5, 40)
          const inner = roseXY(i * 22.5, major ? 35.5 : 37.5)
          return (
            <line
              key={i}
              className={'nh-compass__tick' + (major ? ' nh-compass__tick--major' : '')}
              x1={inner.x}
              y1={inner.y}
              x2={outer.x}
              y2={outer.y}
            />
          )
        })}
        {config.rose
          ? ROSE.map(([deg, letter, minor]) => {
              const p = roseXY(deg, 29.5)
              return (
                <text
                  key={letter}
                  className={'nh-compass__rose' + (minor ? ' nh-compass__rose--minor' : '')}
                  x={p.x}
                  y={p.y}
                >
                  {letter}
                </text>
              )
            })
          : null}
        {bearing !== null ? (
          <g className="nh-compass__pointer" transform={`rotate(${bearing} 50 50)`}>
            {/* straddles the ring at the top, tip pointing inward */}
            <polygon points="50,16 44.6,3.5 55.4,3.5" fill={ink} />
          </g>
        ) : null}
        {center ? (
          <>
            {/* the reading carries its fill as an attribute for the same reason the cardinal
                does below; a stylesheet fill on its class would pin it grey */}
            <text className="nh-compass__value" x="50" y="45" fill={ink}>
              {center.num}
            </text>
            {centerUnit ? (
              <text className="nh-compass__valueunit" x="50" y="59">
                {centerUnit}
              </text>
            ) : null}
          </>
        ) : null}
        {/* the lit cardinal carries its fill as an attribute with NO stylesheet fill on its
            class - a class rule would beat the attribute and pin it grey */}
        <text
          className={
            'nh-compass__cardinal' +
            (center ? ' nh-compass__cardinal--sub' : '') +
            (bearing === null ? ' nh-compass__cardinal--empty' : '')
          }
          x="50"
          y={center ? 70 : config.showDegrees && bearing !== null ? 47 : 50}
          fill={bearing !== null ? ink : undefined}
        >
          {bearing !== null ? cardinalFor(bearing) : '—'}
        </text>
        {!center && config.showDegrees && bearing !== null ? (
          <text className="nh-compass__deg" x="50" y="66">
            {Math.round(bearing)}°
          </text>
        ) : null}
      </svg>
    </WidgetFrame>
  )
}

export const compassWidget: WidgetDefinition<CompassConfig> = {
  type: 'compass',
  name: 'Compass',
  description: 'Wind or bearing direction on a compass face',
  defaultSize: { w: 3, h: 3 },
  minPixelHeight: 110,
  hasHeader: true,
  defaultConfig: () => ({ item: '' }),
  settings: [
    { key: 'item', type: 'item', label: 'openHAB Item' },
    { key: 'label', type: 'text', label: 'Name' },
    {
      key: 'centerItem',
      type: 'item',
      label: 'Center item',
      hint: 'A second reading shown big in the middle of the face — wind speed beside wind direction.',
    },
    {
      key: 'centerUnit',
      type: 'text',
      label: 'Center unit suffix',
      showIf: (c) => Boolean(c.centerItem),
    },
    {
      key: 'showDegrees',
      type: 'boolean',
      label: 'Show degrees',
      hint: 'The numeric bearing under the cardinal name.',
      showIf: (c) => !c.centerItem,
    },
    { key: 'rose', type: 'boolean', label: 'Show cardinal letters' },
    { key: 'color', type: 'color', label: 'Color' },
  ],
  itemKeys: (c) => (c.centerItem ? [c.item, c.centerItem] : [c.item]),
  Component: CompassWidget,
}
