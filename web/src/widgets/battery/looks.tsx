import type { CSSProperties, ReactNode } from 'react'
import { Icon } from '../../components/Icon'
import { RING_TICKS, cellStates, litCount, meterCount, podFadeStop, wavePath } from './model'

export interface BatteryView {
  pct: number
  known: boolean
  percentText: string
  color: string
  charging: boolean
  text: boolean
  caption?: string
  icon?: string
  animate: boolean
  chargingLabel: string
  scheme: 'dark' | 'light'
  neonBolt: string
}

export interface Box {
  w: number
  h: number
}

interface LookProps {
  box: Box
  view: BatteryView
  uid: string
}

// a body shorter than this draws its glyph beside the number rather than around it
export const INSIDE_MIN = 176

const f = (n: number) => Math.round(n * 10) / 10
const BOLT = 'M11 15H6L13 1V9H18L11 23V15Z'

function Bolt({ cx, cy, h, style }: { cx: number; cy: number; h: number; style?: CSSProperties }) {
  const s = h / 24
  return <path d={BOLT} transform={`translate(${f(cx - 12 * s)} ${f(cy - 12 * s)}) scale(${f(s)})`} style={style} />
}

function BigNumber({ px, view, align = 'center', style }: { px: number; view: BatteryView; align?: string; style?: CSSProperties }) {
  return (
    <div className="nh-battery__num" style={{ fontSize: f(px), justifyContent: align, ...style }}>
      <span>{view.percentText}</span>
      {view.known ? <span className="nh-battery__pct">%</span> : null}
    </div>
  )
}

// below this much width the word Charging is shed and the bolt says it alone; below the smaller
// figure a number beside the glyph would be unreadable, so the glyph stands alone
const CAP_WORD_MIN = 100
const ASIDE_MIN = 40
const SIDE_GAP = 16

function ChargingCap({ view, style, wordless }: { view: BatteryView; style?: CSSProperties; wordless?: boolean }) {
  return (
    <div
      className={'nh-battery__cap' + (wordless ? ' nh-battery__cap--bolt' : '')}
      style={style}
      title={wordless ? view.chargingLabel : undefined}
      aria-label={wordless ? view.chargingLabel : undefined}>
      <svg className="nh-battery__capbolt" viewBox="0 0 24 24" aria-hidden="true">
        <path d={BOLT} style={{ fill: view.color }} />
      </svg>
      {wordless ? null : view.chargingLabel}
    </div>
  )
}

// a body too narrow to set a number beside the glyph draws as if the text were off
function sideView(view: BatteryView, box: Box, gw: number): BatteryView {
  return box.w - gw - SIDE_GAP >= ASIDE_MIN ? view : { ...view, text: false }
}

// glyph at the left, the number beside it: the layout every vertical style takes in a short body
function Beside({
  glyph,
  gw,
  box,
  view,
  numStyle
}: {
  glyph: ReactNode
  gw: number
  box: Box
  view: BatteryView
  numStyle?: CSSProperties
}) {
  const asideW = box.w - gw - SIDE_GAP
  if (!view.text) return <div className="nh-battery__side nh-battery__side--alone">{glyph}</div>
  const numPx = Math.min(box.h * 0.5, asideW / 2.4)
  return (
    <div className="nh-battery__side">
      {glyph}
      <div className="nh-battery__aside">
        <BigNumber px={numPx} view={view} align="flex-start" style={numStyle} />
        {view.charging && box.h >= 90 ? <ChargingCap view={view} wordless={asideW < CAP_WORD_MIN} /> : null}
      </div>
    </div>
  )
}

function Stack({ gw, gh, children }: { gw: number; gh: number; children: ReactNode }) {
  return (
    <div className="nh-battery__stack" style={{ width: f(gw), height: f(gh) }}>
      {children}
    </div>
  )
}

const svgProps = (w: number, h: number) => ({
  className: 'nh-battery__glyph',
  width: f(w),
  height: f(h),
  viewBox: `0 0 ${f(w)} ${f(h)}`,
  'aria-hidden': true as const
})

