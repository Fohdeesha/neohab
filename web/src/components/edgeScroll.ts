// scrolling the page while something is dragged near its top or bottom edge, so a widget can be carried
// further than the screen shows

export const EDGE_BAND_PX = 64
export const MAX_STEP_PX = 18

/** px to scroll this frame: nothing outside the band, rising to MAX_STEP_PX at the edge and past it */
export function edgeStep(y: number, top: number, bottom: number): number {
  const band = Math.min(EDGE_BAND_PX, (bottom - top) / 4)
  if (!(band > 0)) return 0
  if (y < top + band) return -Math.ceil(MAX_STEP_PX * Math.min(1, (top + band - y) / band))
  if (y > bottom - band) return Math.ceil(MAX_STEP_PX * Math.min(1, (y - (bottom - band)) / band))
  return 0
}

// the dashboard bar and the selection bar stick to the top, so the band starts under them
function stickyTop(): number {
  let top = 0
  for (const el of document.querySelectorAll<HTMLElement>('.nh-dash__bar, .nh-selbar')) {
    const r = el.getBoundingClientRect()
    if (r.height > 0 && r.top <= top + 1) top = Math.max(top, r.bottom)
  }
  return top
}

export interface EdgeScroll {
  /** the pointer's latest clientY while a drag lasts */
  track: (clientY: number) => void
  stop: () => void
}

/** `onScrolled` runs after each step that moved the page, so the drag can re-measure under a still finger */
export function createEdgeScroll(onScrolled: () => void): EdgeScroll {
  let frame = 0
  let y: number | null = null
  const tick = () => {
    frame = 0
    if (y === null) return
    const step = edgeStep(y, stickyTop(), window.innerHeight)
    if (step === 0) return
    const before = window.scrollY
    window.scrollBy(0, step)
    if (window.scrollY === before) return // at the end of the page; the next pointer move asks again
    onScrolled()
    frame = window.requestAnimationFrame(tick)
  }
  return {
    track(clientY) {
      y = clientY
      if (!frame) frame = window.requestAnimationFrame(tick)
    },
    stop() {
      y = null
      if (frame) window.cancelAnimationFrame(frame)
      frame = 0
    }
  }
}
