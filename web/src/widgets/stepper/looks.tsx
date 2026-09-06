/**
 * The six looks of the stepper, drawn from one view of the value.
 *
 * Every look is the same two buttons and the same reading arranged differently, so the parts are
 * written once (`StepButton`, `Reading`, `Arrow`) and each look is only its arrangement. What a
 * press does lives in the widget, which hands the looks an `onStep`; nothing here decides a value.
 */
import type { ArrowDir, ArrowShape, Glyph } from './model'

export interface StepperView {
  /** The reading: a formatted number, or the current choice's label. */
  text: string
  unit?: string
  /** Segment-display metadata for the LCD theme; undefined for anything but plain digits. */
  ghost?: string
  /** True for a list, whose reading is words rather than digits. */
  isText: boolean
  atMin: boolean
  atMax: boolean
  onStep: (dir: 1 | -1) => void
  glyph: (axis: 'vertical' | 'horizontal', dir: 1 | -1) => Glyph
  /** Accessible names for the two buttons, already translated. */
  labels: { up: string; down: string }
  /** Where the value sits in its range, 0..1. */
  fraction: number
  /** Number of position dots to draw, 0 for none. */
  dots: number
  /** Which dot is lit. */
  dotIndex: number
  /** A "3 of 20" caption for a list too long for dots. */
  count?: string
  /** The two ends of the range, as the range bar prints them. */
  bounds?: [string, string]
}

/* Internal glyph tables, keyed by values this module chose itself - a bare index is fine here. */
const CHEVRON: Record<'up' | 'down' | 'left' | 'right', string> = {
  up: 'M6 15l6-6 6 6',
  down: 'M6 9l6 6 6-6',
  left: 'M15 6l-6 6 6 6',
  right: 'M9 6l6 6-6 6'
}
const TRIANGLE: Record<'up' | 'down' | 'left' | 'right', string> = {
  up: 'M12 7l6 10H6z',
  down: 'M12 17L6 7h12z',
  left: 'M7 12l10-6v12z',
  right: 'M17 12L7 18V6z'
}
const ARROW: Record<'up' | 'down' | 'left' | 'right', string> = {
  up: 'M12 19V5M5 12l7-7 7 7',
  down: 'M12 5v14M5 12l7 7 7-7',
  left: 'M19 12H5M12 5l-7 7 7 7',
  right: 'M5 12h14M12 5l7 7-7 7'
}
const SIGN: Record<'plus' | 'minus', string> = { plus: 'M12 5v14M5 12h14', minus: 'M5 12h14' }

function pathOf(shape: ArrowShape, dir: ArrowDir): string {
  if (dir === 'plus' || dir === 'minus') return SIGN[dir]
  if (shape === 'triangle') return TRIANGLE[dir]
  if (shape === 'arrow') return ARROW[dir]
  return CHEVRON[dir]
}

export function Arrow({ g, className }: { g: Glyph; className?: string }) {
  return (
    <svg
      className={'nh-step__ic' + (g.shape === 'triangle' ? ' nh-step__ic--fill' : '') + (className ? ' ' + className : '')}
      viewBox="0 0 24 24"
      aria-hidden="true">
      <path d={pathOf(g.shape, g.dir)} />
    </svg>
  )
}

interface ButtonProps {
  view: StepperView
  dir: 1 | -1
  axis: 'vertical' | 'horizontal'
  /** Which kind of button this look draws: a boxed one, a spinner half, or a bare edge. */
  kind: 'box' | 'half' | 'edge'
}

/**
 * One of the two controls. A button with nowhere to go is dimmed and inert rather than
 * `disabled`: a disabled control swallows the pointer events the hold gesture on the cell above
 * needs, and the tile would stop answering a long press exactly when a value sits at its limit.
 */
function StepButton({ view, dir, axis, kind }: ButtonProps) {
  const off = dir > 0 ? view.atMax : view.atMin
  return (
    <button
      type="button"
      className={'nh-step__btn nh-step__' + kind + ' nh-step__btn--' + (dir > 0 ? 'up' : 'down') + (off ? ' nh-step__btn--off' : '')}
      aria-label={dir > 0 ? view.labels.up : view.labels.down}
      aria-disabled={off || undefined}
      onClick={() => {
        if (!off) view.onStep(dir)
      }}>
      <Arrow g={view.glyph(axis, dir)} />
    </button>
  )
}

function Reading({ view }: { view: StepperView }) {
  return (
    <div className={'nh-step__value' + (view.isText ? ' nh-step__value--text' : '')}>
      <span className="nh-step__num" data-ghost={view.ghost}>
        {view.text}
      </span>
      {view.unit ? <span className="nh-step__unit">{view.unit}</span> : null}
    </div>
  )
}