const mix = (pct: number, into: string) => `color-mix(in srgb, var(--bt-color) ${pct}%, ${into})`

// ---------- glow ----------
export function GlowLook({ box, view: view0, uid }: LookProps) {
  const { w, h } = box
  const side = h < INSIDE_MIN
  const gh = h
  const gw = side ? Math.min(w * 0.45, gh / 1.7) : Math.min(w, gh / 1.7)
  const view = side ? sideView(view0, box, gw) : view0
  const nubH = gh * 0.06
  const nubW = gw * 0.32
  const y0 = nubH + gh * 0.025
  const bodyH = gh - y0
  const rx = gw * 0.16
  const fillH = (bodyH * view.pct) / 100
  const inside = !side && view.text
  const numPx = Math.min(gw * 0.36, bodyH * 0.22)
  const svg = (
    <svg {...svgProps(gw, gh)}>
      <defs>
        <clipPath id={uid + 'c'}>
          <rect x="0" y={f(y0)} width={f(gw)} height={f(bodyH)} rx={f(rx)} />
        </clipPath>
        <linearGradient id={uid + 'g'} x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" style={{ stopColor: view.color, stopOpacity: 0.95 }} />
          <stop offset="1" style={{ stopColor: view.color, stopOpacity: 0.45 }} />
        </linearGradient>
        <linearGradient id={uid + 'h'} x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" style={{ stopColor: view.color, stopOpacity: 0.38 }} />
          <stop offset="1" style={{ stopColor: view.color, stopOpacity: 0 }} />
        </linearGradient>
        <filter id={uid + 'b'} x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation={f(gw * 0.07)} />
        </filter>
      </defs>
      <rect x={f(gw / 2 - nubW / 2)} y="0" width={f(nubW)} height={f(nubH)} rx={f(nubH / 2)} className="nh-battery__nub" />
      <rect x="0.5" y={f(y0 + 0.5)} width={f(gw - 1)} height={f(bodyH - 1)} rx={f(rx)} className="nh-battery__body" />
      <g clipPath={`url(#${uid}c)`}>
        <rect x="0" y={f(y0 + bodyH - fillH)} width={f(gw)} height={f(fillH)} fill={`url(#${uid}g)`} />
        <rect x="0" y={f(y0 + bodyH - fillH - gw * 0.5)} width={f(gw)} height={f(gw * 0.5)} fill={`url(#${uid}h)`} />
        <rect
          x={f(gw * 0.1)}
          y={f(y0 + bodyH - fillH * 0.55)}
          width={f(gw * 0.8)}
          height={f(fillH * 0.55)}
          style={{ fill: view.color, opacity: 0.5 }}
          filter={`url(#${uid}b)`}
        />
      </g>
      {!inside && !view.text && view.charging ? (
        <Bolt cx={gw / 2} cy={y0 + bodyH * 0.5} h={gw * 0.42} style={{ fill: 'var(--bt-ink)', opacity: 0.9 }} />
      ) : null}
    </svg>
  )
  if (side) return <Beside glyph={svg} gw={gw} box={box} view={view} />
  return (
    <Stack gw={gw} gh={gh}>
      {svg}
      {inside ? (
        <div className="nh-battery__over">
          {view.charging ? (
            <ChargingCap view={view} wordless={gw < CAP_WORD_MIN} style={{ top: f(y0 + bodyH * 0.38), color: 'var(--bt-ink)' }} />
          ) : null}
          <BigNumber
            px={numPx}
            view={view}
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              top: f(y0 + bodyH * 0.62),
              transform: 'translateY(-50%)',
              color: 'var(--bt-ink)'
            }}
          />
        </div>
      ) : null}
    </Stack>
  )
}

