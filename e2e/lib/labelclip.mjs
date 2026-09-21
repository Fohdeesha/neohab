/**
 * What counts as a bottom-clipped widget label, measured in the page and judged here.
 *
 * It lives in one place because the two scans in e2e-textscale had their own idea of it and the
 * live-dashboard one was wrong: it failed on any overflow at all, where a label stopping at a
 * whole number of lines is the 4.05em/1.35 clamp doing exactly what it is for. Measured on Jon's
 * Haus board at phone width: boxH 52, lineH 17.28, 3.009 lines, 0.16px off the line grid - a
 * clean three-line cap, which the synthetic scan in the same suite has always accepted and the
 * live one called a failure every run since he went from 11 columns to 12.
 *
 * Still a defect: a box cut THROUGH a line, a box stopped short of its own clamp (so something
 * other than the clamp squeezed it), a clipped box with no clamp at all, and ink below a box that
 * is not clipping. e2e-portrait keeps the stricter "no overflow whatsoever" rule on purpose - a
 * stacked card is full width, so a label there has no business reaching the clamp.
 */

// runs in the page, so it closes over nothing
export const labelMetrics = () =>
  [...document.querySelectorAll('.nh-button__label')].map((l) => {
    const r = l.getBoundingClientRect()
    const range = document.createRange()
    range.selectNodeContents(l)
    const rects = [...range.getClientRects()]
    const cs = getComputedStyle(l)
    return {
      text: l.textContent,
      hClipped: l.scrollWidth > l.clientWidth + 1,
      vClipped: l.scrollHeight > l.clientHeight + 0.5,
      inkBelow: rects.length ? Math.max(...rects.map((x) => x.bottom)) - r.bottom : 0,
      lines: rects.length,
      boxH: l.clientHeight,
      lineH: parseFloat(cs.lineHeight),
      maxH: parseFloat(cs.maxHeight),
    }
  })

export const cappedAtItsClamp = (l) =>
  Number.isFinite(l.maxH) && l.boxH >= l.maxH - 1 && Math.abs(l.boxH - Math.round(l.boxH / l.lineH) * l.lineH) < 1.5

export const bottomClipped = (l) => (l.vClipped ? !cappedAtItsClamp(l) : l.inkBelow >= 0.05)

export const clipDetail = (l) =>
  l.vClipped
    ? `${l.text}: cut at ${l.boxH}px of a ${l.lineH.toFixed(1)}px line, clamp ${l.maxH}`
    : `${l.text}: ${l.inkBelow.toFixed(2)}px of ink below its box`
