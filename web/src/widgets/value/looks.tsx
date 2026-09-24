import i18n from '../../i18n'
import type { CSSProperties, ReactNode } from 'react'
import { WidgetFrame } from '../common/WidgetFrame'
import { Icon } from '../../components/Icon'
import { ghostFor } from '../common/format'
import { readableInk } from '../../themes/contrast'
import type { TrendDirection, TrendTone, ValueAlign, ValueConfig, ValueStyle } from './model'

export interface ValueView {
  int: string
  frac?: string
  seg: boolean
  unit?: string
  color?: string
  icon?: string
  iconColor?: string
  iconSize?: number
  state?: string
  caption?: string
  badge?: string
  badgeColor?: string
  direction: TrendDirection | null
  tone: TrendTone | null
  sub?: string
  subCaption?: string
  align: ValueAlign
  sparkLine: string
  sparkArea: string
  bar: number | null
  barMin: string
  barMax: string
}

export interface LookProps {
  config: ValueConfig
  view: ValueView
}

const ARROWS: Record<TrendDirection, string> = {
  up: 'M6 0 L11.5 7.2 H8.2 V14 H3.8 V7.2 H0.5 Z',
  down: 'M6 14 L11.5 6.8 H8.2 V0 H3.8 V6.8 H0.5 Z',
  flat: 'M0 5 H12 V9 H0 Z'
}

// a body icon is drawn at the reading's own scale; a title-bar one takes the frame's smaller default
const BODY_ICON = 32

// union-keyed, so the compiler pins the index; the names are what a screen reader says for the arrow
const DIRECTION_NAMES: Record<TrendDirection, string> = { up: 'Rising', down: 'Falling', flat: 'Unchanged' }

function Arrow({ direction, tone }: { direction: TrendDirection; tone: TrendTone | null }) {
  return (
    <svg
      className={'nh-stat__arrow nh-stat__arrow--' + tone}
      viewBox="0 0 12 14"
      role="img"
      aria-label={i18n.t(DIRECTION_NAMES[direction])}
      data-direction={direction}>
      <path d={ARROWS[direction]} />
    </svg>
  )
}

// every look reads through the classes the stat tile has always used, so one theme rule for
// .nh-stat__value reaches all of them
function Reading({ view }: { view: ValueView }) {
  return (
    <>
      <span className="nh-stat__value" data-ghost={view.seg ? ghostFor(view.int) : undefined}>
        {view.int}
        {view.frac !== undefined ? (
          <span className="nh-stat__frac" data-ghost={view.seg ? ghostFor(view.frac) : undefined}>
            {view.frac}
          </span>
        ) : null}
      </span>
      {view.unit ? <span className="nh-stat__unit">{view.unit}</span> : null}
    </>
  )
}

function Badge({ view }: { view: ValueView }) {
  if (!view.badge) return null
  return (
    <span className="nh-stat__badge" style={view.badgeColor ? { background: view.badgeColor } : undefined}>
      {view.badge}
    </span>
  )
}

function Caption({ text }: { text?: string }) {
  return text ? <div className="nh-stat__caption">{text}</div> : null
}

function Foot({ view }: { view: ValueView }) {
  if (view.direction === null && !view.sub) return null
  return (
    <div className="nh-stat__foot">
      {view.direction ? <Arrow direction={view.direction} tone={view.tone} /> : null}
      {view.sub ? (
        <span className="nh-stat__sub">
          <span className="nh-stat__subvalue">{view.sub}</span>
          {view.subCaption ? <span className="nh-stat__subcaption">{view.subCaption}</span> : null}
        </span>
      ) : null}
    </div>
  )
}

const ink = (color: string | undefined): CSSProperties | undefined => (color ? { color } : undefined)

// a colour somebody picked gets ink measured against it; one the parser cannot read keeps whatever
// ink the stylesheet declares, rather than being handed a guess
function filled(color: string | undefined): CSSProperties | undefined {
  if (!color) return undefined
  const fg = readableInk(color)
  return fg ? { background: color, color: fg } : { background: color }
}

const alignClass = (align: ValueAlign): string => (align === 'left' ? '' : ' nh-read--' + align)

function ReadRoot({ style, view, children }: { style: ValueStyle; view: ValueView; children: ReactNode }) {
  return <div className={'nh-read nh-read--' + style + alignClass(view.align)}>{children}</div>
}

// the title bar carries the icon for every look that does not draw one of its own
function headed(config: ValueConfig, view: ValueView, children: ReactNode): ReactNode {
  return (
    <WidgetFrame label={config.label} icon={view.icon} iconSize={view.iconSize} iconState={view.state} iconColor={view.iconColor}>
      {children}
    </WidgetFrame>
  )
}