// ---------- neon ----------
export function NeonLook({ box, view: view0, uid }: LookProps) {
  const { w, h } = box
  const side = h < INSIDE_MIN
  const gh = h
  const gw = side ? Math.min(w * 0.45, gh / 1.6) : Math.min(w, gh / 1.6)
  const view = side ? sideView(view0, box, gw) : view0
  const sw = Math.max(3, gw * 0.055)
  const nubH = gh * 0.07
  const nubW = gw * 0.36
  const y0 = nubH
  const bodyH = gh - y0
  const rx = gw * 0.12
  const inset = sw * 1.9
  const innerX = inset
  const innerW = gw - inset * 2
  const innerTop = y0 + inset
  const innerBot = gh - inset
  const innerH = innerBot - innerTop
  const ly = innerBot - (innerH * view.pct) / 100
  const inside = !side && view.text
  const numPx = Math.min(innerW * 0.34, bodyH * 0.2)
  const tubeGlow = `drop-shadow(0 0 ${f(sw * 0.7)}px ${view.color}) drop-shadow(0 0 ${f(sw * 2.4)}px ${mix(55, 'transparent')})`
  const boltGlow = `drop-shadow(0 0 ${f(sw * 0.8)}px ${view.neonBolt}) drop-shadow(0 0 ${f(sw * 2.4)}px color-mix(in srgb, ${view.neonBolt} 60%, transparent))`
  const glowAlpha = view.scheme === 'dark' ? 0.9 : 0.45
  const svg = (
    <svg {...svgProps(gw, gh)}>
      <defs>
        <clipPath id={uid + 'c'}>
          <rect x={f(innerX)} y={f(innerTop)} width={f(innerW)} height={f(innerH)} rx={f(rx * 0.5)} />
        </clipPath>
        <linearGradient id={uid + 'g'} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style={{ stopColor: view.color, stopOpacity: 0.32 }} />
          <stop offset="1" style={{ stopColor: view.color, stopOpacity: 0.05 }} />
        </linearGradient>
      </defs>
      <g clipPath={`url(#${uid}c)`}>
        <rect x={f(innerX)} y={f(ly)} width={f(innerW)} height={f(innerBot - ly)} fill={`url(#${uid}g)`} />
      </g>
      {view.known ? (
        <line
          x1={f(innerX)}
          x2={f(innerX + innerW)}
          y1={f(ly)}
          y2={f(ly)}
          strokeWidth={f(sw * 0.55)}
          strokeLinecap="round"
          style={{ stroke: view.color, filter: `drop-shadow(0 0 ${f(sw * 0.8)}px ${view.color})` }}
        />
      ) : null}
      <g fill="none" strokeWidth={f(sw)} strokeLinejoin="round" style={{ stroke: view.color, filter: tubeGlow }}>
        <rect x={f(sw / 2)} y={f(y0 + sw / 2)} width={f(gw - sw)} height={f(bodyH - sw)} rx={f(rx)} />
        <rect x={f(gw / 2 - nubW / 2 + sw / 2)} y={f(sw / 2)} width={f(nubW - sw)} height={f(nubH * 0.9)} rx={f(sw)} />
      </g>
      {view.charging ? (
        <Bolt
          cx={gw / 2}
          cy={innerTop + innerH * (inside ? 0.6 : 0.5)}
          h={innerH * 0.42}
          style={{ fill: view.neonBolt, filter: boltGlow }}
        />
      ) : (
        <Bolt
          cx={gw / 2}
          cy={innerTop + innerH * (inside ? 0.6 : 0.5)}
          h={innerH * 0.42}
          style={{ fill: 'none', stroke: view.color, strokeWidth: Math.max(1.5, sw * 0.4), strokeLinejoin: 'round', opacity: 0.32 }}
        />
      )}
    </svg>
  )
  const inkStyle: CSSProperties = {
    color: 'var(--bt-neon-ink)',
    textShadow: `0 0 ${f(numPx * 0.18)}px ${mix(glowAlpha * 100, 'transparent')}`,
    fontWeight: 600
  }
  if (side) return <Beside glyph={svg} gw={gw} box={box} view={view} numStyle={inkStyle} />
  return (
    <Stack gw={gw} gh={gh}>
      {svg}
      {inside ? (
        <div className="nh-battery__over">
          <BigNumber
            px={numPx}
            view={view}
            style={{ ...inkStyle, position: 'absolute', left: 0, right: 0, top: f(innerTop + innerH * 0.2), transform: 'translateY(-50%)' }}
          />
        </div>
      ) : null}
    </Stack>
  )
}

