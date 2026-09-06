import { useEffect, useRef, useState } from 'react'
import type { ComponentType, PointerEvent } from 'react'
import { useTranslation } from 'react-i18next'
import type { WidgetDefinition, WidgetProps } from '../types'
import { WidgetFrame } from '../common/WidgetFrame'
import { rangeControl, stepDecimals } from '../common/itemControl'
import type { ItemControl } from '../common/itemControl'
import { useOptimisticValue } from '../common/useOptimisticValue'
import { atLimit, fractionOf, stepNumber } from '../common/stepping'
import { holdTookGesture } from '../../components/useLongPress'
import { ensureCatalog, useCatalogStore } from '../../store/catalog'
import { useItemsStore } from '../../store/items'
import {
  DEFAULT_LOOK,
  LOOK_ARC,
  SEND_DELAY_MS,
  activityFrom,
  angleOfPoint,
  auxFrom,
  barOf,
  closeSetpoint,
  colorOf,
  commands,
  draggable,
  fanFrom,
  floorOf,
  formatCurrent,
  formatSetpoint,
  hasOwnRange,
  knownState,
  lookOf,
  modeFrom,
  onRing,
  rampColor,
  readTemp,
  sameState,
  scaleOf,
  statusOf,
  tempParts,
  toneOf,
  unitOf,
  valueAtAngle
} from './model'
import type { ThermostatConfig, ThermostatLook } from './model'
import { ArcLook, DialLook, DiscLook, Glyph, RingLook } from './looks'
import type { ThermoView } from './looks'

const LOOK_COMPONENTS: Record<ThermostatLook, ComponentType<{ view: ThermoView }>> = {
  arc: ArcLook,
  dial: DialLook,
  disc: DiscLook,
  ring: RingLook
}

function useCommanded(ctx: WidgetProps['ctx'], item: string | undefined) {
  const bound = typeof item === 'string' && item !== ''
  const live = knownState(bound ? ctx.getItem(item)?.state : undefined) ?? null
  const optimistic = useOptimisticValue<string | null>(live, live ?? '', (a, b) => a !== null && b !== null && sameState(a, b))
  const send = (command: string) => {
    if (!bound || ctx.editing) return
    optimistic.commit(command)
    void ctx.sendCommand(item, command).then((accepted) => {
      if (!accepted) optimistic.cancel(command)
    })
  }
  return { bound, state: optimistic.display ?? undefined, send }
}

