import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { WidgetDefinition, WidgetProps } from '../types'
import { WidgetFrame } from '../common/WidgetFrame'
import { useBoxSize } from '../../components/useBoxSize'
import { useConfigStore } from '../../store/config'
import { useSettledState } from '../../store/settling'
import { resolveBackgroundRef } from '../../model/background'
import { useActiveTheme } from '../../themes/active'
import {
  containRect,
  DEFAULT_GLOW_SIZE,
  glowBlendFor,
  glowCss,
  glowFor,
  glowGeometry,
  glowScaleOf,
  lightsOf,
  planStyleOf,
  type FloorplanConfig,
  type FloorplanLight
} from './model'
import { LightPopup } from './LightPopup'
import { BAR_INSET, PresetBar } from './PresetBar'

const PLAN_FLOOR = 220
// one chip row plus the insets either side of it, measured on a phone rather than assumed
const CHIP_ROW_ROOM = 63

export function PlanCanvas({
  config,
  ctx,
  children,
  onPlanPointerDown
}: {
  config: FloorplanConfig
  ctx: WidgetProps<FloorplanConfig>['ctx']
  children?: (rect: { left: number; top: number; width: number; height: number }) => React.ReactNode
  onPlanPointerDown?: (e: React.PointerEvent, rect: { left: number; top: number; width: number; height: number }) => void
}) {
  const { t } = useTranslation()
  const backgrounds = useConfigStore((s) => s.backgrounds)
  const src = resolveBackgroundRef(config.image, backgrounds)
  const boxRef = useRef<HTMLDivElement>(null)
  const { width: boxW, height: boxH } = useBoxSize(boxRef)
  const [img, setImg] = useState<{ w: number; h: number } | null>(null)
  const [popup, setPopup] = useState<FloorplanLight | null>(null)
  const [barH, setBarH] = useState(0)

  const settled = useSettledState()
  const scheme = useActiveTheme().scheme

  const lights = lightsOf(config)
  const scale = glowScaleOf(config)
  const style = planStyleOf(config)
  const blend = glowBlendFor(style, scheme === 'light' ? 'light' : 'dark')
  // A tile taller than the plan needs used to split the spare room above and below it, so the chips
  // floated in the middle of the card with the plan hanging over them. The bar gets that room
  // first. On a tile somebody drew, the reserve stops at the room going spare, so the plan is never
  // made smaller than the size they chose and the chips lie over it where there is none. A stacked
  // card's height was derived rather than drawn, so there the plan gives up what the chips need -
  // capped, so it always keeps most of the card.
  const spare = img ? Math.max(0, boxH - containRect(boxW, boxH, img.w, img.h).height) : 0
  const room = ctx.stacked ? Math.max(spare, boxH * 0.35) : spare
  const reserved = Math.min(barH > 0 ? barH + BAR_INSET : 0, room)
  const rect = img ? containRect(boxW, boxH - reserved, img.w, img.h) : null
  const interactive = !ctx.editing && !children

  return (
    <div className="nh-fplan" ref={boxRef} style={{ '--nh-glow-blend': blend } as React.CSSProperties}>
      {src ? (
        <img
          className={'nh-fplan__img nh-fplan__img--' + style}
          src={src}
          alt=""
          draggable={false}
          // object-fit centres the drawing in this box, and containRect works out where the glows
          // and markers go: both have to be told about the room the chips took, or the lights land
          // off the rooms they are in
          style={{ height: `calc(100% - ${reserved}px)` }}
          onLoad={(e) => setImg({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
        />
      ) : (
        <p className="nh-fplan__empty">{t('No plan image yet - pick one in the widget settings.')}</p>
      )}
      {rect && rect.width > 0 ? (
        <div
          className="nh-fplan__layer"
          style={{ left: rect.left, top: rect.top, width: rect.width, height: rect.height }}
          onPointerDown={onPlanPointerDown ? (e) => onPlanPointerDown(e, rect) : undefined}>
          {lights.map((l) => {
            const glow = glowFor(settled(l.item, ctx.getItem(l.item)?.state))
            if (!glow || glow.intensity <= 0) return null
            const geom = glowGeometry(l.glowDir, (l.size ?? DEFAULT_GLOW_SIZE) * scale)
            return (
              <span
                key={'g' + l.id}
                className="nh-fplan__glow"
                style={{
                  left: `${l.x}%`,
                  top: `${l.y}%`,
                  width: `${geom.width}%`,
                  aspectRatio: geom.aspectRatio,
                  transform: geom.transform,
                  backgroundImage: glowCss(glow, l.glowDir, blend)
                }}
              />
            )
          })}
          {config.markers !== false && !children
            ? lights.map((l) => (
                <button
                  key={'m' + l.id}
                  type="button"
                  className="nh-fplan__marker"
                  style={{ left: `${l.x}%`, top: `${l.y}%` }}
                  title={l.label ?? l.item}
                  aria-label={l.label ?? l.item}
                  disabled={!interactive}
                  onClick={interactive ? () => setPopup(l) : undefined}
                />
              ))
            : null}
          {children?.(rect)}
        </div>
      ) : null}
      {config.presetBar !== false && !children ? (
        <PresetBar
          ctx={ctx}
          lights={lights}
          toggleOff={config.presetToggleOff === true}
          onHeight={setBarH}
          spaceBelow={rect && rect.width > 0 ? Math.round(boxH - rect.top - rect.height) : 0}
        />
      ) : null}
      {popup ? <LightPopup light={popup} ctx={ctx} onClose={() => setPopup(null)} /> : null}
    </div>
  )
}

function FloorplanWidget({ config, ctx }: WidgetProps<FloorplanConfig>) {
  return (
    <WidgetFrame label={config.label}>
      <PlanCanvas config={config} ctx={ctx} />
    </WidgetFrame>
  )
}

export const floorplanWidget: WidgetDefinition<FloorplanConfig> = {
  type: 'floorplan',
  name: 'Floor plan',
  description: 'Lights glowing live on a plan of the house, with preset scenes',
  defaultSize: { w: 8, h: 6 },
  // the stacked floor, and the chips are part of it: a phone card sized for the plan alone puts
  // them over the rooms they switch
  minPixelHeight: (c) => (c.presetBar === false ? PLAN_FLOOR : PLAN_FLOOR + CHIP_ROW_ROOM),
  fixedShape: true,
  hasHeader: true,
  defaultConfig: () => ({ markers: true, presetBar: true, planStyle: 'blueprint' }),
  settings: [
    { key: 'label', type: 'text', label: 'Name' },
    { key: 'image', type: 'planimage', label: 'Plan image' },
    {
      key: 'planStyle',
      type: 'select',
      label: 'Plan style',
      options: [
        { value: 'blueprint', label: 'Blueprint (for dark themes)' },
        { value: 'ink', label: 'Ink (for light themes)' },
        { value: 'plain', label: 'As uploaded' }
      ],
      hint: 'Blueprint restyles any uploaded plan into light linework on the theme background; ink keeps dark lines. As uploaded shows the image untouched.'
    },
    { key: 'lights', type: 'planlights', label: 'Lights' },
    { key: 'markers', type: 'boolean', label: 'Show light markers' },
    { key: 'presetBar', type: 'boolean', label: 'Show preset chips' },
    {
      key: 'presetToggleOff',
      type: 'boolean',
      label: 'Turn the lights off when unselecting a preset',
      hint: 'Tapping the highlighted preset again switches off the lights it controls, instead of running it again. Other lights on the plan are left alone.',
      showIf: (c) => c.presetBar !== false
    },
    {
      key: 'glowScale',
      type: 'number',
      label: 'Glow size (%)',
      min: 25,
      max: 400,
      step: 5,
      hint: 'Scales every glow on this plan. 100 = normal.'
    }
  ],
  itemKeys: (c) => lightsOf(c).map((l) => l.item),
  canCommand: () => true,
  controlFor: (c, item) => (lightsOf(c).some((l) => l.item === item) ? { kind: 'auto' } : undefined),
  Component: FloorplanWidget
}
