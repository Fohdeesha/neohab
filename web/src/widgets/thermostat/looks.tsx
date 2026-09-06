/**
 * The four looks of the thermostat, drawn from one view of its state.
 *
 * Every look is the same readings and the same two setpoint buttons arranged differently, so the
 * parts are written once (`Temp`, `StepButton`, `Glyph`) and each look is only its face. What a
 * press or a drag does lives in the widget, which hands the looks their handlers; nothing here
 * decides a value.
 *
 * Each face is a square: an SVG for the geometry (arc, ticks, markers, handle) with HTML laid over
 * it for the text and the buttons, so the words go through the catalogs and take the theme's
 * font, and the sizes follow the square through container units.
 */
import type { PointerEvent, RefObject } from 'react'
import { arcPath, polar } from '../dial/geometry'
import { angleFor, rampColor, ticksOf } from './model'
import type { Activity, HvacMode, TempParts, ThermostatLook, Tone } from './model'

export interface RingHandlers {
  ref: RefObject<SVGSVGElement | null>
  onPointerDown: (e: PointerEvent<SVGSVGElement>) => void
  onPointerMove: (e: PointerEvent<SVGSVGElement>) => void
  onPointerUp: () => void
  onPointerCancel: () => void
  /** True while the setpoint is being dragged round the ring. */
  dragging: boolean
}

export interface ThermoView {
  look: ThermostatLook
  tone: Tone
  setpoint: { text: string; parts: TempParts; known: boolean }
  current: { text: string; parts: TempParts; known: boolean }
  unit?: string
  /** The status line, already translated; undefined when there is nothing to say. */
  status?: string
  /** Where the setpoint and the room's temperature sit on the scale, 0..1. */
  fraction: number
  currentFraction?: number
  /**
   * Colour the scale by temperature: cool at the bottom of the range, warm at the top. On for a
   * face with no mode and nothing running, where the alternative is a ring of white ticks that
   * says nothing; off where the face is already a solid heating or cooling colour, which is what
   * the reference thermostats do and what white ticks are legible on.
   */
  ramped: boolean
  arc: { start: number; sweep: number }
  atMin: boolean
  atMax: boolean
  onStep: (dir: 1 | -1) => void
  ring: RingHandlers
  mode: HvacMode
  activity: Activity
  /** Accessible names and captions, already translated. */
  labels: { up: string; down: string; ambient: string; set: string; mode: string; current: string }
}

/* ------------------------------------------------------------------ *
 * Shared parts
 * ------------------------------------------------------------------ */

/* Glyphs from Material Design Icons (Apache-2.0, bundled and attributed under icons/mdi), inlined
   so they size in em with the text beside them and need no asset fetch. Keyed by values this
   module chose itself - a bare index is fine here. */
