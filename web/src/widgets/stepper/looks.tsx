import type { ArrowDir, ArrowShape, Glyph } from './model'

export interface StepperView {
  text: string
  unit?: string
  ghost?: string
  isText: boolean
  atMin: boolean
  atMax: boolean
  onStep: (dir: 1 | -1) => void
  glyph: (axis: 'vertical' | 'horizontal', dir: 1 | -1) => Glyph
  labels: { up: string; down: string }
  fraction: number
  dots: number
  dotIndex: number
  count?: string
  bounds?: [string, string]
}

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
  kind: 'box' | 'half' | 'edge'
}

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
