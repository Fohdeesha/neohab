/**
 * The four styled looks, drawn from one view of the value.
 *
 * Every one of them is the same three parts - a track, a fill and the range input whose thumb you
 * drag - arranged differently, so the parts are written once and each look is only its
 * arrangement. The input is built by the widget (it carries the handlers and the scale) and
 * handed here to be placed: a look never decides a value, only where things sit.
 *
 * What separates them beyond arrangement is in the stylesheet, which is where a fill becomes a
 * three-stop gradient, a wedge, or a bar sunk into a plate.
 */
import type { ReactNode } from 'react'

export interface FaderView {
  /** Where the value sits on its track, 0..1. The stylesheet sizes the fill from it. */
  fraction: number
  /** The reading, formatted with the digits the step resolves and any unit suffix. */
  reading: string
  /** The two ends of the scale, printed at the ends of the inset rail. */
  bounds: [string, string]
  /** The range input itself, already wired. */
  input: ReactNode
}

/**
 * The track and the thing you drag. `aria-hidden` on both painted layers: they are a picture of
 * the input's value, and a screen reader reading them out would be reading the same number twice.
 */
function Rail({ view, children }: { view: FaderView; children?: ReactNode }) {
  return (
    <div className="nh-fader__rail">
      <div className="nh-fader__track" aria-hidden="true" />
      <div className="nh-fader__fill" aria-hidden="true" />
      {view.input}
      {children}
    </div>
  )
}

/**
 * A reading over a track: the gradient look (reference 1, where the reading is the accent colour)
 * and the taper look (reference 5, where it is the ink colour). One arrangement, two skins - the
 * difference between them is entirely in what the fill is made of.
 */
export function TrackLook({ view }: { view: FaderView }) {
  return (
    <>
      <div className="nh-fader__read">{view.reading}</div>
      <Rail view={view} />
    </>
  )
}

/** The value rides the thumb in a badge, so there is no reading row to shed (reference 2). */
export function BubbleLook({ view }: { view: FaderView }) {
  return (
    <Rail view={view}>
      <div className="nh-fader__badge" aria-hidden="true">
        {view.reading}
      </div>
    </Rail>
  )
}

/**
 * A rail sunk into a plate with the ends of the scale printed either side of it (reference 3).
 * The reading sits above, which the reference does not have: it lets the thumb's position say
 * the value, and on a dashboard the number is the point. It is the first thing shed when the tile
 * runs out of room, and the ends stay.
 */
export function InsetLook({ view }: { view: FaderView }) {
  return (
    <>
      <div className="nh-fader__read">{view.reading}</div>
      <div className="nh-fader__plate">
        <span className="nh-fader__bound">{view.bounds[0]}</span>
        <Rail view={view} />
        <span className="nh-fader__bound">{view.bounds[1]}</span>
      </div>
    </>
  )
}