const GLYPHS: Record<'flame' | 'snow' | 'fan' | 'fanAuto' | 'thermometer' | 'leaf' | 'aux', string> = {
  flame:
    'M17.66 11.2C17.43 10.9 17.15 10.64 16.89 10.38C16.22 9.78 15.46 9.35 14.82 8.72C13.33 7.26 13 4.85 13.95 3C13 3.23 12.17 3.75 11.46 4.32C8.87 6.4 7.85 10.07 9.07 13.22C9.11 13.32 9.15 13.42 9.15 13.55C9.15 13.77 9 13.97 8.8 14.05C8.57 14.15 8.33 14.09 8.14 13.93C8.08 13.88 8.04 13.83 8 13.76C6.87 12.33 6.69 10.28 7.45 8.64C5.78 10 4.87 12.3 5 14.47C5.06 14.97 5.12 15.47 5.29 15.97C5.43 16.57 5.7 17.17 6 17.7C7.08 19.43 8.95 20.67 10.96 20.92C13.1 21.19 15.39 20.8 17.03 19.32C18.86 17.66 19.5 15 18.56 12.72L18.43 12.46C18.22 12 17.66 11.2 17.66 11.2M14.5 17.5C14.22 17.74 13.76 18 13.4 18.1C12.28 18.5 11.16 17.94 10.5 17.28C11.69 17 12.4 16.12 12.61 15.23C12.78 14.43 12.46 13.77 12.33 13C12.21 12.26 12.23 11.63 12.5 10.94C12.69 11.32 12.89 11.7 13.13 12C13.9 13 15.11 13.44 15.37 14.8C15.41 14.94 15.43 15.08 15.43 15.23C15.46 16.05 15.1 16.95 14.5 17.5H14.5Z',
  snow: 'M20.79,13.95L18.46,14.57L16.46,13.44V10.56L18.46,9.43L20.79,10.05L21.31,8.12L19.54,7.65L20,5.88L18.07,5.36L17.45,7.69L15.45,8.82L13,7.38V5.12L14.71,3.41L13.29,2L12,3.29L10.71,2L9.29,3.41L11,5.12V7.38L8.5,8.82L6.5,7.69L5.92,5.36L4,5.88L4.47,7.65L2.7,8.12L3.22,10.05L5.55,9.43L7.55,10.56V13.45L5.55,14.58L3.22,13.96L2.7,15.89L4.47,16.36L4,18.12L5.93,18.64L6.55,16.31L8.55,15.18L11,16.62V18.88L9.29,20.59L10.71,22L12,20.71L13.29,22L14.7,20.59L13,18.88V16.62L15.5,15.17L17.5,16.3L18.12,18.63L20,18.12L19.53,16.35L21.3,15.88L20.79,13.95M9.5,10.56L12,9.11L14.5,10.56V13.44L12,14.89L9.5,13.44V10.56Z',
  fan: 'M12,11A1,1 0 0,0 11,12A1,1 0 0,0 12,13A1,1 0 0,0 13,12A1,1 0 0,0 12,11M12.5,2C17,2 17.11,5.57 14.75,6.75C13.76,7.24 13.32,8.29 13.13,9.22C13.61,9.42 14.03,9.73 14.35,10.13C18.05,8.13 22.03,8.92 22.03,12.5C22.03,17 18.46,17.1 17.28,14.73C16.78,13.74 15.72,13.3 14.79,13.11C14.59,13.59 14.28,14 13.88,14.34C15.87,18.03 15.08,22 11.5,22C7,22 6.91,18.42 9.27,17.24C10.25,16.75 10.69,15.71 10.89,14.79C10.4,14.59 9.97,14.27 9.65,13.87C5.96,15.85 2,15.07 2,11.5C2,7 5.56,6.89 6.74,9.26C7.24,10.25 8.29,10.68 9.22,10.87C9.41,10.39 9.73,9.97 10.14,9.65C8.15,5.96 8.94,2 12.5,2Z',
  fanAuto:
    'M12.5 2C8.93 2 8.14 5.96 10.13 9.65C9.72 9.97 9.4 10.39 9.21 10.87C8.28 10.68 7.23 10.25 6.73 9.26C5.56 6.89 2 7 2 11.5C2 15.07 5.95 15.85 9.64 13.87C9.96 14.27 10.39 14.59 10.88 14.79C10.68 15.71 10.24 16.75 9.26 17.24C6.9 18.42 7 22 11.5 22C12.31 22 13 21.78 13.5 21.41C13.19 20.67 13 19.86 13 19C13 17.59 13.5 16.3 14.3 15.28C14.17 14.97 14.03 14.65 13.86 14.34C14.26 14 14.57 13.59 14.77 13.11C15.26 13.21 15.78 13.39 16.25 13.67C17.07 13.25 18 13 19 13C20.05 13 21.03 13.27 21.89 13.74C21.95 13.37 22 12.96 22 12.5C22 8.92 18.03 8.13 14.33 10.13C14 9.73 13.59 9.42 13.11 9.22C13.3 8.29 13.74 7.24 14.73 6.75C17.09 5.57 17 2 12.5 2M12 11C12.54 11 13 11.45 13 12C13 12.55 12.54 13 12 13C11.43 13 11 12.55 11 12C11 11.45 11.43 11 12 11M18 15C16.89 15 16 15.9 16 17V23H18V21H20V23H22V17C22 15.9 21.1 15 20 15M18 17H20V19H18Z',
  thermometer: 'M15 13V5A3 3 0 0 0 9 5V13A5 5 0 1 0 15 13M12 4A1 1 0 0 1 13 5V8H11V5A1 1 0 0 1 12 4Z',
  leaf: 'M17,8C8,10 5.9,16.17 3.82,21.34L5.71,22L6.66,19.7C7.14,19.87 7.64,20 8,20C19,20 22,3 22,3C21,5 14,5.25 9,6.25C4,7.25 2,11.5 2,13.5C2,15.5 3.75,17.25 3.75,17.25C7,8 17,8 17,8Z',
  aux: 'M7.95,3L6.53,5.19L7.95,7.4H7.94L5.95,10.5L4.22,9.6L5.64,7.39L4.22,5.19L6.22,2.09L7.95,3M13.95,2.89L12.53,5.1L13.95,7.3L13.94,7.31L11.95,10.4L10.22,9.5L11.64,7.3L10.22,5.1L12.22,2L13.95,2.89M20,2.89L18.56,5.1L20,7.3V7.31L18,10.4L16.25,9.5L17.67,7.3L16.25,5.1L18.25,2L20,2.89M2,22V14A2,2 0 0,1 4,12H20A2,2 0 0,1 22,14V22H20V20H4V22H2M6,14A1,1 0 0,0 5,15V17A1,1 0 0,0 6,18A1,1 0 0,0 7,17V15A1,1 0 0,0 6,14M10,14A1,1 0 0,0 9,15V17A1,1 0 0,0 10,18A1,1 0 0,0 11,17V15A1,1 0 0,0 10,14M14,14A1,1 0 0,0 13,15V17A1,1 0 0,0 14,18A1,1 0 0,0 15,17V15A1,1 0 0,0 14,14M18,14A1,1 0 0,0 17,15V17A1,1 0 0,0 18,18A1,1 0 0,0 19,17V15A1,1 0 0,0 18,14Z'
}

