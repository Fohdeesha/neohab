/**
 * Floor plan widget - the house on an uploaded plan image, each light glowing live in its
 * color. The image supplies geometry; the styling pipeline (grayscale/invert/tint classes)
 * makes any upload sit in the theme, and the glow layer blends additively over it the way
 * real light does. Tap a light for its control popup; preset chips activate openHAB scenes.
 *
 * Light placement happens in the settings panel's "Edit lights" sheet (edit mode taps select
 * the widget, so the widget surface itself cannot host placement).
 */
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { WidgetDefinition, WidgetProps } from '../types'
import { WidgetFrame } from '../common/WidgetFrame'
import { useBoxSize } from '../../components/useBoxSize'
import { useConfigStore } from '../../store/config'
import { resolveBackgroundRef } from '../../model/background'
import {
  containRect,
  DEFAULT_GLOW_SIZE,
  glowCss,
  glowFor,
  glowScaleOf,
  lightsOf,
  planStyleOf,
  type FloorplanConfig,
  type FloorplanLight,
} from './model'
import { LightPopup } from './LightPopup'
import { PresetBar } from './PresetBar'

export function PlanCanvas({
  config,
  ctx,
  children,
  onPlanPointerDown,
}: {
  config: FloorplanConfig
  ctx: WidgetProps<FloorplanConfig>['ctx']
  /** Extra layer content (the editor sheet's draggable markers) rendered inside the plan rect. */
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

  const lights = lightsOf(config)
  const scale = glowScaleOf(config)
  const rect = img ? containRect(boxW, boxH, img.w, img.h) : null
  const interactive = !ctx.editing && !children

  return (
    <div className="nh-fplan" ref={boxRef}>
      {src ? (
        <img
          className={'nh-fplan__img nh-fplan__img--' + planStyleOf(config)}
          src={src}
          alt=""
          draggable={false}
          onLoad={(e) => setImg({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
        />
      ) : (
        <p className="nh-fplan__empty">{t('No plan image yet — pick one in the widget settings.')}</p>
      )}
      {rect && rect.width > 0 ? (
        <div
          className="nh-fplan__layer"
          style={{ left: rect.left, top: rect.top, width: rect.width, height: rect.height }}
          onPointerDown={onPlanPointerDown ? (e) => onPlanPointerDown(e, rect) : undefined}
        >
          {lights.map((l) => {
            const glow = glowFor(ctx.getItem(l.item)?.state)
            if (!glow || glow.intensity <= 0) return null
            const size = (l.size ?? DEFAULT_GLOW_SIZE) * scale
            return (
              <span
                key={'g' + l.id}
                className="nh-fplan__glow"
                style={{ left: `${l.x}%`, top: `${l.y}%`, width: `${size}%`, backgroundImage: glowCss(glow) }}
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
        // Anchored just under the plan, not the widget: a heavily letterboxed plan (tall
        // stacked rows on phones) would otherwise leave the chips floating far below it.
        <PresetBar
          ctx={ctx}
          lights={lights}
          bottom={rect && rect.width > 0 ? Math.max(8, Math.round(boxH - rect.top - rect.height) - 44) : 8}
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
  minPixelHeight: 220,
  hasHeader: true,
  // planStyle carries its default here as well as in planStyleOf: a select whose value resolves
  // to nothing renders blank, which reads as broken next to a plan that is plainly styled.
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
        { value: 'plain', label: 'As uploaded' },
      ],
      hint: 'Blueprint restyles any uploaded plan into light linework on the theme background; ink keeps dark lines. As uploaded shows the image untouched.',
    },
    { key: 'lights', type: 'planlights', label: 'Lights' },
    { key: 'markers', type: 'boolean', label: 'Show light markers' },
    { key: 'presetBar', type: 'boolean', label: 'Show preset chips' },
    {
      key: 'glowScale',
      type: 'number',
      label: 'Glow size (%)',
      min: 25,
      max: 400,
      step: 5,
      hint: 'Scales every glow on this plan. 100 = normal.',
    },
  ],
  itemKeys: (c) => lightsOf(c).map((l) => l.item),
  Component: FloorplanWidget,
}
