/**
 * How big the clock may draw one of its lines in the tile it has been given.
 *
 * A grid cell is a size container, so `cqw` and `cqh` are the tile's own width and height -
 * which is what lets a reading shrink to the tile instead of overflowing it. The em size comes
 * first in the `min()`, so a cell with room renders exactly as it always did; the caps bite only
 * where the natural size does not fit, which is where a landscape phone used to wrap
 * "08:25:54 AM" after the seconds and then clip both lines away.
 */

/**
 * How wide a string renders per unit of font size, for the digits and short words a clock
 * shows. Measured in place across the formats at 0.48 to 0.51 em a character; rounded up, so
 * the cap errs towards a slightly smaller reading rather than a clipped one.
 */
export const EM_PER_CHAR = 0.56
/** How much of the cell's width the reading may use; the rest is the tile's own padding. */
export const WIDTH_BUDGET = 88
/** Keeps the height calc positive: a negative font-size is invalid, and a dropped declaration
 *  would fall back to a size far too big for the cell that caused it. */
export const MIN_PX = 6

/**
 * The size cap for one line, as the CSS `min()` the stylesheet reads from a custom property.
 *
 * The width cap is worked out from the string rather than fixed, because "08:25" needs less
 * than half the room "08:25:54 AM" does and a fixed cap would have to assume the longest.
 *
 * The height cap is not a flat percentage either: the tile's border and padding cost a fixed
 * `chrome` px whatever the cell is, so a percentage generous enough for a 45px cell throws away
 * 15 per cent of a 113px one - which showed up at once as a phone clock a size smaller than it
 * had been. What is left after the chrome, times this line's `share` of it, is the honest
 * figure. The share follows from the line heights: a time over a date gets 1/1.7 of the room, a
 * time on its own nearly all of it, and the widget knows which it is drawing.
 *
 * Delivered as a custom property rather than an inline font-size: an inline size would beat
 * every stylesheet, including the themes that draw the clock in their own segment face.
 */
/**
 * The lines a clock tile can stack, each with the size it wants and the line box that size costs.
 *
 * `em` is relative to the CELL's font size, which is where the dashboard's own text scaling has
 * already landed; `lh` has to match the `line-height` the stylesheet gives that line, or the
 * heights worked out below are not the heights drawn.
 */
export const CLOCK_LINES = {
  time: { em: 2, lh: 1.1 },
  zone: { em: 0.7, lh: 1.3 },
  date: { em: 0.9, lh: 1.35 },
  /** The date when it IS the reading, rather than a caption under the time. */
  dateOnly: { em: 1.1, lh: 1.35 }
} as const

export type ClockLine = keyof typeof CLOCK_LINES

/** The gap the stylesheet leaves between two stacked lines. */
export const LINE_GAP_PX = 4
/** The tile's own border and padding, which cost the same whatever the cell is. */
export const BASE_CHROME_PX = 14

/** What the tile spends on itself before any line is drawn: its chrome, plus the gaps. */
export function chromeFor(present: readonly ClockLine[]): number {
  return BASE_CHROME_PX + LINE_GAP_PX * Math.max(0, present.length - 1)
}

/**
 * This line's share of the height left after the chrome.
 *
 * Every line is sized in proportion to the others, so the tallest one can be solved for and the
 * rest follow from it: total height is the sum of `lh * em` over the lines present, and each
 * line's own cap is its `em` divided by that sum. Worked out rather than written down, because
 * the numbers change with every combination of lines - and the widget grew a third line the
 * moment it learned to name a zone.
 */
export function shareOf(line: ClockLine, present: readonly ClockLine[]): number {
  const total = present.reduce((sum, l) => sum + CLOCK_LINES[l].lh * CLOCK_LINES[l].em, 0)
  if (total <= 0) return 0
  // Floored to three places, not rounded: rounding up hands back a fraction of the very budget
  // the cap exists to enforce, and three places is where the numbers this replaced already sat.
  return Math.floor((CLOCK_LINES[line].em / total) * 1000) / 1000
}

/** The cap for one line of a tile drawing exactly `present`, as the stylesheet's custom property. */
export function lineFit(line: ClockLine, present: readonly ClockLine[], text: string): string {
  return fit(CLOCK_LINES[line].em, text, chromeFor(present), shareOf(line, present))
}

export function fit(em: number, text: string, chrome: number, share: number): string {
  const width = WIDTH_BUDGET / (EM_PER_CHAR * Math.max(1, text.length))
  // Rounded DOWN to two places, not to the nearest: rounding up hands back a fraction of the
  // budget the cap exists to enforce, which is the wrong direction for a cap.
  const cqw = (Math.floor(width * 100) / 100).toFixed(2)
  return `min(${em}em, max(${MIN_PX}px, calc((100cqh - ${chrome}px) * ${share})), ${cqw}cqw)`
}