// ---------- cells ----------
const CELLS = 4

export function CellsLook({ box, view: view0, uid }: LookProps) {
  const { w, h } = box
  const side = h < INSIDE_MIN
  const sideGw = Math.min(w * 0.4, h / 1.9)
  const view = side ? sideView(view0, box, sideGw) : view0
  const bright = mix(65, 'white')
  const draw = (gw: number, gh: number) => {
    const pillH = Math.max(4, gh * 0.035)
    const pillW = gw * 0.5
    const y0 = pillH + gh * 0.035
    const bodyH = gh - y0
    const rx = gw * 0.14
    const inset = gw * 0.1
    const cgap = gw * 0.05
    const cellW = gw - inset * 2
    const cellH = (bodyH - inset * 2 - cgap * (CELLS - 1)) / CELLS
    const crx = Math.min(cellH * 0.28, gw * 0.07)
    const states = cellStates(view.pct, CELLS)
    return (
      <svg {...svgProps(gw, gh)}>
        <defs>
          <linearGradient id={uid + 'g'} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" style={{ stopColor: bright }} />
            <stop offset="1" style={{ stopColor: view.color }} />
          </linearGradient>
        </defs>
        <rect
          x={f(gw / 2 - pillW / 2)}
          y="0"
          width={f(pillW)}
          height={f(pillH)}
          rx={f(pillH / 2)}
          style={{ fill: mix(22, 'transparent') }}
        />
        <rect
          x={f(gw / 2 - pillW / 2)}
          y="0"
          width={f((pillW * view.pct) / 100)}
          height={f(pillH)}
          rx={f(pillH / 2)}
          style={{ fill: view.color }}
        />
        <rect
          x="1"
          y={f(y0 + 1)}
          width={f(gw - 2)}
          height={f(bodyH - 2)}
          rx={f(rx)}
          fill="none"
          strokeWidth="2"
          style={{ stroke: view.color }}
        />
        {states.map((s, i) => {
          const y = y0 + inset + (CELLS - 1 - i) * (cellH + cgap)
          const fill = s === 'full' ? `url(#${uid}g)` : s === 'part' ? mix(30, 'transparent') : mix(11, 'transparent')
          return (
            <g key={i}>
              <rect
                x={f(inset)}
                y={f(y)}
                width={f(cellW)}
                height={f(cellH)}
                rx={f(crx)}
                style={{ fill }}
                className={'nh-battery__cell nh-battery__cell--' + s}
              />
              {s === 'part' && view.charging ? <Bolt cx={gw / 2} cy={y + cellH / 2} h={cellH * 0.8} style={{ fill: bright }} /> : null}
            </g>
          )
        })}
      </svg>
    )
  }
  if (side) return <Beside glyph={draw(sideGw, h)} gw={sideGw} box={box} view={view} />
  const numPx = view.text ? Math.min(w * 0.28, h * 0.16) : 0
  const numH = view.text ? numPx * 1.05 + 8 : 0
  const gh = h - numH
  const gw = Math.min(w, gh / 1.9)
  return (
    <div className="nh-battery__column">
      {view.text ? <BigNumber px={numPx} view={view} /> : null}
      {draw(gw, gh)}
    </div>
  )
}