// the original value tile, markup unchanged: every theme is written against this tree
export function PlainLook({ config, view }: LookProps) {
  return (
    <WidgetFrame label={config.label} center>
      <div className="nh-value" style={ink(view.color)}>
        {view.icon ? (
          <Icon icon={view.icon} size={view.iconSize ?? BODY_ICON} state={view.state} color={view.iconColor} className="nh-value__icon" />
        ) : null}
        <span className="nh-value__text" data-ghost={view.seg ? ghostFor(view.int) : undefined}>
          {view.int}
          {view.frac !== undefined ? (
            <span className="nh-value__frac" data-ghost={view.seg ? ghostFor(view.frac) : undefined}>
              {view.frac}
            </span>
          ) : null}
        </span>
        {view.unit ? <span className="nh-value__unit">{view.unit}</span> : null}
      </div>
    </WidgetFrame>
  )
}

// likewise the stat column, unchanged from the widget it used to be
export function StatLook({ config, view }: LookProps) {
  return headed(
    config,
    view,
    <div className={'nh-stat' + (view.align === 'center' || view.align === 'right' ? ' nh-stat--' + view.align : '')}>
      {/* the ink sits on the row, not the value, so the unit beside it can follow the
          reading's color in themes that ask it to (it stays dim in the rest) */}
      <div className="nh-stat__main" style={ink(view.color)}>
        <Badge view={view} />
        <Reading view={view} />
      </div>
      <Caption text={view.caption} />
      <Foot view={view} />
    </div>
  )
}

export function SparkLook({ config, view }: LookProps) {
  return headed(
    config,
    view,
    <ReadRoot style="spark" view={view}>
      <div className="nh-read__main" style={ink(view.color)}>
        <Badge view={view} />
        <Reading view={view} />
        {view.direction ? <Arrow direction={view.direction} tone={view.tone} /> : null}
      </div>
      <Caption text={view.caption} />
      <svg className="nh-read__plot" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true" style={ink(view.color)}>
        {view.sparkArea ? <path className="nh-read__area" d={view.sparkArea} /> : null}
        {view.sparkLine ? <path className="nh-read__line" d={view.sparkLine} vectorEffect="non-scaling-stroke" /> : null}
      </svg>
    </ReadRoot>
  )
}

export function SplitLook({ config, view }: LookProps) {
  return (
    <WidgetFrame label={config.label}>
      <ReadRoot style="split" view={view}>
        {view.icon ? (
          <span className="nh-read__disc" style={filled(view.color)}>
            <Icon icon={view.icon} size={view.iconSize ?? BODY_ICON} state={view.state} color={view.iconColor} />
          </span>
        ) : null}
        <div className="nh-read__col">
          <div className="nh-read__main" style={ink(view.color)}>
            <Badge view={view} />
            <Reading view={view} />
          </div>
          <Caption text={view.caption} />
          <Foot view={view} />
        </div>
      </ReadRoot>
    </WidgetFrame>
  )
}

export function BarLook({ config, view }: LookProps) {
  return headed(
    config,
    view,
    <ReadRoot style="bar" view={view}>
      <div className="nh-read__main" style={ink(view.color)}>
        <Badge view={view} />
        <Reading view={view} />
        {view.direction ? <Arrow direction={view.direction} tone={view.tone} /> : null}
      </div>
      <Caption text={view.caption} />
      <div className="nh-read__track">
        {view.bar === null ? null : (
          <span
            className="nh-read__fill"
            style={{ width: (view.bar * 100).toFixed(2) + '%', ...(view.color ? { background: view.color } : {}) }}
          />
        )}
      </div>
      <div className="nh-read__ends">
        <span>{view.barMin}</span>
        <span>{view.barMax}</span>
      </div>
    </ReadRoot>
  )
}

// the ghost eights only line up because the seven-segment face gives every digit the same width
export function SegmentLook({ config, view }: LookProps) {
  return headed(
    config,
    view,
    <ReadRoot style="segment" view={view}>
      <div className="nh-read__main" style={ink(view.color)}>
        <Reading view={view} />
      </div>
      <Caption text={view.caption} />
      <Foot view={view} />
    </ReadRoot>
  )
}

export function PillLook({ config, view }: LookProps) {
  return (
    <WidgetFrame label={config.label} center>
      <ReadRoot style="pill" view={view}>
        <span className="nh-read__pill" style={filled(view.color)}>
          {view.icon ? <Icon icon={view.icon} size={view.iconSize ?? BODY_ICON} state={view.state} color={view.iconColor} /> : null}
          <Reading view={view} />
        </span>
        <Caption text={view.caption} />
      </ReadRoot>
    </WidgetFrame>
  )
}

export function HeroLook({ config, view }: LookProps) {
  return headed(
    config,
    view,
    <ReadRoot style="hero" view={view}>
      <div className="nh-read__main" style={ink(view.color)}>
        <Reading view={view} />
      </div>
      <Caption text={view.caption} />
    </ReadRoot>
  )
}
