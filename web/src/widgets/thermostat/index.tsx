/**
 * Thermostat: the room's temperature and the setpoint, with buttons to move the setpoint, and
 * a row of buttons for the mode (heat or cool), the fan (auto or on) and auxiliary heat.
 *
 * Four looks draw the same state: an arc with a draggable handle and the buttons in its gap, a
 * solid dial in the mode's colour ringed with ticks, a disc with both temperatures marked on its
 * rim, and a ring around a plate of readings. Every item is a setting of its own, so a widget
 * can be as small as a temperature and a setpoint or carry all six.
 *
 * A press shows its result at once and sends it a moment later, so a run of taps costs the
 * device one command carrying the last value; a drag round the ring sends on release, the way
 * the dial does. The optimistic layer then holds the value until the device confirms it.
 */
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

/**
 * One commanded item's state with the optimistic layer over it: a press shows its result at
 * once and the display holds it until the device confirms. `sendCommand` never rejects, and a
 * refusal drops the shown value, so a mode the server would not take does not sit on screen.
 */
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

  // The range comes from the widget's own settings where they are set, else from what the
  // setpoint item declares about itself - which the live state stream does not carry, so the
  // catalog is fetched only when that is needed.
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

  // One command per run of presses: each press updates the reading, and the command carrying
  // the last value goes out once the presses stop. A drag sends on release, at once.
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

  // The ring. A press on the band around the face stages the setpoint under the pointer and the
  // release sends it; a press on the face inside does nothing, so a hold there still opens the
  // sheet and a tap in the middle moves nothing.
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
    // A press stages the value under the pointer and this release sends it - unless a hold was
    // recognised first, in which case the press was the gesture and the setpoint keeps its value.
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
  // The colour of the temperature this thermostat is SET to. A face with no mode and nothing
  // running takes it (see `.nh-thermo--neutral` in app.css) instead of sitting in the theme's
  // accent, so the arc's fill and the ring's rim say how warm the setting is. Left unset when
  // there is no setpoint to colour by, and the accent stands.
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

/**
 * The setpoint's scale for the detail sheet, from the same rule the tile uses. The sheet has no
 * render to read the unit from, so the item's live state and the catalog are read directly; in
 * a unit check both are empty and the Celsius defaults answer, which is what the tile would draw
 * before its first state arrived.
 */
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
  // Every select's default is carried here as well as in its reader: a select whose value
  // resolves to nothing renders blank, and the registry check for that reads this.
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
  // The widget's own controls, wherever they are drawn: the setpoint on its own scale, the mode
  // and the fan as the two commands each was given, aux as on and off. The room's temperature
  // and the status item are read and never written, so a hold offers nothing for them.
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