// ---------- ring ----------
export function RingLook({ box, view: view0, uid }: LookProps) {
  const { w, h } = box
  const side = w > 1.8 * h
  const s = side ? h : Math.min(w, h)
  const view = side ? sideView(view0, box, s) : view0
  const R = s / 2
  const lit = litCount(view.pct, RING_TICKS)
  const L = R * 0.12
  const tw = Math.max(2, R * 0.045)
  const ticks: ReactNode[] = []
  for (let i = 0; i < RING_TICKS; i++) {
    const a = -Math.PI / 2 + (i / RING_TICKS) * Math.PI * 2
    const on = i < lit
    const t = lit > 1 ? i / (lit - 1) : 0
    const col = on ? `color-mix(in srgb, var(--bt-c0) ${f((1 - t) * 100)}%, var(--bt-c1))` : 'var(--bt-unlit)'
    ticks.push(
      <line
        key={i}
        x1={f(R + Math.cos(a) * (R - L))}
        y1={f(R + Math.sin(a) * (R - L))}
        x2={f(R + Math.cos(a) * R)}
        y2={f(R + Math.sin(a) * R)}
        strokeWidth={f(tw)}
        strokeLinecap="round"
        style={{ stroke: col }}
        className={'nh-battery__tick' + (on ? ' nh-battery__tick--on' : '')}
      />
    )
  }
  const small = R < 70
  const stacked = view.text && !side
  const showGlyph = side || !(small && view.text)
  let centre: ReactNode = null
  if (showGlyph) {
    const gh = stacked ? R * 0.8 : R
    const gw = gh / 1.9
    const cx = R
    const cy = stacked ? R - R * 0.13 : R
    const nubH = gh * 0.08
    const nubW = gw * 0.4
    const y0 = cy - gh / 2
    const bodyH = gh - nubH
    const rx = gw * 0.16
    const inset = gw * 0.12
    const cgap = gw * 0.06
    const M = 5
    const cellH = (bodyH - inset * 2 - cgap * (M - 1)) / M
    const states = cellStates(view.pct, M)
    centre = (
      <>
        <defs>
          <linearGradient id={uid + 'g'} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" style={{ stopColor: 'var(--bt-c0)' }} />
            <stop offset="1" style={{ stopColor: view.color }} />
          </linearGradient>
        </defs>
        <rect
          x={f(cx - nubW / 2)}
          y={f(y0)}
          width={f(nubW)}
          height={f(nubH * 1.6)}
          rx={f(nubH * 0.5)}
          fill="none"
          strokeWidth="2"
          style={{ stroke: view.color }}
        />
        <rect
          x={f(cx - gw / 2 + 1)}
          y={f(y0 + nubH + 1)}
          width={f(gw - 2)}
          height={f(bodyH - 2)}
          rx={f(rx)}
          strokeWidth="2"
          style={{ stroke: view.color, fill: 'var(--nh-surface)' }}
        />
        {states.map((st, i) => {
          const y = y0 + nubH + inset + (M - 1 - i) * (cellH + cgap)
          const fill = st === 'full' ? `url(#${uid}g)` : st === 'part' ? mix(30, 'transparent') : mix(10, 'transparent')
          return (
            <rect
              key={i}
              x={f(cx - gw / 2 + inset)}
              y={f(y)}
              width={f(gw - inset * 2)}
              height={f(cellH)}
              rx={f(Math.min(cellH * 0.3, 4))}
              style={{ fill }}
            />
          )
        })}
        {view.charging ? (
          <Bolt
            cx={cx + gw / 2 + 2}
            cy={y0 + nubH + 2}
            h={gh * 0.22}
            style={{ fill: 'var(--bt-ink)', stroke: 'var(--nh-surface)', strokeWidth: 1 }}
          />
        ) : null}
      </>
    )
  }
  const svg = (
    <svg {...svgProps(s, s)}>
      {ticks}
      {centre}
    </svg>
  )
  if (side) return <Beside glyph={svg} gw={s} box={box} view={view} />
  const numPx = small ? R * 0.62 : Math.min(R * 0.3, 40)
  const numY = small ? R : R + R * 0.62
  return (
    <Stack gw={s} gh={s}>
      {svg}
      {view.text ? (
        <div className="nh-battery__over">
          <BigNumber
            px={numPx}
            view={view}
            style={{ position: 'absolute', left: 0, right: 0, top: f(numY), transform: 'translateY(-50%)' }}
          />
        </div>
      ) : null}
    </Stack>
  )
}

