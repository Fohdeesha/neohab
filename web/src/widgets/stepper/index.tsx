import { useEffect, useRef } from 'react'
import type { ComponentType } from 'react'
import { useTranslation } from 'react-i18next'
import type { WidgetDefinition, WidgetProps } from '../types'
import { WidgetFrame } from '../common/WidgetFrame'
import { parseChoices } from '../common/choices'
import { displayValue, ghostFor, isSegmentable, numericValue, splitValueUnit } from '../common/format'
import { numericScale, rangeControl } from '../common/itemControl'
import { useOptimisticValue } from '../common/useOptimisticValue'
import { ensureCatalog, useCatalogStore } from '../../store/catalog'
import {
  LOOK_FLOOR,
  MAX_DOTS,
  SEND_DELAY_MS,
  arrowsOf,
  atLimit,
  choiceIndex,
  closeEnough,
  finishOf,
  formatNumber,
  fractionOf,
  glyphFor,
  itemChoices,
  lookOf,
  modeOf,
  positionOf,
  positionsIn,
  stepIndex,
  stepNumber,
  wrapOf
} from './model'
import type { StepperArrows, StepperConfig, StepperLook } from './model'
import { CarouselLook, PairLook, RangeLook, SpinnerLook, SplitLook, StackLook } from './looks'
import type { StepperView } from './looks'

const LOOK_COMPONENTS: Record<StepperLook, ComponentType<{ view: StepperView }>> = {
  stack: StackLook,
  pair: PairLook,
  spinner: SpinnerLook,
  split: SplitLook,
  carousel: CarouselLook,
  range: RangeLook
}

function knownState(raw: unknown): string | null {
  return typeof raw === 'string' && raw !== 'NULL' && raw !== 'UNDEF' ? raw : null
}

function StepperWidget({ config, ctx }: WidgetProps<StepperConfig>) {
  const { t } = useTranslation()
  const look = lookOf(config.look)
  const finish = finishOf(config.finish)
  const mode = modeOf(config.mode)
  const arrows = arrowsOf(config.arrows)
  const wrap = wrapOf(config.wrap)
  const scale = numericScale(config.min, config.max, config.step)

  const manual = parseChoices(config.choices)
  const wantsCatalog = mode === 'list' && manual.length === 0 && typeof config.item === 'string' && config.item !== ''
  const catalogItem = useCatalogStore((s) => (wantsCatalog ? s.items.find((i) => i.name === config.item) : undefined))
  useEffect(() => {
    if (wantsCatalog) ensureCatalog()
  }, [wantsCatalog])
  const choices = manual.length > 0 ? manual : itemChoices(catalogItem)
  const n = choices.length

  const state = ctx.getItem(config.item)
  const liveNumber = numericValue(state)
  const live: string | null = mode === 'number' ? (liveNumber === undefined ? null : String(liveNumber)) : knownState(state?.state)
  const optimistic = useOptimisticValue<string | null>(live, live ?? '', (a, b) => closeEnough(a, b, mode, scale.step))
  const shown = optimistic.display

  const parsed = mode === 'number' && shown !== null ? Number(shown) : NaN
  const cur = Number.isFinite(parsed) ? parsed : undefined
  const idx = mode === 'list' ? choiceIndex(shown, choices) : -1

  const timer = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearTimeout(timer.current), [])
  const send = (command: string) => {
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      void ctx.sendCommand(config.item, command).then((accepted) => {
        if (!accepted) optimistic.cancel(command)
      })
    }, SEND_DELAY_MS)
  }

  const onStep = (dir: 1 | -1) => {
    if (ctx.editing || !config.item) return
    let next: string
    if (mode === 'number') {
      if (atLimit(cur, dir, scale)) return
      next = String(stepNumber(cur, dir, scale))
    } else {
      const j = stepIndex(idx, dir, n, wrap)
      if (j < 0 || j === idx) return
      next = choices[j].command
    }
    optimistic.commit(next)
    send(next)
  }

  const unit = (() => {
    if (mode !== 'number') return undefined
    if (typeof config.unit === 'string' && config.unit.trim() !== '') return config.unit
    if (typeof state?.unit === 'string' && state.unit !== '') return state.unit
    return splitValueUnit(displayValue(state, '')).unit
  })()
  const text = mode === 'number' ? formatNumber(cur, scale.step) : idx >= 0 ? choices[idx].label : (shown ?? '-')

  const positions = mode === 'number' ? positionsIn(scale) : n
  const position = mode === 'number' ? positionOf(cur, scale) : idx
  const dots =
    look === 'carousel'
      ? positions > 0 && positions <= MAX_DOTS
        ? positions
        : 0
      : look === 'range' && mode === 'list' && n > 0 && n <= MAX_DOTS
        ? n
        : 0
  const count =
    look === 'carousel' && dots === 0 && mode === 'list' && idx >= 0
      ? t('{{position}} of {{total}}', { position: idx + 1, total: n })
      : undefined
  const bounds: [string, string] | undefined =
    look !== 'range'
      ? undefined
      : mode === 'number'
        ? [formatNumber(scale.min, scale.step), formatNumber(scale.max, scale.step)]
        : n >= 2
          ? [choices[0].label, choices[n - 1].label]
          : undefined

  const arrowStyle: StepperArrows = look === 'carousel' && arrows === 'auto' ? 'chevron' : arrows

  const view: StepperView = {
    text,
    unit,
    ghost: mode === 'number' && isSegmentable(text) ? ghostFor(text) : undefined,
    isText: mode === 'list',
    atMin: mode === 'number' ? atLimit(cur, -1, scale) : n === 0 || (!wrap && idx === 0),
    atMax: mode === 'number' ? atLimit(cur, 1, scale) : n === 0 || (!wrap && idx === n - 1),
    onStep,
    glyph: (axis, dir) => glyphFor(arrowStyle, mode, axis, dir),
    labels: mode === 'list' ? { up: t('Next'), down: t('Previous') } : { up: t('Up'), down: t('Down') },
    fraction: mode === 'number' ? fractionOf(cur, scale) : n > 1 && idx >= 0 ? idx / (n - 1) : 0,
    dots,
    dotIndex: position,
    count,
    bounds
  }

  const Look = LOOK_COMPONENTS[look]
  return (
    <WidgetFrame label={config.label}>
      <div className={'nh-step nh-step--' + look + ' nh-step--' + finish}>
        {mode === 'list' && n === 0 ? (
          <div className="nh-step__empty">{t('No choices - set them in the widget settings')}</div>
        ) : (
          <Look view={view} />
        )}
      </div>
    </WidgetFrame>
  )
}

