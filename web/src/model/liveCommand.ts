export const LIVE_ARM_PX = 3
export const LIVE_INTERVAL_MS = 200

export type LiveDragMode = 'always' | 'release'

export function liveDragModeOf(config: { liveDrag?: unknown } | undefined): LiveDragMode | undefined {
  const v = config?.liveDrag
  return v === 'always' || v === 'release' ? v : undefined
}

// a widget's own choice wins; absent falls through to the shared setting, which is on unless somebody turned it off
export function liveDragOn(config: { liveDrag?: unknown } | undefined, settings: { liveDrag?: unknown } | undefined): boolean {
  const mode = liveDragModeOf(config)
  if (mode) return mode === 'always'
  return settings?.liveDrag !== false
}

export interface LiveDeps<T> {
  command: (v: T) => string
  send: (v: T) => Promise<boolean>
  onSend?: (v: T) => void
  onRefused?: (v: T) => void
  onArm?: () => void
  onRelease?: () => void
  holdTaken?: () => boolean
  cancelHold?: () => void
  now?: () => number
  setTimer?: (fn: () => void, ms: number) => unknown
  clearTimer?: (handle: unknown) => void
}

// One press of a dragging control. Nothing goes out until the pointer has moved LIVE_ARM_PX from where it
// landed, so the jump a press makes on a track never sends and a still press stays a tap or a hold. Once
// armed: at most one command per LIVE_INTERVAL_MS, one request in flight at a time, and the value under the
// pointer at release always goes last.
export class LiveCommand<T> {
  private origin: { x: number; y: number } | null = null
  private armed = false
  private dead = false
  private staged: { v: T; cmd: string } | null = null
  private lastCmd: string | null = null
  private sentAt = -Infinity
  private inFlight = false
  private releasing = false
  private timer: unknown = null
  private gen = 0

  constructor(private readonly deps: () => LiveDeps<T>) {}

  get isLive(): boolean {
    return this.armed
  }

  begin(x: number, y: number): void {
    this.reset()
    this.origin = { x, y }
  }

  moved(x: number, y: number): void {
    if (!this.origin || this.armed || this.dead) return
    if (this.deps().holdTaken?.()) {
      this.dead = true
      return
    }
    if (Math.max(Math.abs(x - this.origin.x), Math.abs(y - this.origin.y)) <= LIVE_ARM_PX) return
    this.armed = true
    const d = this.deps()
    d.cancelHold?.()
    d.onArm?.()
  }

  stage(v: T): void {
    if (!this.armed || this.dead) return
    if (this.deps().holdTaken?.()) {
      this.dead = true
      return
    }
    this.staged = { v, cmd: this.deps().command(v) }
    this.pump()
  }

  // true when this press was live, so the caller's own release commit must not send a second time
  end(v: T): boolean {
    if (!this.origin) return false
    const live = this.armed
    this.origin = null
    if (!live) {
      this.reset()
      return false
    }
    this.deps().onRelease?.()
    if (this.dead || this.deps().holdTaken?.()) {
      this.reset()
      return true
    }
    this.staged = { v, cmd: this.deps().command(v) }
    this.releasing = true
    this.deps().onSend?.(v)
    this.pump()
    return true
  }

  // a cancelled pointer or an unmount: nothing more goes out, not even the final value
  cancel(): void {
    const wasLive = this.armed
    this.reset()
    if (wasLive) this.deps().onRelease?.()
  }

  private reset(): void {
    this.gen++
    if (this.timer !== null) {
      ;(this.deps().clearTimer ?? clearTimeout)(this.timer as ReturnType<typeof setTimeout>)
      this.timer = null
    }
    this.origin = null
    this.armed = false
    this.dead = false
    this.staged = null
    this.lastCmd = null
    this.sentAt = -Infinity
    this.inFlight = false
    this.releasing = false
  }

  private now(): number {
    return (this.deps().now ?? Date.now)()
  }

  private pump(): void {
    if (this.dead || this.inFlight) return
    if (!this.staged || this.staged.cmd === this.lastCmd) {
      this.staged = null
      if (this.releasing) this.reset()
      return
    }
    const wait = this.releasing ? 0 : this.sentAt + LIVE_INTERVAL_MS - this.now()
    if (wait > 0) {
      if (this.timer === null) {
        this.timer = (this.deps().setTimer ?? setTimeout)(() => {
          this.timer = null
          this.pump()
        }, wait)
      }
      return
    }
    this.fire()
  }

  private fire(): void {
    if (this.timer !== null) {
      ;(this.deps().clearTimer ?? clearTimeout)(this.timer as ReturnType<typeof setTimeout>)
      this.timer = null
    }
    const { v, cmd } = this.staged!
    this.staged = null
    this.lastCmd = cmd
    this.sentAt = this.now()
    this.inFlight = true
    const gen = this.gen
    const d = this.deps()
    d.onSend?.(v)
    void d.send(v).then(
      (ok) => this.landed(gen, v, ok),
      () => this.landed(gen, v, false)
    )
  }

  private landed(gen: number, v: T, ok: boolean): void {
    if (gen !== this.gen) return
    this.inFlight = false
    if (!ok) {
      this.dead = true
      this.staged = null
      this.deps().onRefused?.(v)
      if (this.releasing) this.reset()
      return
    }
    this.pump()
  }
}