function Dots({ view }: { view: StepperView }) {
  if (view.dots > 0) {
    return (
      <div className="nh-step__dots">
        {Array.from({ length: view.dots }, (_, i) => (
          <i key={i} className={'nh-step__dot' + (i === view.dotIndex ? ' nh-step__dot--on' : '')} />
        ))}
      </div>
    )
  }
  if (view.count) return <div className="nh-step__count">{view.count}</div>
  return null
}

/** Up bar, reading, down bar: the thermostat classic, every target the full width of the tile. */
export function StackLook({ view }: { view: StepperView }) {
  return (
    <div className="nh-step__stack">
      <StepButton view={view} dir={1} axis="vertical" kind="box" />
      <div className="nh-step__mid">
        <Reading view={view} />
      </div>
      <StepButton view={view} dir={-1} axis="vertical" kind="box" />
    </div>
  )
}

/** The reading as the hero, the two controls in a row beneath it. */
export function PairLook({ view }: { view: StepperView }) {
  return (
    <div className="nh-step__pair">
      <div className="nh-step__mid">
        <Reading view={view} />
      </div>
      <div className="nh-step__row">
        <StepButton view={view} dir={-1} axis="horizontal" kind="box" />
        <StepButton view={view} dir={1} axis="horizontal" kind="box" />
      </div>
    </div>
  )
}

/** The reading on the left and a tall split button on the right, up over down. */
export function SpinnerLook({ view }: { view: StepperView }) {
  return (
    <div className="nh-step__spin">
      <div className="nh-step__spinval">
        <Reading view={view} />
      </div>
      <div className="nh-step__ctl">
        <StepButton view={view} dir={1} axis="vertical" kind="half" />
        <StepButton view={view} dir={-1} axis="vertical" kind="half" />
      </div>
    </div>
  )
}

/**
 * The whole tile as the control: the top half steps up and the bottom half down, or the left
 * and right halves in a wide cell. Each zone carries both glyphs and the stylesheet shows the one
 * that matches the cell's shape, since only a container query knows it.
 */
export function SplitLook({ view }: { view: StepperView }) {
  const zone = (dir: 1 | -1) => {
    const off = dir > 0 ? view.atMax : view.atMin
    return (
      <button
        type="button"
        className={'nh-step__zone nh-step__zone--' + (dir > 0 ? 'up' : 'down') + (off ? ' nh-step__zone--off' : '')}
        aria-label={dir > 0 ? view.labels.up : view.labels.down}
        aria-disabled={off || undefined}
        onClick={() => {
          if (!off) view.onStep(dir)
        }}>
        <Arrow g={view.glyph('vertical', dir)} className="nh-step__ic--v" />
        <Arrow g={view.glyph('horizontal', dir)} className="nh-step__ic--h" />
      </button>
    )
  }
  return (
    <div className="nh-step__split">
      {zone(1)}
      {zone(-1)}
      <div className="nh-step__float">
        <span>
          <Reading view={view} />
        </span>
      </div>
    </div>
  )
}

/** Quiet chevrons at the tile's edges, the reading across the width, dots saying where you are. */
export function CarouselLook({ view }: { view: StepperView }) {
  return (
    <div className="nh-step__car">
      <StepButton view={view} dir={-1} axis="horizontal" kind="edge" />
      <div className="nh-step__carmid">
        <Reading view={view} />
        <Dots view={view} />
      </div>
      <StepButton view={view} dir={1} axis="horizontal" kind="edge" />
    </div>
  )
}

/** The reading over a thin bar showing where it sits in its range, a button at each end. */
export function RangeLook({ view }: { view: StepperView }) {
  return (
    <div className="nh-step__range">
      <Reading view={view} />
      <div className="nh-step__row">
        <StepButton view={view} dir={-1} axis="horizontal" kind="box" />
        {view.dots > 0 ? (
          <div className="nh-step__segs">
            {Array.from({ length: view.dots }, (_, i) => (
              <i key={i} className={'nh-step__seg' + (i === view.dotIndex ? ' nh-step__seg--on' : '')} />
            ))}
          </div>
        ) : (
          <div className="nh-step__track">
            <div className="nh-step__fill" style={{ width: `${Math.round(view.fraction * 1000) / 10}%` }} />
          </div>
        )}
        <StepButton view={view} dir={1} axis="horizontal" kind="box" />
      </div>
      {view.bounds ? (
        <div className="nh-step__bounds">
          <span>{view.bounds[0]}</span>
          <span>{view.bounds[1]}</span>
        </div>
      ) : null}
    </div>
  )
}