const isNumber = (c: Record<string, unknown>) => modeOf(c.mode) === 'number'
const isList = (c: Record<string, unknown>) => modeOf(c.mode) === 'list'

export const stepperWidget: WidgetDefinition<StepperConfig> = {
  type: 'stepper',
  name: 'Stepper',
  description: 'Step a number up and down, or cycle through a list',
  defaultSize: { w: 3, h: 3 },
  hasHeader: true,
  minPixelHeight: (c) => LOOK_FLOOR[lookOf(c.look)],
  defaultConfig: () => ({
    item: '',
    mode: 'number',
    look: 'spinner',
    finish: 'glow',
    arrows: 'auto',
    min: 0,
    max: 100,
    step: 1,
    wrap: false
  }),
  settings: [
    { key: 'item', type: 'item', label: 'openHAB Item' },
    { key: 'label', type: 'text', label: 'Name' },
    {
      key: 'look',
      type: 'select',
      label: 'Style',
      options: [
        { value: 'pair', label: 'Pair below' },
        { value: 'stack', label: 'Stack' },
        { value: 'spinner', label: 'Spinner' },
        { value: 'split', label: 'Split tile' },
        { value: 'carousel', label: 'Carousel' },
        { value: 'range', label: 'Range bar' }
      ]
    },
    {
      key: 'finish',
      type: 'select',
      label: 'Finish',
      options: [
        { value: 'plain', label: 'Plain' },
        { value: 'glass', label: 'Glass' },
        { value: 'glow', label: 'Glow' },
        { value: 'solid', label: 'Solid' },
        { value: 'sheen', label: 'Sheen' }
      ],
      hint: "Plain follows the theme. The others keep their own look in any theme, in the tile's accent color where one is set."
    },
    {
      key: 'arrows',
      type: 'select',
      label: 'Arrow style',
      options: [
        { value: 'auto', label: 'Automatic' },
        { value: 'chevron', label: 'Chevrons' },
        { value: 'triangle', label: 'Triangles' },
        { value: 'plusminus', label: 'Plus and minus' },
        { value: 'arrow', label: 'Straight arrows' }
      ],
      hint: 'Automatic uses plus and minus for a number and chevrons for a list.'
    },
    {
      key: 'mode',
      type: 'select',
      label: 'Value',
      options: [
        { value: 'number', label: 'Number' },
        { value: 'list', label: 'List of choices' }
      ],
      hint: "A number steps by the step size within its range. A list cycles through the choices below, or the item's own options when none are given."
    },
    { key: 'min', type: 'number', label: 'Minimum', showIf: isNumber },
    { key: 'max', type: 'number', label: 'Maximum', showIf: isNumber },
    { key: 'step', type: 'number', label: 'Step', showIf: isNumber },
    { key: 'unit', type: 'text', label: 'Unit suffix', showIf: isNumber },
    {
      key: 'choices',
      type: 'multiline',
      label: 'Choices (one per line, COMMAND=Label)',
      placeholder: 'HDMI1=Apple TV\nHDMI2=Xbox',
      showIf: isList,
      hint: "Leave empty to use the item's own options."
    },
    { key: 'wrap', type: 'boolean', label: 'Wrap around at the ends', showIf: isList }
  ],
  itemKeys: (c) => [c.item],
  canCommand: () => true,
  controlFor: (c, item) => {
    if (item !== c.item) return undefined
    if (modeOf(c.mode) === 'list') {
      const manual = parseChoices(c.choices)
      return manual.length > 0 ? { kind: 'choices', choices: manual } : { kind: 'auto' }
    }
    return rangeControl(numericScale(c.min, c.max, c.step), c.unit)
  },
  Component: StepperWidget
}
