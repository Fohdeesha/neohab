/**
 * The dial widget: a circular control that can be drawn six ways.
 *
 * The two renderers live beside this file - `ClassicDial` is the original arc slider, `RingGauge`
 * the instrument family (LED beads, tick ring, solid arc, blocks, clay 3D). This module is the
 * definition: which renderer to use, and the settings schema that drives both. The pure model
 * they share is in `gauge.ts`, and the geometry in `geometry.ts`.
 */
import type { WidgetDefinition, WidgetProps } from '../types'
import { ClassicDial } from './ClassicDial'
import { RingGauge } from './RingGauge'
import type { DialConfig } from './gauge'

function DialWidget(props: WidgetProps<DialConfig>) {
  const s: string | undefined = props.config.style
  return s && s !== 'classic' ? <RingGauge {...props} /> : <ClassicDial {...props} />
}

const RING_STYLES = ['led', 'ticks', 'arc', 'blocks', '3d']
const ring = (c: Record<string, unknown>) => RING_STYLES.includes(c.style as string)
/** The arc style has no discrete segments, so segment-only fields hide there. */
const segmented = (c: Record<string, unknown>) => ring(c) && c.style !== 'arc'
const ringTicks = (c: Record<string, unknown>) => ring(c) && c.showTicks === true
const ringAlarm = (c: Record<string, unknown>) => ring(c) && c.alarm === true
const ringInner = (c: Record<string, unknown>) => ring(c) && typeof c.item2 === 'string' && c.item2 !== ''
const ringHistory = (c: Record<string, unknown>) => ring(c) && c.history === true

