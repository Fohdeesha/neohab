import { litOf, noteLit, parseLit, serialiseLit } from '../model/lastLit'

const KEY = 'neohab:lastLit'

let map: Record<string, number> | null = null
let written = ''

function load(): Record<string, number> {
  if (map) return map
  let raw: string | null = null
  try {
    raw = localStorage.getItem(KEY)
  } catch {
    // storage unavailable (private mode)
  }
  written = raw ?? ''
  map = parseLit(raw)
  return map
}

function persist(): void {
  if (!map) return
  const next = serialiseLit(map)
  if (next === written) return
  try {
    localStorage.setItem(KEY, next)
    written = next
  } catch {
    // quota or private mode
  }
}

// armed on first use rather than at import, so the module still loads where there is no window
let listening = false

function armFlush(): void {
  if (listening || typeof window === 'undefined') return
  listening = true
  window.addEventListener('pagehide', persist)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') persist()
  })
}

export function noteBrightness(item: string, brightness: number): void {
  const current = load()
  armFlush()
  if (brightness > 0) {
    map = noteLit(current, item, brightness)
    return
  }
  persist()
}

export function lastLitBrightness(item: string): number {
  return litOf(load(), item)
}