// ---------- pods ----------
function Pod({ pw, ph, view, numInside, caption }: { pw: number; ph: number; view: BatteryView; numInside: boolean; caption?: string }) {
  const fillH = (ph * view.pct) / 100
  const fadeStop = podFadeStop(fillH, pw)
  const disc = pw * 0.62
  const discCy = ph * 0.72
  const numPx = Math.max(16, Math.min(pw * 0.3, 48))
  const fill = `linear-gradient(to bottom, color-mix(in srgb, var(--bt-color) 0%, transparent) 0%, color-mix(in srgb, var(--bt-color) 92%, transparent) ${f(fadeStop * 100)}%, var(--bt-color) 100%)`
  return (
    <div className="nh-battery__pod" style={{ width: f(pw), height: f(ph), borderRadius: f(pw * 0.24) }}>
      <div className="nh-battery__podfill" style={{ height: f(fillH), backgroundImage: fill }} />
      {view.icon ? (
        <div
          className="nh-battery__disc"
          style={{ width: f(disc), height: f(disc), left: f(pw / 2 - disc / 2), top: f(discCy - disc / 2) }}>
          <Icon icon={view.icon} size={Math.round(disc * 0.52)} />
        </div>
      ) : null}
      {view.charging ? (
        <svg
          className="nh-battery__podbolt"
          viewBox="0 0 24 24"
          aria-hidden="true"
          style={
            view.icon
              ? { width: f(disc * 0.34), height: f(disc * 0.34), left: f(pw / 2 + disc * 0.19), top: f(discCy - disc * 0.53) }
              : { width: f(disc * 0.5), height: f(disc * 0.5), left: f(pw / 2 - disc * 0.25), top: f(discCy - disc * 0.25) }
          }>
          <path
            d={BOLT}
            style={
              view.icon
                ? { fill: view.color, stroke: '#fff', strokeWidth: 1.5, strokeLinejoin: 'round' }
                : { fill: '#fff', stroke: 'rgba(15,19,23,.35)', strokeWidth: 1, strokeLinejoin: 'round' }
            }
          />
        </svg>
      ) : null}
      {numInside && view.text ? (
        <div className="nh-battery__podtext" style={{ top: f(ph * 0.1) }}>
          <BigNumber px={numPx} view={view} />
          {caption ? <div className="nh-battery__podcap">{caption}</div> : null}
        </div>
      ) : null}
    </div>
  )
}

export function PodsLook({ box, view: view0 }: LookProps) {
  const { w, h } = box
  const side = h < INSIDE_MIN
  const sidePw = Math.min(w * 0.4, h / 1.9)
  const view = side ? sideView(view0, box, sidePw) : view0
  if (side) return <Beside glyph={<Pod pw={sidePw} ph={h} view={view} numInside={false} />} gw={sidePw} box={box} view={view} />
  const ph = h
  const pw = Math.min(w, ph / 1.9)
  const caption = view.charging ? view.chargingLabel : view.caption
  return (
    <div className="nh-battery__column">
      <Pod pw={pw} ph={ph} view={view} numInside caption={caption} />
    </div>
  )
}

