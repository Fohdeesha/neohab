import { create } from 'zustand'
import { emptyMap, mergeMap } from '../model/lookup'

/**
 * What we have asked for and nobody has confirmed.
 *
 * An item with `autoupdate` vetoed never gets a state from its command: openHAB hands the command
 * to the binding and posts nothing at all. So a control reading the state alone cannot move, and a
 * toggle keeps choosing the same command for ever - measured on a live 4.3.11 server as five OFF
 * commands in a row with no ItemStatePredictedEvent and no ItemStateChangedEvent behind any of them.
 *
 * Holding the commanded value here lets such a control show what was asked for. There is no expiry,
 * on purpose: the settle window in `useOptimisticValue` exists so a stale guess cannot hide a real
 * change, and here the server has promised there will be no change to hide. A real state update
 * clears it at once, which is what keeps the tile honest on an item that IS reported back later.
 *
 * Built through emptyMap/mergeMap because the keys are item names, and openHAB accepts
 * `constructor` and `__proto__` as item names.
 */
interface UnconfirmedState {
  asked: Record<string, string>
}

export const useUnconfirmedStore = create<UnconfirmedState>(() => ({ asked: emptyMap<string>() }))

export function noteUnconfirmed(item: string, command: string): void {
  useUnconfirmedStore.setState((s) => ({ asked: mergeMap(s.asked, { [item]: command }) }))
}

/** a state arrived, so whatever was waiting on these items is answered - rightly or wrongly */
export function clearUnconfirmed(items: string[]): void {
  const asked = useUnconfirmedStore.getState().asked
  if (!items.some((name) => name in asked)) return
  const drop = new Set(items)
  const next = emptyMap<string>()
  for (const [name, value] of Object.entries(asked)) {
    if (!drop.has(name)) next[name] = value
  }
  useUnconfirmedStore.setState({ asked: next })
}

export function clearAllUnconfirmed(): void {
  if (Object.keys(useUnconfirmedStore.getState().asked).length === 0) return
  useUnconfirmedStore.setState({ asked: emptyMap<string>() })
}

export function useUnconfirmed(item: string | undefined): string | undefined {
  return useUnconfirmedStore((s) => (item === undefined ? undefined : s.asked[item]))
}