export const dialWidget: WidgetDefinition<DialConfig> = {
  type: 'dial',
  name: 'Dial',
  description: 'Circular slider or gauge, in several looks, for numeric items',
  defaultSize: { w: 3, h: 4 },
  hasHeader: true,
  defaultConfig: () => ({
    item: '',
    style: 'classic',
    min: 0,
    max: 100,
    step: 1,
    showTickLabels: true,
    centerShows: 'outer',
    historyPeriod: '24h',
    historyStyle: 'bars',
  }),
  settings: [
    { key: 'item', type: 'item', label: 'openHAB Item', itemTypes: ['Dimmer', 'Number'] },
    { key: 'label', type: 'text', label: 'Name' },
    { key: 'icon', type: 'icon', label: 'Icon' },
    { key: 'iconColor', type: 'color', label: 'Icon color (mono icons)' },
    { key: 'iconSize', type: 'number', label: 'Icon size', min: 16, max: 128 },
    {
      key: 'style',
      type: 'select',
      label: 'Style',
      options: [
        { value: 'classic', label: 'Classic arc' },
        { value: 'led', label: 'LED ring' },
        { value: 'ticks', label: 'Tick ring' },
        { value: 'arc', label: 'Solid arc' },
        { value: 'blocks', label: 'Blocks' },
        { value: '3d', label: '3D' },
      ],
    },
    { key: 'min', type: 'number', label: 'Minimum' },
    { key: 'max', type: 'number', label: 'Maximum' },
    { key: 'step', type: 'number', label: 'Step' },
    { key: 'unit', type: 'text', label: 'Unit suffix' },
    {
      key: 'showMax',
      type: 'boolean',
      label: 'Maximum beside the value',
      showIf: ring,
      hint: 'Draws the reading over its scale maximum: "39 / 58".',
    },
    { key: 'readOnly', type: 'boolean', label: 'Read-only gauge' },
    { key: 'ledCount', type: 'number', label: 'Segments', min: 8, max: 200, showIf: segmented },
    {
      key: 'arcSweep',
      type: 'number',
      label: 'Arc sweep (degrees)',
      min: 30,
      max: 360,
      showIf: ring,
      hint: '360 is a full circle, 180 a half gauge.',
    },
    {
      key: 'arcStart',
      type: 'number',
      label: 'Arc start (degrees)',
      min: 0,
      max: 359,
      showIf: ring,
      hint: 'Measured clockwise from 12 o’clock.',
    },
    {
      key: 'bidirectional',
      type: 'boolean',
      label: 'Fill from zero (bidirectional)',
      showIf: ring,
      hint: 'Lights from zero - or the range midpoint - toward the value.',
    },
    {
      key: 'color',
      type: 'color',
      label: 'Color',
      showIf: ring,
      hint: 'Used when no color stop matches; clear it to follow the theme.',
    },
    { key: 'severity', type: 'gaugeseverity', label: 'Color stops', showIf: ring },
    {
      key: 'centerLabel',
      type: 'boolean',
      label: 'Name inside the face',
      showIf: ring,
      hint: 'Draws the Name above the reading instead of in the tile header.',
    },
    { key: 'bloom', type: 'boolean', label: 'Center glow', showIf: ring },
    { key: 'hideUnlit', type: 'boolean', label: 'Hide unlit LEDs', showIf: segmented },
    { key: 'showTicks', type: 'boolean', label: 'Scale ticks', showIf: ring },
    { key: 'tickSteps', type: 'number', label: 'Scale steps', min: 1, max: 20, showIf: ringTicks },
    { key: 'showTickLabels', type: 'boolean', label: 'Scale labels', showIf: ringTicks },
    { key: 'markers', type: 'gaugemarkers', label: 'Markers', showIf: ring },
    { key: 'zones', type: 'gaugezones', label: 'Zones', showIf: ring },
    {
      key: 'alarm',
      type: 'boolean',
      label: 'Alarm pulse',
      showIf: ring,
      hint: 'The center glow pulses while the value is inside the alarm range.',
    },
    { key: 'alarmFrom', type: 'number', label: 'Alarm from', showIf: ringAlarm },
    { key: 'alarmTo', type: 'number', label: 'Alarm to', showIf: ringAlarm },
    {
      key: 'history',
      type: 'boolean',
      label: 'History chart',
      showIf: ring,
      hint: 'A small chart of recent history under the value, from persistence.',
    },
    {
      key: 'historyStyle',
      type: 'select',
      label: 'History style',
      options: [
        { value: 'bars', label: 'Bars' },
        { value: 'line', label: 'Sparkline' },
      ],
      showIf: ringHistory,
    },
    {
      key: 'historyPeriod',
      type: 'select',
      label: 'History window',
      options: [
        { value: '1h', label: '1h' },
        { value: '6h', label: '6h' },
        { value: '12h', label: '12h' },
        { value: '24h', label: '24h' },
        { value: '7d', label: '7d' },
      ],
      showIf: ringHistory,
    },
    {
      key: 'item2',
      type: 'item',
      label: 'Second item (inner ring)',
      itemTypes: ['Dimmer', 'Number'],
      showIf: ring,
      hint: 'Set an item to draw a second, inner ring - the dual gauge.',
    },
    { key: 'min2', type: 'number', label: 'Inner minimum', showIf: ringInner },
    { key: 'max2', type: 'number', label: 'Inner maximum', showIf: ringInner },
    { key: 'step2', type: 'number', label: 'Inner step', showIf: ringInner },
    { key: 'unit2', type: 'text', label: 'Inner unit suffix', showIf: ringInner },
    { key: 'color2', type: 'color', label: 'Inner color', showIf: ringInner },
    { key: 'severity2', type: 'gaugeseverity', label: 'Inner color stops', showIf: ringInner },
    { key: 'bidirectional2', type: 'boolean', label: 'Inner fill from zero (bidirectional)', showIf: ringInner },
    {
      key: 'centerShows',
      type: 'select',
      label: 'Big center value',
      options: [
        { value: 'outer', label: 'Outer item' },
        { value: 'inner', label: 'Inner item' },
      ],
      showIf: ringInner,
    },
  ],
  itemKeys: (c) => [
    c.item,
    ...(typeof c.item2 === 'string' && c.item2 !== '' ? [c.item2] : []),
    ...(Array.isArray(c.markers) ? c.markers : []).map((m) => m?.item).filter((s): s is string => typeof s === 'string' && s !== ''),
  ],
  Component: DialWidget,
}