export type GlyphName = keyof typeof GLYPHS

export function Glyph({ name, className }: { name: GlyphName; className?: string }) {
  return (
    <svg className={'nh-thermo__ic' + (className ? ' ' + className : '')} viewBox="0 0 24 24" aria-hidden="true">
      <path d={GLYPHS[name]} />
    </svg>
  )
}

/** The glyph that says what the system is doing, or what it is set to when nothing says. */
export function activityGlyph(activity: Activity, mode: HvacMode): GlyphName | undefined {
  if (activity === 'heating') return 'flame'
  if (activity === 'cooling') return 'snow'
  if (activity === 'idle') return 'leaf'
  if (mode === 'heat') return 'flame'
  if (mode === 'cool') return 'snow'
  return undefined
}

/**
 * A temperature: its whole part, its fraction set apart so a look can raise or shrink it, and its
 * unit. `sep` keeps the decimal separator with the fraction (".5") for the looks that read as a
 * plain number; without it the fraction is a raised digit, the way a thermostat's ring prints it.
 */
function Temp({ parts, unit, sep, className }: { parts: TempParts; unit?: string; sep: boolean; className: string }) {
  return (
    <span className={'nh-thermo__temp ' + className}>
      <span className="nh-thermo__num">
        {parts.int}
        {parts.frac !== undefined ? <span className="nh-thermo__frac">{sep ? '.' + parts.frac : parts.frac}</span> : null}
      </span>
      {unit ? <span className="nh-thermo__unit">{unit}</span> : null}
    </span>
  )
}

