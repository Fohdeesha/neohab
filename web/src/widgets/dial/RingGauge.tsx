import { useEffect, useRef, useState } from 'react'
import type { WidgetProps } from '../types'
import { WidgetFrame } from '../common/WidgetFrame'
import { numericValue } from '../common/format'
import { getItemHistory } from '../../api/persistence'
import { arcPath, polar, stepDecimals, useTweened } from './geometry'
import {
  arcOf,
  blockLit,
  fractionOf,
  fractionToAngle,
  gaugeColor,
  gaugeTicks,
  angleToValue,
  hasInnerRing,
  historyBars,
  historyPeriodMs,
  inAlarm,
  ledCountOf,
  ledFraction,
  ledLit,
  pickRing,
  scaleOf,
  sparkSegments,
  zeroFractionOf,
  type DialConfig,
  type GaugeMarker,
  type GaugeZone,
  type RingStyle,
} from './gauge'

/**
 * The ring gauge styles: one or two rings - glowing LED beads, a continuous solid band,
 * chunky flat blocks, or clay-shaded 3D - with severity colors and a center readout.
 */
export function RingGauge({ config, ctx }: WidgetProps<DialConfig>) {
  const kind: RingStyle =
    config.style === 'arc' || config.style === 'blocks' || config.style === '3d' || config.style === 'ticks'
      ? config.style
      : 'led'
  // Guarded at the read like every other stored value here: a min or max that is not a number
  // drew NaN arcs and a reading of "NaN", and a zero step divided by zero in the pointer snap.
  const { min, max, step } = scaleOf(config)
  const decimals = stepDecimals(step)
  const { min: min2, max: max2, step: step2 } = scaleOf(config, 'inner')
  const decimals2 = stepDecimals(step2)
  const inner = hasInnerRing(config)
  const svgRef = useRef<SVGSVGElement>(null)
  const [drag, setDrag] = useState<{ ring: 'outer' | 'inner'; v: number } | null>(null)

  const { start, sweep } = arcOf(config)
  const count = ledCountOf(config)
  const bidirectional = config.bidirectional === true
  const showTicks = config.showTicks === true

  const state = ctx.getItem(config.item)
  const live = Math.min(max, Math.max(min, numericValue(state) ?? min))
  const tweened = useTweened(live, drag?.ring !== 'outer')
  const value = drag?.ring === 'outer' ? drag.v : tweened
  const state2 = ctx.getItem(config.item2 ?? '')
  const live2 = Math.min(max2, Math.max(min2, numericValue(state2) ?? min2))
  const tweened2 = useTweened(live2, drag?.ring !== 'inner')
  const value2 = drag?.ring === 'inner' ? drag.v : tweened2

  const frac = fractionOf(value, min, max)
  const zeroFrac = zeroFractionOf(min, max, bidirectional)
  const frac2 = fractionOf(value2, min2, max2)
  const zeroFrac2 = zeroFractionOf(min2, max2, config.bidirectional2 === true)
  const color = gaugeColor(value, config.severity, config.color) ?? 'var(--nh-primary)'
  const color2 = gaugeColor(value2, config.severity2, config.color2) ?? 'var(--nh-primary)'
  const primaryIsInner = inner && config.centerShows === 'inner'
  const alarmed = inAlarm(config, live, min, max)
  // the glow is the LED style's signature; the flat and clay styles default it off
  const bloomVisible = (config.bloom ?? (kind === 'led')) || alarmed
  const bloomColor = primaryIsInner ? color2 : color

  /* Geometry: ticks need room outside the ring, so the ring shrinks when they are shown. */
  const R = showTicks ? 34 : 44
  const centerR = showTicks ? 21 : 27
  const slots = sweep >= 360 ? count : Math.max(1, count - 1)
  const arcGap = (2 * Math.PI * R * (sweep / 360)) / slots
  const ledR = Math.min(2.5, Math.max(0.9, arcGap * 0.42))
  /* The tick ring: fine radial marks hung between two hairline rims near the rim of the face,
     the lit ones reaching a little further in so the reading is legible as a length as well as
     a color. Short marks and a wide-open middle are what make it read as an instrument. */
  const tickRing = kind === 'ticks'
  const tickW = Math.min(1.6, Math.max(0.5, arcGap * 0.24))
  const tickOuter = R + 2
  const tickLen = R * 0.105
  const tickLenLit = R * 0.145
  /* the inner ring sits inside the outer beads' halos, with its own smaller beads; the tick
     ring's second ring hangs just inside the first one's rim */
  const R2 = tickRing ? R - 8 : R * 0.76
  const ledR2 = Math.min(2.1, Math.max(0.8, ((2 * Math.PI * R2 * (sweep / 360)) / slots) * 0.42))
  /* solid band and block thicknesses (viewBox units), outer and inner */
  const bandW = 7
  const bandW2 = 4.5
  /* 3d: the value arc sits between the clay block ring and the disc */
  const R3 = R * 0.72
  const R3i = R * 0.55

  const uid = ctx.widgetId
  const ticks = showTicks
    ? gaugeTicks(min, max, start, sweep, config.tickSteps ?? 5, decimals, config.showTickLabels !== false)
    : []

  const ringFromPointer = (e: React.PointerEvent): 'outer' | 'inner' => {
    if (!inner) return 'outer'
    const rect = svgRef.current!.getBoundingClientRect()
    const dx = e.clientX - (rect.left + rect.width / 2)
    const dy = e.clientY - (rect.top + rect.height / 2)
    const units = (Math.hypot(dx, dy) / (Math.min(rect.width, rect.height) / 2)) * 50
    return pickRing(units, R, R2)
  }

  const valueFromPointer = (e: React.PointerEvent, ring: 'outer' | 'inner'): number => {
    const rect = svgRef.current!.getBoundingClientRect()
    const cx = rect.left + rect.width / 2
    const cy = rect.top + rect.height / 2
    // atan2 in screen space IS the SVG angle space: 0° at 3 o'clock, clockwise positive
    const angle = (Math.atan2(e.clientY - cy, e.clientX - cx) * 180) / Math.PI
    return ring === 'inner'
      ? angleToValue(angle, min2, max2, start, sweep, step2, decimals2)
      : angleToValue(angle, min, max, start, sweep, step, decimals)
  }

  const onPointerDown = (e: React.PointerEvent) => {
    if (ctx.editing || config.readOnly || !config.item) return
    ;(e.target as Element).setPointerCapture(e.pointerId)
    const ring = ringFromPointer(e)
    setDrag({ ring, v: valueFromPointer(e, ring) })
  }
  const onPointerMove = (e: React.PointerEvent) => {
    if (drag !== null) setDrag({ ring: drag.ring, v: valueFromPointer(e, drag.ring) })
  }
  const onPointerUp = () => {
    if (drag === null) return
    const { ring, v } = drag
    setDrag(null)
    void ctx.sendCommand(ring === 'inner' ? config.item2! : config.item, String(v))
  }

  const text = value.toFixed(decimals)
  const text2 = value2.toFixed(decimals2)
  const primaryText = primaryIsInner ? text2 : text
  const primaryUnit = primaryIsInner ? config.unit2 : config.unit
  /* "39 / 58": the reading over its scale maximum (trailing zeros dropped, like tick labels) */
  const maxText =
    config.showMax === true
      ? String(Number((primaryIsInner ? max2 : max).toFixed(primaryIsInner ? decimals2 : decimals)))
      : null
  const secondaryLine = inner
    ? (primaryIsInner ? text : text2) + ((primaryIsInner ? config.unit : config.unit2) ? ' ' + (primaryIsInner ? config.unit : config.unit2) : '')
    : null
  /* The tick ring has no center disc to fit inside, so its reading takes the whole face -
     the instrument look, where the number is the widget. */
  /* the "/ 58" tail is drawn at ~0.44x the value size, so it costs about half its length */
  const centerLen = primaryText.length + (maxText !== null ? (maxText.length + 2) * 0.55 : 0)
  const valueSize = (centerR * (tickRing ? 1.15 : 0.52)) * Math.min(1, (tickRing ? 4.2 : 5.5) / Math.max(1, centerLen))
  /** The gauge names itself inside the face instead of in the tile header. */
  const named = config.centerLabel === true && (config.label ?? '') !== ''

  // stored lists are untrusted input - a hand-edited config can hold anything here
  const markers = (Array.isArray(config.markers) ? config.markers : []).flatMap((m: GaugeMarker, i) => {
    const mv = m.item ? numericValue(ctx.getItem(m.item)) : m.value
    if (typeof mv !== 'number' || !Number.isFinite(mv)) return []
    return [{ ...m, angle: fractionToAngle(fractionOf(mv, min, max), start, sweep), key: i }]
  })
  const zones = (Array.isArray(config.zones) ? config.zones : []).flatMap((z: GaugeZone, i) => {
    if (typeof z.from !== 'number' || typeof z.to !== 'number' || !Number.isFinite(z.from) || !Number.isFinite(z.to)) return []
    const a1 = fractionToAngle(fractionOf(Math.min(z.from, z.to), min, max), start, sweep)
    const a2 = fractionToAngle(fractionOf(Math.max(z.from, z.to), min, max), start, sweep)
    return a2 > a1 ? [{ ...z, a1, a2, key: i }] : []
  })

  /* opt-in history bars under the center value, following the primary ring's item */
  const historyOn = config.history === true
  const histItem = (primaryIsInner ? config.item2 : config.item) || ''
  const periodMs = historyPeriodMs(config)
  const [bars, setBars] = useState<(number | null)[] | null>(null)
  useEffect(() => {
    if (!historyOn || histItem === '') {
      setBars(null)
      return
    }
    let dead = false
    const load = async () => {
      try {
        const t1 = Date.now()
        const t0 = t1 - periodMs
        const pts = await getItemHistory(histItem, new Date(t0), { boundary: true })
        const nums = pts.map((p) => ({ time: p.time, value: parseFloat(p.state) }))
        if (!dead) setBars(historyBars(nums, t0, t1, 24))
      } catch {
        if (!dead) setBars(null)
      }
    }
    void load()
    const timer = setInterval(load, 300_000)
    return () => {
      dead = true
      clearInterval(timer)
    }
  }, [historyOn, histItem, periodMs])
  const showBars = historyOn && bars !== null && bars.some((b) => b !== null)
  const historyLine = config.historyStyle === 'line'

  /** Lit fraction range along the arc: from the start (or the zero reference) to the value. */
  const span = (vf: number, zf: number, bidi: boolean): [number, number] | null => {
    const lo = bidi ? Math.min(vf, zf) : 0
    const hi = bidi ? Math.max(vf, zf) : vf
    return hi - lo > 1e-6 ? [lo, hi] : null
  }
  const segPath = (RR: number, f1: number, f2: number) => {
    // a full-circle span has identical endpoints, and an SVG arc between identical points
    // draws nothing - split it into two half arcs
    if (sweep >= 360 && f2 - f1 > 0.9999) {
      const a0 = fractionToAngle(f1, start, sweep)
      const p0 = polar(50, 50, RR, a0)
      const ph = polar(50, 50, RR, a0 + 180)
      return `M ${p0.x} ${p0.y} A ${RR} ${RR} 0 1 1 ${ph.x} ${ph.y} A ${RR} ${RR} 0 1 1 ${p0.x} ${p0.y}`
    }
    return arcPath(50, 50, RR, fractionToAngle(f1, start, sweep), fractionToAngle(f2, start, sweep))
  }

  /** Clay-shaded solid value arc (the 3d style's indicator, outer or inner). */
  const clayArc = (RR: number, w: number, vf: number, zf: number, bidi: boolean, col: string, key: string) => {
    const s = span(vf, zf, bidi)
    return (
      <g key={key}>
        <path className="nh-gauge__btrack nh-gauge__btrack--soft" d={segPath(RR, 0, 1)} strokeWidth={w} strokeLinecap="round" />
        {s ? (
          <>
            <path
              className="nh-gauge__clayshadow"
              d={segPath(RR, s[0], s[1])}
              strokeWidth={w}
              strokeLinecap="round"
              transform="translate(0.7 1.1)"
            />
            <path className="nh-gauge__band" d={segPath(RR, s[0], s[1])} strokeWidth={w} stroke={col} strokeLinecap="round" />
            <path
              className="nh-gauge__clayhi"
              d={segPath(RR, s[0], s[1])}
              strokeWidth={w * 0.34}
              strokeLinecap="round"
              transform="translate(-0.3 -0.5)"
            />
          </>
        ) : null}
      </g>
    )
  }

  /** Chunky flat block segments (the blocks style, outer or inner ring). */
  const blockRing = (RR: number, w: number, vf: number, zf: number, bidi: boolean, col: string, innerRing: boolean) =>
    Array.from({ length: count }, (_, i) => {
      const lit = blockLit(i, count, vf, zf, bidi)
      if (!lit && config.hideUnlit) return null
      const d = segPath(RR, (i + 0.09) / count, (i + 0.91) / count)
      // lit stroke via attribute only - a stylesheet stroke would override it
      return lit ? (
        <path
          key={`${innerRing ? 'ib' : 'b'}-${i}`}
          className={'nh-gauge__blklit' + (innerRing ? ' nh-gauge__blklit--inner' : '')}
          d={d}
          strokeWidth={w}
          stroke={col}
        />
      ) : (
        <path
          key={`${innerRing ? 'ib' : 'b'}-${i}`}
          className={'nh-gauge__blk' + (innerRing ? ' nh-gauge__blk--inner' : '')}
          d={d}
          strokeWidth={w}
        />
      )
    })

  /** Continuous solid band with a dim track (the arc style, outer or inner ring). The two
      film overlays after the band are invisible until a theme raises --nh-band-light /
      --nh-band-shade: a brightened tail at the value tip and a darkened one at the start,
      each faded along its own chord - a lit arc, without touching the band's own attribute
      paint (which severity stops and the color setting drive). */
  const bandRing = (RR: number, w: number, vf: number, zf: number, bidi: boolean, col: string, key: string) => {
    const s = span(vf, zf, bidi)
    const film = s && s[1] - s[0] > 0.03 ? Math.min(0.25, (s[1] - s[0]) * 0.45) : 0
    const chord = (from: number, to: number) => {
      const p1 = polar(50, 50, RR, fractionToAngle(from, start, sweep))
      const p2 = polar(50, 50, RR, fractionToAngle(to, start, sweep))
      return { x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y }
    }
    return (
      <g key={key}>
        <path className="nh-gauge__btrack" d={segPath(RR, 0, 1)} strokeWidth={w} />
        {s ? <path className="nh-gauge__band" d={segPath(RR, s[0], s[1])} strokeWidth={w} stroke={col} /> : null}
        {s && film > 0 ? (
          <>
            <defs>
              <linearGradient id={`nh-g-shade-${uid}-${key}`} gradientUnits="userSpaceOnUse" {...chord(s[0] + film, s[0])}>
                <stop offset="0" style={{ stopColor: 'rgba(0, 0, 0, 0)' }} />
                <stop offset="1" style={{ stopColor: 'rgba(0, 0, 0, var(--nh-band-shade, 0))' }} />
              </linearGradient>
              <linearGradient id={`nh-g-tip-${uid}-${key}`} gradientUnits="userSpaceOnUse" {...chord(s[1] - film, s[1])}>
                <stop offset="0" style={{ stopColor: 'rgba(255, 255, 255, 0)' }} />
                <stop offset="1" style={{ stopColor: 'rgba(255, 255, 255, var(--nh-band-light, 0))' }} />
              </linearGradient>
            </defs>
            <path
              className="nh-gauge__bandshade"
              d={segPath(RR, s[0], s[0] + film)}
              strokeWidth={w}
              stroke={`url(#nh-g-shade-${uid}-${key})`}
            />
            <path
              className="nh-gauge__bandlight"
              d={segPath(RR, s[1] - film, s[1])}
              strokeWidth={w}
              stroke={`url(#nh-g-tip-${uid}-${key})`}
            />
          </>
        ) : null}
      </g>
    )
  }

  /* Center layout. The tick ring gets its own: a wide-open face with the name above the
     reading, the unit raised beside it as a superscript, and the sparkline below - the
     reference instrument panel. Every other style keeps the layout it already had. */
  const nameY = tickRing ? 50 - R * 0.48 : 50 - centerR * 0.62
  const nameSize = tickRing ? R * 0.165 : centerR * 0.2
  const valueY = tickRing
    ? (named ? 52 : 50) + (showBars ? -1.5 : 0)
    : showBars
      ? inner
        ? 41.5
        : 44
      : config.unit || inner
        ? 47.5
        : 50
  const valueFont = tickRing
    ? valueSize * (inner || showBars ? 0.9 : 1)
    : showBars && inner
      ? valueSize * 0.78
      : inner || showBars
        ? valueSize * 0.92
        : valueSize
  /* history: bars, or a sparkline through the same normalized series */
  const histY = tickRing
    ? 50 + R * 0.58
    : Math.min(50 + centerR - 3.5, 50 + centerR * (inner ? 0.62 : 0.55))
  const histH = tickRing ? R * 0.19 : centerR * (inner ? 0.26 : 0.32)
  const histHalf = Math.sqrt(Math.max(0, centerR * centerR - (histY - 50) * (histY - 50)))
  const histW = tickRing ? R * 0.86 : Math.min(centerR * 1.5, 2 * histHalf - 5)

  return (
    <WidgetFrame
      label={named ? undefined : config.label}
      icon={config.icon}
      iconSize={config.iconSize}
      iconState={state?.state}
      iconColor={config.iconColor}
      center
    >
      <svg
        ref={svgRef}
        className={'nh-dial nh-dial--ring nh-dial--' + kind + (config.readOnly ? ' nh-dial--readonly' : '')}
        viewBox="0 0 100 100"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => setDrag(null)}
      >
        <defs>
          {/* one gradient set per instance - SVG ids are document-global */}
          <radialGradient id={`nh-g-led-${uid}`}>
            <stop offset="0" style={{ stopColor: '#ffffff', stopOpacity: 0.9 }} />
            <stop offset="1" style={{ stopColor: color, stopOpacity: 1 }} />
          </radialGradient>
          <radialGradient id={`nh-g-halo-${uid}`}>
            <stop offset="0" style={{ stopColor: color, stopOpacity: 0.55 }} />
            <stop offset="1" style={{ stopColor: color, stopOpacity: 0 }} />
          </radialGradient>
          {inner ? (
            <>
              <radialGradient id={`nh-g-led2-${uid}`}>
                <stop offset="0" style={{ stopColor: '#ffffff', stopOpacity: 0.9 }} />
                <stop offset="1" style={{ stopColor: color2, stopOpacity: 1 }} />
              </radialGradient>
              <radialGradient id={`nh-g-halo2-${uid}`}>
                <stop offset="0" style={{ stopColor: color2, stopOpacity: 0.55 }} />
                <stop offset="1" style={{ stopColor: color2, stopOpacity: 0 }} />
              </radialGradient>
            </>
          ) : null}
          <radialGradient id={`nh-g-bloom-${uid}`}>
            <stop offset="0" style={{ stopColor: bloomColor, stopOpacity: 0.8 }} />
            <stop offset="0.55" style={{ stopColor: bloomColor, stopOpacity: 0.5 }} />
            <stop offset="1" style={{ stopColor: bloomColor, stopOpacity: 0 }} />
          </radialGradient>
          {tickRing ? (
            <>
              {/* Rim and face shading. Both read theme variables that default to what the
                  flat look already was (the rim's own border color, a transparent face), so
                  every other theme renders exactly as before and a theme that wants a lit
                  instrument sets the four variables. */}
              <linearGradient id={`nh-g-rim-${uid}`} x1="0.1" y1="0" x2="0.8" y2="1">
                <stop offset="0" style={{ stopColor: 'var(--nh-rim-hi, var(--nh-border))', stopOpacity: 1 }} />
                <stop offset="0.45" style={{ stopColor: 'var(--nh-rim-lo, var(--nh-border))', stopOpacity: 1 }} />
                <stop offset="1" style={{ stopColor: 'var(--nh-rim-lo, var(--nh-border))', stopOpacity: 0.35 }} />
              </linearGradient>
              <radialGradient id={`nh-g-face-${uid}`} cx="0.5" cy="0.36" r="0.68">
                <stop offset="0" style={{ stopColor: 'var(--nh-face-hi, transparent)', stopOpacity: 1 }} />
                <stop offset="0.55" style={{ stopColor: 'var(--nh-face-lo, transparent)', stopOpacity: 1 }} />
                <stop offset="1" style={{ stopColor: 'var(--nh-face-lo, transparent)', stopOpacity: 0 }} />
              </radialGradient>
            </>
          ) : null}
        </defs>
        {kind === 'arc' ? (
          sweep >= 360 ? (
            <circle className="nh-gauge__face" cx={50} cy={50} r={R - bandW / 2 - 1} />
          ) : (
            <path
              className="nh-gauge__face"
              d={(() => {
                const rf = R - bandW / 2 - 1
                const p1 = polar(50, 50, rf, fractionToAngle(0, start, sweep))
                const p2 = polar(50, 50, rf, fractionToAngle(1, start, sweep))
                return `M 50 50 L ${p1.x} ${p1.y} A ${rf} ${rf} 0 ${sweep > 180 ? 1 : 0} 1 ${p2.x} ${p2.y} Z`
              })()}
            />
          )
        ) : null}
        {bloomVisible && (primaryIsInner ? frac2 : frac) > 0 ? (
          <circle
            className={'nh-gauge__bloom' + (alarmed ? ' nh-gauge__bloom--pulse' : '')}
            cx={50}
            cy={50}
            r={Math.max(
              centerR + 2,
              kind === '3d'
                ? (inner ? R3i : R3) - 3
                : kind === 'led'
                  ? (inner ? R2 : R) - (inner ? ledR2 : ledR) * 2 - 0.5
                  : (inner ? R2 : R) - (inner ? bandW2 : bandW) / 2 - 0.5
            )}
            fill={`url(#nh-g-bloom-${uid})`}
          />
        ) : null}
        {zones.map((z) => (
          <path
            key={`z-${z.key}`}
            className="nh-gauge__zone"
            d={arcPath(50, 50, kind === 'led' ? R + ledR * 2.4 + 1 : R + bandW / 2 + 1.8, z.a1, z.a2)}
            stroke={z.color || 'var(--nh-primary)'}
          />
        ))}
        {kind === 'led'
          ? Array.from({ length: count }, (_, i) => {
              const lit = ledLit(i, count, sweep, frac, zeroFrac, bidirectional)
              if (!lit && config.hideUnlit) return null
              const p = polar(50, 50, R, fractionToAngle(ledFraction(i, count, sweep), start, sweep))
              return lit ? (
                <g key={i}>
                  <circle className="nh-gauge__halo" cx={p.x} cy={p.y} r={ledR * 2.4} fill={`url(#nh-g-halo-${uid})`} />
                  {/* own class, no CSS fill: a stylesheet fill would beat the gradient attribute */}
                  <circle className="nh-gauge__ledlit" cx={p.x} cy={p.y} r={ledR} fill={`url(#nh-g-led-${uid})`} />
                </g>
              ) : (
                <circle key={i} className="nh-gauge__led" cx={p.x} cy={p.y} r={ledR} />
              )
            })
          : null}
        {tickRing ? (
          <>
            {/* the face's own light, behind everything; transparent unless a theme lights it */}
            <circle className="nh-gauge__face2" cx={50} cy={50} r={R + 4} fill={`url(#nh-g-face-${uid})`} />
            {/* hairline rims bracket the marks - the instrument bezel. The stroke is an
                attribute pointing at the gradient, so neither stylesheet may set one. */}
            <circle className="nh-gauge__rim" cx={50} cy={50} r={R + 4} stroke={`url(#nh-g-rim-${uid})`} />
            {inner ? null : (
              <circle className="nh-gauge__rim" cx={50} cy={50} r={R - 5} stroke={`url(#nh-g-rim-${uid})`} />
            )}
            {Array.from({ length: count }, (_, i) => {
              const lit = ledLit(i, count, sweep, frac, zeroFrac, bidirectional)
              if (!lit && config.hideUnlit) return null
              const a = fractionToAngle(ledFraction(i, count, sweep), start, sweep)
              const p1 = polar(50, 50, tickOuter, a)
              const p2 = polar(50, 50, tickOuter - (lit ? tickLenLit : tickLen), a)
              // lit marks take their color from the attribute - a stylesheet stroke on the
              // class would override it, so the lit class carries no stroke rule
              return (
                <line
                  key={`k-${i}`}
                  className={lit ? 'nh-gauge__tklit' : 'nh-gauge__tkmark'}
                  x1={p1.x}
                  y1={p1.y}
                  x2={p2.x}
                  y2={p2.y}
                  strokeWidth={tickW}
                  {...(lit ? { stroke: color } : {})}
                />
              )
            })}
            {inner
              ? Array.from({ length: count }, (_, i) => {
                  const lit = ledLit(i, count, sweep, frac2, zeroFrac2, config.bidirectional2 === true)
                  if (!lit && config.hideUnlit) return null
                  const a = fractionToAngle(ledFraction(i, count, sweep), start, sweep)
                  const p1 = polar(50, 50, R2, a)
                  const p2 = polar(50, 50, R2 - (lit ? tickLenLit : tickLen) * 0.7, a)
                  return (
                    <line
                      key={`ki-${i}`}
                      className={lit ? 'nh-gauge__tklit' : 'nh-gauge__tkmark'}
                      x1={p1.x}
                      y1={p1.y}
                      x2={p2.x}
                      y2={p2.y}
                      strokeWidth={tickW * 0.85}
                      {...(lit ? { stroke: color2 } : {})}
                    />
                  )
                })
              : null}
          </>
        ) : null}
        {kind === 'arc' ? bandRing(R, bandW, frac, zeroFrac, bidirectional, color, 'band') : null}
        {kind === 'blocks' ? blockRing(R, bandW, frac, zeroFrac, bidirectional, color, false) : null}
        {kind === '3d' ? (
          <g>
            {Array.from({ length: count }, (_, i) => {
              const lit = blockLit(i, count, frac, zeroFrac, bidirectional)
              if (!lit && config.hideUnlit) return null
              const d = segPath(R - 1, (i + 0.12) / count, (i + 0.88) / count)
              return (
                <g key={`c-${i}`}>
                  <path className="nh-gauge__clayshadow" d={d} strokeWidth={6.4} transform="translate(0.7 1.1)" />
                  {/* stroke always set as an attribute - a stylesheet stroke would override the lit color */}
                  <path
                    className={'nh-gauge__claybody' + (lit ? ' nh-gauge__claybody--lit' : '')}
                    d={d}
                    strokeWidth={6.4}
                    stroke={lit ? color : 'var(--nh-surface-2)'}
                  />
                  <path className="nh-gauge__clayhi" d={d} strokeWidth={2} transform="translate(-0.35 -0.55)" />
                </g>
              )
            })}
            {clayArc(R3, 5.5, frac, zeroFrac, bidirectional, color, 'v3')}
            {!inner
              ? Array.from({ length: 14 }, (_, i) => {
                  const p = polar(50, 50, (R3 + centerR) / 2, fractionToAngle(ledFraction(i, 14, sweep), start, sweep))
                  return <circle key={`d-${i}`} className="nh-gauge__led" cx={p.x} cy={p.y} r={1.15} />
                })
              : null}
          </g>
        ) : null}
        {inner && kind === 'led'
          ? Array.from({ length: count }, (_, i) => {
              const lit = ledLit(i, count, sweep, frac2, zeroFrac2, config.bidirectional2 === true)
              if (!lit && config.hideUnlit) return null
              const p = polar(50, 50, R2, fractionToAngle(ledFraction(i, count, sweep), start, sweep))
              return lit ? (
                <g key={`i-${i}`}>
                  <circle className="nh-gauge__halo" cx={p.x} cy={p.y} r={ledR2 * 2.4} fill={`url(#nh-g-halo2-${uid})`} />
                  <circle className="nh-gauge__ledlit nh-gauge__ledlit--inner" cx={p.x} cy={p.y} r={ledR2} fill={`url(#nh-g-led2-${uid})`} />
                </g>
              ) : (
                <circle key={`i-${i}`} className="nh-gauge__led nh-gauge__led--inner" cx={p.x} cy={p.y} r={ledR2} />
              )
            })
          : null}
        {inner && kind === 'arc'
          ? bandRing(R2, bandW2, frac2, zeroFrac2, config.bidirectional2 === true, color2, 'band2')
          : null}
        {inner && kind === 'blocks'
          ? blockRing(R2, bandW2, frac2, zeroFrac2, config.bidirectional2 === true, color2, true)
          : null}
        {inner && kind === '3d' ? clayArc(R3i, 4, frac2, zeroFrac2, config.bidirectional2 === true, color2, 'v3i') : null}
        {ticks.map((tk, i) => {
          // the arc style's ticks cross the band, tachometer-style; the others sit outside
          const p1 = polar(
            50,
            50,
            kind === 'arc' ? (tk.major ? R - bandW / 2 - 1.2 : R - bandW / 2) : tk.major ? R + 5.5 : R + 6.3,
            tk.angle
          )
          const p2 = polar(
            50,
            50,
            kind === 'arc' ? (tk.major ? R + bandW / 2 + 1.2 : R + bandW / 2) : tk.major ? R + 10.3 : R + 8.8,
            tk.angle
          )
          return (
            <g key={`t-${i}`}>
              <line
                className={'nh-gauge__tick' + (tk.major ? '' : ' nh-gauge__tick--minor')}
                x1={p1.x}
                y1={p1.y}
                x2={p2.x}
                y2={p2.y}
              />
              {tk.label !== undefined ? (
                <text
                  className="nh-gauge__ticklabel"
                  {...(() => {
                    const p = polar(50, 50, R + 13, tk.angle)
                    // keep the label inside the viewBox - a left/right-edge label would clip
                    const half = tk.label!.length * 1.25
                    return { x: Math.min(99 - half, Math.max(1 + half, p.x)), y: p.y }
                  })()}
                  textAnchor="middle"
                  dominantBaseline="central"
                >
                  {tk.label}
                </text>
              ) : null}
            </g>
          )
        })}
        {markers.map((m) => {
          const mHalf = kind === 'led' ? 2.8 : 4.2
          const p1 = polar(50, 50, R - mHalf, m.angle)
          const p2 = polar(50, 50, R + mHalf, m.angle)
          const pl = polar(50, 50, R - mHalf - 3.7, m.angle)
          return (
            <g key={`m-${m.key}`}>
              <line
                className="nh-gauge__marker"
                x1={p1.x}
                y1={p1.y}
                x2={p2.x}
                y2={p2.y}
                stroke={m.color || '#ffffff'}
              />
              {m.label ? (
                <text className="nh-gauge__markerlabel" x={pl.x} y={pl.y} textAnchor="middle" dominantBaseline="central">
                  {m.label}
                </text>
              ) : null}
            </g>
          )
        })}
        {kind === '3d' ? <circle className="nh-gauge__clayshadow2" cx={50.7} cy={51.3} r={centerR} /> : null}
        {/* the tick ring is an open face: no disc behind the reading */}
        {tickRing ? null : <circle className="nh-gauge__center" cx={50} cy={50} r={centerR} />}
        {kind === '3d' ? <path className="nh-gauge__clayhi2" d={arcPath(50, 50, centerR - 1.4, -165, -15)} /> : null}
        {named ? (
          <text
            className="nh-gauge__name"
            x={50}
            y={nameY}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={nameSize}
          >
            {config.label}
          </text>
        ) : null}
        <text
          className="nh-gauge__value"
          x={50}
          y={valueY}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={valueFont}
          /* the tick ring reads its value in the ring's own color, the way the reference
             instrument does. An inline style, because a stylesheet fill on .nh-gauge__value
             would beat a fill attribute. */
          style={tickRing ? { fill: primaryIsInner ? color2 : color } : undefined}
        >
          {primaryText}
          {maxText !== null ? (
            <tspan className="nh-gauge__max" fontSize={valueFont * 0.44}>
              {' / ' + maxText}
            </tspan>
          ) : null}
          {/* raised beside the reading on the tick ring, trailing it on the others */}
          {tickRing && primaryUnit ? (
            <tspan
              className="nh-gauge__unit nh-gauge__unit--raised"
              fontSize={valueFont * 0.42}
              dy={-valueFont * 0.4}
              style={{ fill: primaryIsInner ? color2 : color }}
            >
              {primaryUnit}
            </tspan>
          ) : (inner || showBars) && primaryUnit ? (
            <tspan className="nh-gauge__unit" fontSize={centerR * 0.22}>
              {' ' + primaryUnit}
            </tspan>
          ) : null}
        </text>
        {inner ? (
          /* dual gauge: the other ring's reading, smaller and dim, under the primary */
          <text
            className="nh-gauge__unit nh-gauge__second"
            x={50}
            y={tickRing ? valueY + valueFont * 0.62 : showBars ? 48.6 : 50 + centerR * 0.38}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={tickRing ? nameSize : centerR * (showBars ? 0.23 : 0.26)}
          >
            {secondaryLine}
          </text>
        ) : !tickRing && config.unit && !showBars ? (
          <text
            className="nh-gauge__unit"
            x={50}
            y={50 + centerR * 0.38}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={centerR * 0.24}
          >
            {config.unit}
          </text>
        ) : null}
        {showBars
          ? (() => {
              const n = bars!.length
              if (historyLine) {
                // a trace rather than bars: the instrument-panel sparkline
                return (
                  <g>
                    {sparkSegments(bars!, 50 - histW / 2, histW, histY, histH).map((d, i) => (
                      <path key={`s-${i}`} className="nh-gauge__spark" d={d} stroke={bloomColor} />
                    ))}
                  </g>
                )
              }
              return (
                <g>
                  {bars!.map((b, i) =>
                    b === null ? null : (
                      <rect
                        key={`h-${i}`}
                        className="nh-gauge__bar"
                        x={50 - histW / 2 + (i + 0.14) * (histW / n)}
                        y={histY - (0.15 + 0.85 * b) * histH}
                        width={(histW / n) * 0.72}
                        height={(0.15 + 0.85 * b) * histH}
                        rx={0.5}
                        fill={bloomColor}
                      />
                    )
                  )}
                </g>
              )
            })()
          : null}
      </svg>
    </WidgetFrame>
  )
}