function ThermostatWidget({ config, ctx }: WidgetProps<ThermostatConfig>) {
  const { t } = useTranslation()
  const look = lookOf(config.look)
  const arc = LOOK_ARC[look]
  const cmd = commands(config)

  const current = readTemp(ctx.getItem(config.currentItem))
  const sp = readTemp(ctx.getItem(config.setpointItem))
  const unit = unitOf(config.unit, sp.unit, current.unit)

  const setpointItem = typeof config.setpointItem === 'string' ? config.setpointItem : ''
  const wantsCatalog = setpointItem !== '' && !hasOwnRange(config)
  const catalogItem = useCatalogStore((s) => (wantsCatalog ? s.items.find((i) => i.name === setpointItem) : undefined))
  useEffect(() => {
    if (wantsCatalog) ensureCatalog()
  }, [wantsCatalog])
  const scale = scaleOf(config, catalogItem, unit)
  const decimals = stepDecimals(scale.step)

  const optimistic = useOptimisticValue<number | undefined>(sp.value, sp.value ?? 'none', (a, b) => closeSetpoint(a, b, scale.step))
  const [drag, setDrag] = useState<number | null>(null)
  const shown = drag ?? optimistic.display

  const timer = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearTimeout(timer.current), [])
  const sendSetpoint = (v: number, delay: number) => {
    window.clearTimeout(timer.current)
    const go = () => {
      void ctx.sendCommand(setpointItem, String(v)).then((accepted) => {
        if (!accepted) optimistic.cancel(v)
      })
    }
    if (delay > 0) timer.current = window.setTimeout(go, delay)
    else go()
  }

  const onStep = (dir: 1 | -1) => {
    if (ctx.editing || setpointItem === '') return
    if (atLimit(shown, dir, scale)) return
    const next = stepNumber(shown, dir, scale)
    optimistic.commit(next)
    sendSetpoint(next, SEND_DELAY_MS)
  }

  const svgRef = useRef<SVGSVGElement | null>(null)
  const valueAtPointer = (e: PointerEvent<SVGSVGElement>): { value: number; onBand: boolean } => {
    const rect = svgRef.current!.getBoundingClientRect()
    const cx = rect.left + rect.width / 2
    const cy = rect.top + rect.height / 2
    const dist = Math.hypot(e.clientX - cx, e.clientY - cy) / (rect.width / 2)
    const angle = angleOfPoint(cx, cy, e.clientX, e.clientY)
    return { value: valueAtAngle(angle, arc, scale), onBand: onRing(dist, angle, look) }
  }
  const onPointerDown = (e: PointerEvent<SVGSVGElement>) => {
    if (ctx.editing || setpointItem === '' || !draggable(look)) return
    if (e.pointerType === 'mouse' && e.button !== 0) return
    const at = valueAtPointer(e)
    if (!at.onBand) return
    ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
    setDrag(at.value)
  }
  const onPointerMove = (e: PointerEvent<SVGSVGElement>) => {
    if (drag !== null) setDrag(valueAtPointer(e).value)
  }
  const onPointerUp = () => {
    if (drag === null) return
    const v = drag
    setDrag(null)
    if (holdTookGesture()) return
    optimistic.commit(v)
    sendSetpoint(v, 0)
  }

  const mode = useCommanded(ctx, config.modeItem)
  const fan = useCommanded(ctx, config.fanItem)
  const aux = useCommanded(ctx, config.auxItem)
  const hvac = modeFrom(mode.state, config)
  const fanMode = fanFrom(fan.state, config)
  const auxOn = auxFrom(aux.state, config)
  const activity = activityFrom(knownState(config.statusItem ? ctx.getItem(config.statusItem)?.state : undefined), config)
  const tone = toneOf(hvac, activity)
  const status = statusOf(hvac, activity, mode.state)
  const statusText =
    status.kind === 'heating'
      ? t('Heating')
      : status.kind === 'cooling'
        ? t('Cooling')
        : status.kind === 'idle'
          ? t('Idle')
          : status.kind === 'heat'
            ? t('Heat')
            : status.kind === 'cool'
              ? t('Cool')
              : status.kind === 'raw'
                ? status.text
                : undefined

  const bar = barOf(config)
  const setText = formatSetpoint(shown, scale.step)
  const curText = formatCurrent(current, scale.step)
  const setKnown = shown !== undefined && Number.isFinite(shown)
  const setFraction = fractionOf(shown, scale)
  const view: ThermoView = {
    look,
    tone,
    setpoint: { text: setText, parts: tempParts(setText), known: setKnown },
    current: { text: curText, parts: tempParts(curText), known: current.value !== undefined },
    unit,
    status: statusText,
    fraction: setFraction,
    currentFraction: current.value === undefined ? undefined : fractionOf(current.value, scale),
    ramped: tone === 'neutral',
    arc,
    atMin: atLimit(shown, -1, scale),
    atMax: atLimit(shown, 1, scale),
    onStep,
    ring: { ref: svgRef, onPointerDown, onPointerMove, onPointerUp, onPointerCancel: () => setDrag(null), dragging: drag !== null },
    mode: hvac,
    activity,
    labels: {
      up: t('Raise the setpoint'),
      down: t('Lower the setpoint'),
      ambient: t('Ambient'),
      set: t('Set'),
      mode: t('Mode'),
      current: t('Current temperature')
    }
  }

  const Look = LOOK_COMPONENTS[look]
  const style: Record<string, string> = {}
  const heat = colorOf(config.heatColor)
  const cool = colorOf(config.coolColor)
  if (heat) style['--th-heat'] = heat
  if (cool) style['--th-cool'] = cool
  if (setKnown) style['--th-temp'] = rampColor(setFraction)
  const configured = (typeof config.currentItem === 'string' && config.currentItem !== '') || setpointItem !== ''

  return (
    <WidgetFrame label={config.label}>
      <div className={'nh-thermo nh-thermo--' + look + ' nh-thermo--' + tone + (decimals > 0 ? ' nh-thermo--frac' : '')} style={style}>
        {!configured ? (
          <div className="nh-thermo__empty">{t('No items configured')}</div>
        ) : (
          <>
            <div className="nh-thermo__face">
              <Look view={view} />
            </div>
            {bar.any ? (
              <div className="nh-thermo__bar">
                {bar.mode ? (
                  <div className="nh-thermo__seg" role="group" aria-label={t('Mode')}>
                    <button
                      type="button"
                      className={'nh-thermo__mbtn nh-thermo__mbtn--heat' + (hvac === 'heat' ? ' nh-thermo__mbtn--on' : '')}
                      aria-pressed={hvac === 'heat'}
                      onClick={() => mode.send(cmd.heat)}>
                      <Glyph name="flame" />
                      <span className="nh-thermo__mtext">{t('Heat')}</span>
                    </button>
                    <button
                      type="button"
                      className={'nh-thermo__mbtn nh-thermo__mbtn--cool' + (hvac === 'cool' ? ' nh-thermo__mbtn--on' : '')}
                      aria-pressed={hvac === 'cool'}
                      onClick={() => mode.send(cmd.cool)}>
                      <Glyph name="snow" />
                      <span className="nh-thermo__mtext">{t('Cool')}</span>
                    </button>
                  </div>
                ) : null}
                {bar.fan ? (
                  <div className="nh-thermo__seg" role="group" aria-label={t('Fan')}>
                    <button
                      type="button"
                      className={'nh-thermo__mbtn nh-thermo__mbtn--fan' + (fanMode === 'auto' ? ' nh-thermo__mbtn--on' : '')}
                      aria-pressed={fanMode === 'auto'}
                      onClick={() => fan.send(cmd.fanAuto)}>
                      <Glyph name="fanAuto" />
                      <span className="nh-thermo__mtext">{t('Auto')}</span>
                    </button>
                    <button
                      type="button"
                      className={'nh-thermo__mbtn nh-thermo__mbtn--fan' + (fanMode === 'on' ? ' nh-thermo__mbtn--on' : '')}
                      aria-pressed={fanMode === 'on'}
                      onClick={() => fan.send(cmd.fanOn)}>
                      <Glyph name="fan" />
                      <span className="nh-thermo__mtext">{t('On')}</span>
                    </button>
                  </div>
                ) : null}
                {bar.aux ? (
                  <button
                    type="button"
                    className={'nh-thermo__mbtn nh-thermo__mbtn--aux' + (auxOn ? ' nh-thermo__mbtn--on' : '')}
                    aria-pressed={auxOn === true}
                    onClick={() => aux.send(auxOn ? cmd.auxOff : cmd.auxOn)}>
                    <Glyph name="aux" />
                    <span className="nh-thermo__mtext">{t('Aux heat')}</span>
                  </button>
                ) : null}
              </div>
            ) : null}
          </>
        )}
      </div>
    </WidgetFrame>
  )
}

