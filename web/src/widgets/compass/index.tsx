/**
 * Compass: a bearing (wind direction, heading) drawn as a rotating pointer on a compass
 * face, with the nearest cardinal name in the center. Display-only - a direction is a
 * reading, not a command.
 */
import { useTranslation } from 'react-i18next'
import type { WidgetDefinition, WidgetProps } from '../types'
import { WidgetFrame } from '../common/WidgetFrame'
import { bearingFrom, cardinalFor } from './model'

interface CompassConfig {
  item: string
  label?: string
  /** Numeric degrees under the cardinal name. */
  showDegrees?: boolean
  /** Fixed N/E/S/W letters just inside the ring. */
  rose?: boolean
  /** Pointer + center color; the theme accent when unset. */
  color?: string
}

/** Fixed rose letter positions (bearing degrees -> letter). */
const ROSE: [number, string][] = [
  [0, 'N'],
  [90, 'E'],
  [180, 'S'],
  [270, 'W'],
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
        {config.rose
          ? ROSE.map(([deg, letter]) => {
              const p = roseXY(deg, 31)
              return (
                <text key={letter} className="nh-compass__rose" x={p.x} y={p.y}>
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
        {/* the lit cardinal carries its fill as an attribute with NO stylesheet fill on its
            class - a class rule would beat the attribute and pin it grey */}
        <text
          className={'nh-compass__cardinal' + (bearing === null ? ' nh-compass__cardinal--empty' : '')}
          x="50"
          y={config.showDegrees && bearing !== null ? 47 : 50}
          fill={bearing !== null ? ink : undefined}
        >
          {bearing !== null ? cardinalFor(bearing) : '—'}
        </text>
        {config.showDegrees && bearing !== null ? (
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
      key: 'showDegrees',
      type: 'boolean',
      label: 'Show degrees',
      hint: 'The numeric bearing under the cardinal name.',
    },
    { key: 'rose', type: 'boolean', label: 'Show cardinal letters' },
    { key: 'color', type: 'color', label: 'Color' },
  ],
  itemKeys: (c) => [c.item],
  Component: CompassWidget,
}