// ---------- bar ----------
export function BarLook({ box, view }: LookProps) {
  const { w, h } = box
  const side = w > 1.8 * h
  const draw = (bw: number, bh: number) => {
    const nubW = bh * 0.22
    const nubH = bh * 0.42
    const bodyW = bw - nubW - 2
    const rx = bh * 0.28
    const inset = 4
    const innerW = bodyW - inset * 2
    const innerH = bh - inset * 2
    const fillW = (innerW * view.pct) / 100
    return (
      <svg {...svgProps(bw, bh)}>
        <rect
          x="1"
          y="1"
          width={f(bodyW - 2)}
          height={f(bh - 2)}
          rx={f(rx)}
          strokeWidth="2"
          style={{ fill: mix(10, 'transparent'), stroke: 'var(--bt-outline)' }}
          className="nh-battery__track"
        />
        <rect
          x={f(bodyW)}
          y={f(bh / 2 - nubH / 2)}
          width={f(nubW)}
          height={f(nubH)}
          rx={f(nubW * 0.4)}
          style={{ fill: 'var(--bt-outline)' }}
        />
        <rect
          x={f(inset)}
          y={f(inset)}
          width={f(fillW)}
          height={f(innerH)}
          rx={f(rx * 0.6)}
          style={{ fill: view.color }}
          className="nh-battery__fill"
        />
        {view.charging ? (
          <Bolt
            cx={inset + Math.max(fillW - innerH * 0.55, innerH * 0.45)}
            cy={bh / 2}
            h={innerH * 0.78}
            style={{ fill: 'var(--bt-ink)', stroke: view.color, strokeWidth: 1, strokeLinejoin: 'round' }}
          />
        ) : null}
      </svg>
    )
  }
  if (side) {
    const numPx = view.text ? Math.min(h * 0.55, w * 0.24) : 0
    const numW = view.text ? numPx * 1.75 : 0
    const barH = Math.max(22, Math.min(h * 0.38, 44))
    const gap = view.text ? 18 : 0
    return (
      <div className="nh-battery__row">
        {view.text ? (
          <div style={{ flex: 'none', width: f(numW) }}>
            <BigNumber px={numPx} view={view} align="flex-start" />
          </div>
        ) : null}
        <div className="nh-battery__rowbar">
          {draw(w - numW - gap, barH)}
          {view.charging && h >= 90 ? <ChargingCap view={view} wordless={w - numW - gap < CAP_WORD_MIN} /> : null}
        </div>
      </div>
    )
  }
  const numPx = view.text ? Math.min(w * 0.34, h * 0.4) : 0
  const barH = Math.max(22, Math.min(h * 0.2, 44))
  return (
    <div className="nh-battery__column nh-battery__column--left" style={{ gap: h > 120 ? 14 : 8 }}>
      {view.text ? <BigNumber px={numPx} view={view} align="flex-start" /> : null}
      {draw(w, barH)}
      {view.charging && view.text && h >= 150 ? <ChargingCap view={view} wordless={w < CAP_WORD_MIN} /> : null}
    </div>
  )
}

// ---------- wave ----------
export function WaveLook({ box, view: view0, uid }: LookProps) {
  const { w, h } = box
  const side = h < INSIDE_MIN
  const gh = h
  const gw = side ? Math.min(w * 0.45, gh / 1.55) : Math.min(w, gh / 1.55)
  const view = side ? sideView(view0, box, gw) : view0
  const nubH = gh * 0.06
  const nubW = gw * 0.34
  const y0 = nubH
  const bodyH = gh - y0
  const rx = gw * 0.16
  const level = y0 + bodyH - (bodyH * view.pct) / 100
  const amp = Math.max(2.5, gw * 0.05)
  const wl = gw / 2
  const inside = !side && view.text
  const numPx = Math.min(gw * 0.36, bodyH * 0.22)
  const drift = (dur: number, dir: 1 | -1) =>
    view.animate ? (
      <animateTransform
        attributeName="transform"
        type="translate"
        from="0 0"
        to={`${f(dir * wl)} 0`}
        dur={`${dur}s`}
        repeatCount="indefinite"
      />
    ) : null
  const numText = (fill: string) => (
    <text
      x={f(gw / 2)}
      y={f(y0 + bodyH * 0.5)}
      textAnchor="middle"
      dominantBaseline="central"
      fontWeight="800"
      fontSize={f(numPx)}
      letterSpacing="-0.02em"
      style={{ fill }}
      className="nh-battery__wavenum">
      {view.percentText}
      {view.known ? (
        <tspan fontSize={f(numPx * 0.5)} fontWeight="700">
          %
        </tspan>
      ) : null}
    </text>
  )
  const svg = (
    <svg {...svgProps(gw, gh)}>
      <defs>
        <clipPath id={uid + 'c'}>
          <rect x="0" y={f(y0)} width={f(gw)} height={f(bodyH)} rx={f(rx)} />
        </clipPath>
        <clipPath id={uid + 'f'}>
          <path d={wavePath(gw, gh, level, amp, 0)}>{drift(5, -1)}</path>
        </clipPath>
      </defs>
      <rect x={f(gw / 2 - nubW / 2)} y="0" width={f(nubW)} height={f(nubH * 1.5)} rx={f(nubH * 0.5)} className="nh-battery__nub" />
      <rect
        x="0.75"
        y={f(y0 + 0.75)}
        width={f(gw - 1.5)}
        height={f(bodyH - 1.5)}
        rx={f(rx)}
        strokeWidth="1.5"
        className="nh-battery__vessel"
      />
      {inside ? numText('var(--nh-text)') : null}
      <g clipPath={`url(#${uid}c)`}>
        <path
          d={wavePath(gw, gh, level, amp, wl * 0.5, amp * 0.7)}
          style={{ fill: mix(75, 'white'), opacity: 0.5 }}
          className="nh-battery__waveback">
          {drift(8, 1)}
        </path>
        <path d={wavePath(gw, gh, level, amp, 0)} style={{ fill: view.color, opacity: 0.92 }} className="nh-battery__wavefront">
          {drift(5, -1)}
        </path>
        {inside ? <g clipPath={`url(#${uid}f)`}>{numText('#0f1317')}</g> : null}
      </g>
      <rect
        x={f(gw * 0.1)}
        y={f(y0 + gw * 0.1)}
        width={f(gw * 0.028)}
        height={f(bodyH * 0.28)}
        rx={f(gw * 0.014)}
        className="nh-battery__sheen"
      />
      {view.charging ? (
        <Bolt
          cx={gw / 2}
          cy={inside ? y0 + bodyH * 0.8 : y0 + bodyH * 0.5}
          h={gw * 0.3}
          style={{ fill: '#fff', stroke: 'rgba(15,19,23,.5)', strokeWidth: 1, strokeLinejoin: 'round' }}
        />
      ) : null}
    </svg>
  )
  if (side) return <Beside glyph={svg} gw={gw} box={box} view={view} />
  return (
    <Stack gw={gw} gh={gh}>
      {svg}
    </Stack>
  )
}