/**
 * One of the two setpoint controls. A button with nowhere to go is dimmed and inert rather than
 * `disabled`: a disabled control swallows the pointer events the hold gesture on the cell above
 * needs, and the tile would stop answering a long press exactly when the setpoint is at a limit.
 */
function StepButton({ view, dir, className }: { view: ThermoView; dir: 1 | -1; className?: string }) {
  const off = dir > 0 ? view.atMax : view.atMin
  return (
    <button
      type="button"
      className={
        'nh-thermo__btn nh-thermo__btn--' +
        (dir > 0 ? 'up' : 'down') +
        (off ? ' nh-thermo__btn--off' : '') +
        (className ? ' ' + className : '')
      }
      aria-label={dir > 0 ? view.labels.up : view.labels.down}
      aria-disabled={off || undefined}
      onClick={() => {
        if (!off) view.onStep(dir)
      }}>
      <svg className="nh-thermo__sign" viewBox="0 0 24 24" aria-hidden="true">
        <path d={dir > 0 ? 'M12 5v14M5 12h14' : 'M5 12h14'} />
      </svg>
    </button>
  )
}

function ringProps(ring: RingHandlers) {
  return {
    ref: ring.ref,
    onPointerDown: ring.onPointerDown,
    onPointerMove: ring.onPointerMove,
    onPointerUp: ring.onPointerUp,
    onPointerCancel: ring.onPointerCancel
  }
}

/**
 * A radial tick between two radii at an angle, for the two dials. A colour is applied as an
 * inline STYLE, not as a `stroke` attribute: `.nh-thermo__tick` sets a stroke, and a stylesheet
 * always beats an attribute, so a ramped tick would have come out the ink colour.
 */
function Tick({ angle, from, to, className, color }: { angle: number; from: number; to: number; className: string; color?: string }) {
  const a = polar(50, 50, from, angle)
  const b = polar(50, 50, to, angle)
  return <line className={className} x1={a.x} y1={a.y} x2={b.x} y2={b.y} style={color ? { stroke: color } : undefined} />
}

/** A marker's label just inside the ring at its angle, for the two dials. */
function Mark({ angle, r, parts, className }: { angle: number; r: number; parts: TempParts; className: string }) {
  const p = polar(50, 50, r, angle)
  return (
    <text className={'nh-thermo__mark ' + className} x={p.x} y={p.y} textAnchor="middle" dominantBaseline="central">
      {parts.int}
      {parts.frac !== undefined ? (
        <tspan className="nh-thermo__markfrac" dy="-2.2">
          {parts.frac}
        </tspan>
      ) : null}
    </text>
  )
}

/* ------------------------------------------------------------------ *
 * The looks
 * ------------------------------------------------------------------ */

/**
 * Arc: a thick track round the face, filled to the setpoint in the mode's colour and carrying a
 * handle to drag; the room's temperature is a dot on the track and a small line under the big
 * setpoint. The two buttons sit in the gap at the bottom.
 */
export function ArcLook({ view }: { view: ThermoView }) {
  const { arc } = view
  const R = 42
  const end = arc.start + arc.sweep
  const spAngle = angleFor(view.fraction, arc)
  const handle = polar(50, 50, R, spAngle)
  const cur = view.currentFraction === undefined ? null : polar(50, 50, R, angleFor(view.currentFraction, arc))
  return (
    <div className="nh-thermo__sq">
      <svg
        className={'nh-thermo__svg' + (view.ring.dragging ? ' nh-thermo__svg--drag' : '')}
        viewBox="0 0 100 100"
        {...ringProps(view.ring)}>
        <path className="nh-thermo__track" d={arcPath(50, 50, R, arc.start, end)} />
        {view.setpoint.known ? (
          <path className="nh-thermo__fill" d={arcPath(50, 50, R, arc.start, Math.max(arc.start + 0.01, spAngle))} />
        ) : null}
        {cur ? <circle className="nh-thermo__curdot" cx={cur.x} cy={cur.y} r="2.4" /> : null}
        {view.setpoint.known ? <circle className="nh-thermo__handle" cx={handle.x} cy={handle.y} r="5" /> : null}
      </svg>
      <div className="nh-thermo__center">
        {view.status ? <div className="nh-thermo__status">{view.status}</div> : null}
        <Temp parts={view.setpoint.parts} unit={view.unit} sep className="nh-thermo__sp" />
        {view.current.known ? (
          <div className="nh-thermo__curline" aria-label={view.labels.current}>
            <Glyph name="thermometer" />
            <span>
              {view.current.text}
              {view.unit ? ' ' + view.unit : ''}
            </span>
          </div>
        ) : null}
      </div>
      <StepButton view={view} dir={-1} className="nh-thermo__btn--gapl" />
      <StepButton view={view} dir={1} className="nh-thermo__btn--gapr" />
    </div>
  )
}

