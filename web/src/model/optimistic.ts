/**
 * What a control shows after it sends a value, decided once per render.
 *
 * - Inside the settle window it shows what it sent, so a device that echoes its old state on the way
 *   to the new one does not snap the control back.
 * - An `autoupdate=false` item gets nothing back from openHAB, so a value sent while such an answer was
 *   awaited stays until that answer arrives - this control's own wait, never a later one some other
 *   control on the item started.
 * - After the window it stays only if the item settled close to it (a dimmer that reports 49.8 for
 *   50), and only until the item next changes: a schedule moving a setpoint from 21 to 20.5 later is
 *   a real change, and the next "+" must step from 20.5.
 * - It is dropped at once while another control drags the same item.
 */
export interface Pending<T> {
  v: T
  at: number
  // this control's command is the one an `autoupdate=false` item is waiting on
  awaited: boolean
  // the item's state when the window closed with it close to what was sent
  settledOn?: string | number
}

export interface PendingInput {
  now: number
  settleMs: number
  waiting: boolean
  dragging: boolean
  liveKey: string | number
  close: boolean
}

export function stepPending<T>(p: Pending<T> | null, o: PendingInput): Pending<T> | null {
  if (p === null) return null
  if (o.dragging) return null
  if (o.now - p.at < o.settleMs) return o.waiting && !p.awaited ? { ...p, awaited: true } : p
  if (p.awaited) return o.waiting ? p : null
  if (p.settledOn === undefined) return o.close ? { ...p, settledOn: o.liveKey } : null
  return Object.is(p.settledOn, o.liveKey) ? p : null
}