// ---------- meter ----------
export function MeterLook({ box, view }: LookProps) {
  const { w, h } = box
  const side = w > 1.8 * h
  const draw = (bw: number, bh: number) => {
    const gap = 3
    const n = meterCount(bw)
    const segW = (bw - gap * (n - 1)) / n
    const lit = litCount(view.pct, n)
    const segs: ReactNode[] = []
    for (let i = 0; i < n; i++) {
      const on = i < lit
      const last = on && i === lit - 1
      const fill = on ? (last ? mix(65, 'white') : view.color) : 'var(--bt-unlit)'
      segs.push(
        <rect
          key={i}
          x={f(i * (segW + gap))}
          y="0"
          width={f(segW)}
          height={f(bh)}
          rx={f(Math.min(2.5, segW * 0.3))}
          style={{ fill }}
          className={'nh-battery__seg' + (on ? ' nh-battery__seg--on' : '')}
        />
      )
    }
    return <svg {...svgProps(bw, bh)}>{segs}</svg>
  }
  if (side) {
    const numPx = view.text ? Math.min(h * 0.55, w * 0.24) : 0
    const numW = view.text ? numPx * 1.75 : 0
    const mh = Math.max(20, Math.min(h * 0.36, 40))
    const gap = view.text ? 18 : 0
    return (
      <div className="nh-battery__row">
        {view.text ? (
          <div style={{ flex: 'none', width: f(numW) }}>
            <BigNumber px={numPx} view={view} align="flex-start" />
          </div>
        ) : null}
        <div className="nh-battery__rowbar">
          {draw(w - numW - gap, mh)}
          {view.charging && h >= 90 ? <ChargingCap view={view} wordless={w - numW - gap < CAP_WORD_MIN} /> : null}
        </div>
      </div>
    )
  }
  const numPx = view.text ? Math.min(w * 0.34, h * 0.4) : 0
  const mh = Math.max(20, Math.min(h * 0.22, 40))
  return (
    <div className="nh-battery__column nh-battery__column--left" style={{ gap: h > 120 ? 14 : 8 }}>
      {view.text ? <BigNumber px={numPx} view={view} align="flex-start" /> : null}
      {draw(w, mh)}
      {view.charging && view.text && h >= 150 ? <ChargingCap view={view} wordless={w < CAP_WORD_MIN} /> : null}
    </div>
  )
}
