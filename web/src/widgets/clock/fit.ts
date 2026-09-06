export const EM_PER_CHAR = 0.56
export const WIDTH_BUDGET = 88
export const MIN_PX = 6

export const CLOCK_LINES = {
  time: { em: 2, lh: 1.1 },
  zone: { em: 0.7, lh: 1.3 },
  date: { em: 0.9, lh: 1.35 },
  dateOnly: { em: 1.1, lh: 1.35 }
} as const

export type ClockLine = keyof typeof CLOCK_LINES

export const LINE_GAP_PX = 4
export const BASE_CHROME_PX = 14

export function chromeFor(present: readonly ClockLine[]): number {
  return BASE_CHROME_PX + LINE_GAP_PX * Math.max(0, present.length - 1)
}

export function shareOf(line: ClockLine, present: readonly ClockLine[]): number {
  const total = present.reduce((sum, l) => sum + CLOCK_LINES[l].lh * CLOCK_LINES[l].em, 0)
  if (total <= 0) return 0
  return Math.floor((CLOCK_LINES[line].em / total) * 1000) / 1000
}

export function lineFit(line: ClockLine, present: readonly ClockLine[], text: string): string {
  return fit(CLOCK_LINES[line].em, text, chromeFor(present), shareOf(line, present))
}

export function fit(em: number, text: string, chrome: number, share: number): string {
  const width = WIDTH_BUDGET / (EM_PER_CHAR * Math.max(1, text.length))
  const cqw = (Math.floor(width * 100) / 100).toFixed(2)
  return `min(${em}em, max(${MIN_PX}px, calc((100cqh - ${chrome}px) * ${share})), ${cqw}cqw)`
}