const hasMode = (c: Record<string, unknown>) => barOf(c).mode
const hasFan = (c: Record<string, unknown>) => barOf(c).fan
const hasAux = (c: Record<string, unknown>) => barOf(c).aux
const hasStatus = (c: Record<string, unknown>) => typeof c.statusItem === 'string' && c.statusItem !== ''

function sheetScale(c: ThermostatConfig) {
  const item = typeof c.setpointItem === 'string' ? c.setpointItem : ''
  const live = item ? useItemsStore.getState().states[item] : undefined
  const reading = readTemp(live)
  const catalogItem = item && !hasOwnRange(c) ? useCatalogStore.getState().items.find((i) => i.name === item) : undefined
  return scaleOf(c, catalogItem, unitOf(c.unit, reading.unit))
}

export const thermostatWidget: WidgetDefinition<ThermostatConfig> = {
  type: 'thermostat',
  name: 'Thermostat',
  description: 'Room temperature and setpoint, with mode, fan and auxiliary heat',
  defaultSize: { w: 3, h: 3 },
  hasHeader: true,
  minPixelHeight: floorOf,
  defaultConfig: () => ({ currentItem: '', setpointItem: '', look: DEFAULT_LOOK }),
  settings: [
    { key: 'currentItem', type: 'item', label: 'Current temperature item', itemTypes: ['Number'], readOnly: true },
    { key: 'setpointItem', type: 'item', label: 'Setpoint item', itemTypes: ['Number', 'Dimmer'] },
    { key: 'label', type: 'text', label: 'Name' },
    {
      key: 'look',
      type: 'select',
      label: 'Style',
      options: [
        { value: 'arc', label: 'Arc with buttons' },
        { value: 'dial', label: 'Solid dial' },
        { value: 'disc', label: 'Disc with markers' },
        { value: 'ring', label: 'Ring' }
      ]
    },
    { key: 'modeItem', type: 'item', label: 'Mode item', hint: 'Heat or cool. Leave empty to hide the mode buttons.' },
    { key: 'heatCommand', type: 'text', label: 'Heat command', placeholder: 'HEAT', showIf: hasMode },
    { key: 'coolCommand', type: 'text', label: 'Cool command', placeholder: 'COOL', showIf: hasMode },
    { key: 'fanItem', type: 'item', label: 'Fan item', hint: 'Auto or on. Leave empty to hide the fan buttons.' },
    { key: 'fanAutoCommand', type: 'text', label: 'Fan auto command', placeholder: 'AUTO', showIf: hasFan },
    { key: 'fanOnCommand', type: 'text', label: 'Fan on command', placeholder: 'ON', showIf: hasFan },
    { key: 'auxItem', type: 'item', label: 'Auxiliary heat item', hint: 'Leave empty to hide the aux button.' },
    { key: 'auxOnCommand', type: 'text', label: 'Aux on command', placeholder: 'ON', showIf: hasAux },
    { key: 'auxOffCommand', type: 'text', label: 'Aux off command', placeholder: 'OFF', showIf: hasAux },
    {
      key: 'statusItem',
      type: 'item',
      label: 'Status item',
      readOnly: true,
      hint: 'What the system is doing now, if your thermostat reports it. The panel then says Heating, Cooling or Idle.'
    },
    { key: 'heatingStates', type: 'text', label: 'States that mean heating', placeholder: 'heating, HEATING, 1', showIf: hasStatus },
    { key: 'coolingStates', type: 'text', label: 'States that mean cooling', placeholder: 'cooling, COOLING, 2', showIf: hasStatus },
    {
      key: 'min',
      type: 'number',
      label: 'Minimum',
      hint: "Leave the range empty to use the item's own, or 10-30 by 0.5 for Celsius and 50-90 by 1 for Fahrenheit."
    },
    { key: 'max', type: 'number', label: 'Maximum' },
    { key: 'step', type: 'number', label: 'Step' },
    { key: 'unit', type: 'text', label: 'Unit suffix', hint: 'Leave empty to use the unit the items report.' },
    { key: 'heatColor', type: 'color', label: 'Heating color' },
    { key: 'coolColor', type: 'color', label: 'Cooling color' }
  ],
  itemKeys: (c) => [c.currentItem, c.setpointItem, c.modeItem ?? '', c.fanItem ?? '', c.auxItem ?? '', c.statusItem ?? ''],
  canCommand: () => true,
  controlFor: (c, item): ItemControl | undefined => {
    if (item === '') return undefined
    const cmd = commands(c)
    if (item === c.setpointItem) return rangeControl(sheetScale(c), c.unit)
    if (item === c.modeItem) {
      return {
        kind: 'choices',
        choices: [
          { command: cmd.heat, labelKey: 'Heat' },
          { command: cmd.cool, labelKey: 'Cool' }
        ]
      }
    }
    if (item === c.fanItem) {
      return {
        kind: 'choices',
        choices: [
          { command: cmd.fanAuto, labelKey: 'Auto' },
          { command: cmd.fanOn, labelKey: 'On' }
        ]
      }
    }
    if (item === c.auxItem) return { kind: 'onoff', on: cmd.auxOn, off: cmd.auxOff }
    return undefined
  },
  Component: ThermostatWidget
}