/**
 * Dial: a solid disc in the mode's colour ringed by fine ticks, the ones between the room's
 * temperature and the setpoint lit brighter; the setpoint is the big number, the room's
 * temperature a longer tick with its figure beside it. The unit sits under the number and a
 * glyph under that says what the system is doing.
 */
export function DialLook({ view }: { view: ThermoView }) {
  const { arc } = view
  const spAngle = angleFor(view.fraction, arc)
  const curAngle = view.currentFraction === undefined ? undefined : angleFor(view.currentFraction, arc)
  const lo = Math.min(spAngle, curAngle ?? spAngle)
  const hi = Math.max(spAngle, curAngle ?? spAngle)
  const glyph = activityGlyph(view.activity, view.mode)
  return (
    <div className="nh-thermo__sq">
      <svg
        className={'nh-thermo__svg' + (view.ring.dragging ? ' nh-thermo__svg--drag' : '')}
        viewBox="0 0 100 100"
        {...ringProps(view.ring)}>
        <circle className="nh-thermo__disc" cx="50" cy="50" r="48" />
        {ticksOf(121, arc).map((a, i) => (
          <Tick
            key={a}
            angle={a}
            from={36.5}
            to={43.5}
            className={'nh-thermo__tick' + (a >= lo && a <= hi ? ' nh-thermo__tick--lit' : '')}
            color={view.ramped ? rampColor(i / 120) : undefined}
          />
        ))}
        {view.setpoint.known ? (
          <Tick
            angle={spAngle}
            from={33}
            to={44.5}
            className="nh-thermo__tick nh-thermo__tick--sp"
            color={view.ramped ? rampColor(view.fraction) : undefined}
          />
        ) : null}
        {curAngle !== undefined ? (
          <>
            <Tick
              angle={curAngle}
              from={33}
              to={45}
              className="nh-thermo__tick nh-thermo__tick--cur"
              color={view.ramped ? rampColor(view.currentFraction ?? 0) : undefined}
            />
            <Mark angle={curAngle} r={29.5} parts={view.current.parts} className="nh-thermo__mark--cur" />
          </>
        ) : null}
      </svg>
      <div className="nh-thermo__center">
        <Temp parts={view.setpoint.parts} sep={false} className="nh-thermo__sp nh-thermo__sp--raised" />
        {view.unit ? <div className="nh-thermo__unitline">{view.unit}</div> : null}
        {glyph ? <Glyph name={glyph} className="nh-thermo__glyph" /> : null}
      </div>
      <StepButton view={view} dir={-1} className="nh-thermo__btn--discl" />
      <StepButton view={view} dir={1} className="nh-thermo__btn--discr" />
    </div>
  )
}

/**
 * Disc: the same solid disc hatched with a dense ring of short ticks right at its rim, the big
 * number's tenths raised as a small digit, and both the setpoint and the room's temperature
 * marked on the ring with their figures.
 */
export function DiscLook({ view }: { view: ThermoView }) {
  const { arc } = view
  const spAngle = angleFor(view.fraction, arc)
  const curAngle = view.currentFraction === undefined ? undefined : angleFor(view.currentFraction, arc)
  const glyph = view.mode === 'heat' ? 'flame' : view.mode === 'cool' ? 'snow' : activityGlyph(view.activity, view.mode)
  return (
    <div className="nh-thermo__sq">
      <svg
        className={'nh-thermo__svg' + (view.ring.dragging ? ' nh-thermo__svg--drag' : '')}
        viewBox="0 0 100 100"
        {...ringProps(view.ring)}>
        <circle className="nh-thermo__disc" cx="50" cy="50" r="48" />
        {ticksOf(141, arc).map((a, i) => (
          <Tick
            key={a}
            angle={a}
            from={41.5}
            to={46.5}
            className="nh-thermo__tick nh-thermo__tick--fine"
            color={view.ramped ? rampColor(i / 140) : undefined}
          />
        ))}
        {view.setpoint.known ? (
          <>
            <Tick
              angle={spAngle}
              from={36.5}
              to={47}
              className="nh-thermo__tick nh-thermo__tick--sp"
              color={view.ramped ? rampColor(view.fraction) : undefined}
            />
            <Mark angle={spAngle} r={32.5} parts={view.setpoint.parts} className="nh-thermo__mark--sp" />
          </>
        ) : null}
        {curAngle !== undefined ? (
          <>
            <Tick
              angle={curAngle}
              from={36.5}
              to={47}
              className="nh-thermo__tick nh-thermo__tick--cur"
              color={view.ramped ? rampColor(view.currentFraction ?? 0) : undefined}
            />
            <Mark angle={curAngle} r={32.5} parts={view.current.parts} className="nh-thermo__mark--cur" />
          </>
        ) : null}
      </svg>
      <div className="nh-thermo__center">
        <Temp parts={view.setpoint.parts} sep={false} className="nh-thermo__sp nh-thermo__sp--raised" />
        {glyph ? <Glyph name={glyph} className="nh-thermo__glyph nh-thermo__glyph--faint" /> : null}
      </div>
      <StepButton view={view} dir={-1} className="nh-thermo__btn--discl" />
      <StepButton view={view} dir={1} className="nh-thermo__btn--discr" />
    </div>
  )
}

/**
 * Ring: a dark disc bordered by a thick ring in the mode's colour. The room's temperature is
 * the big reading under an AMBIENT caption; below a hairline, SET holds the setpoint between its
 * two buttons and MODE the glyph for what the system is doing.
 */
export function RingLook({ view }: { view: ThermoView }) {
  const glyph = activityGlyph(view.activity, view.mode)
  return (
    <div className="nh-thermo__sq">
      <svg className="nh-thermo__svg" viewBox="0 0 100 100">
        <circle className="nh-thermo__plate" cx="50" cy="50" r="48" />
        <circle className="nh-thermo__rim" cx="50" cy="50" r="46" />
        <line className="nh-thermo__rule" x1="17" y1="58" x2="83" y2="58" />
      </svg>
      <div className="nh-thermo__ringtop">
        <div className="nh-thermo__caption">{view.labels.ambient}</div>
        <Temp parts={view.current.parts} sep className="nh-thermo__ambient" />
      </div>
      <div className="nh-thermo__ringrow">
        <div className="nh-thermo__ringcell nh-thermo__ringcell--set">
          <div className="nh-thermo__caption">{view.labels.set}</div>
          <div className="nh-thermo__setrow">
            <StepButton view={view} dir={-1} className="nh-thermo__btn--mini" />
            <Temp parts={view.setpoint.parts} sep className="nh-thermo__set" />
            <StepButton view={view} dir={1} className="nh-thermo__btn--mini" />
          </div>
        </div>
        <div className="nh-thermo__ringcell">
          <div className="nh-thermo__caption">{view.labels.mode}</div>
          <div className="nh-thermo__modecell">{glyph ? <Glyph name={glyph} className="nh-thermo__glyph" /> : <span>-</span>}</div>
        </div>
      </div>
    </div>
  )
}
