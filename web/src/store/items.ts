import { create } from 'zustand'
import { clearUnconfirmed } from './unconfirmed'
import { StatesTracker, type StateMap } from '../api/sse'
import { getTabLink, type TabMessage } from '../api/tabLink'
import type { ItemState } from '../api/types'
import { emptyMap, mergeMap } from '../model/lookup'

interface ItemsState {
  states: StateMap
  connected: boolean
}

const tracker = new StatesTracker()
const link = getTabLink()

// kept outside the store: subscription changes must not notify every widget
const trackedCounts = new Map<string, number>()

interface FollowerNeed {
  items: string[]
  audio: boolean
  at: number
}
const followers = new Map<string, FollowerNeed>()
const FOLLOWER_TTL_MS = 6000
let lastUnionKey = ''
let snapshot: StateMap = emptyMap()
let wantsAudio = false
let started = false
let liveNow = false
let pruneTimer: ReturnType<typeof setInterval> | null = null

export const useItemsStore = create<ItemsState>(() => ({
  states: emptyMap(),
  connected: false
}))

function applyStates(delta: StateMap): void {
  useItemsStore.setState((s) => ({ states: mergeMap(s.states, delta) }))
  snapshot = mergeMap(snapshot, delta)
  // the server has answered for these items, so nothing is waiting on them any more - whether the
  // answer is the one that was asked for or not
  clearUnconfirmed(Object.keys(delta))
}

function recomputeUnion(force = false): void {
  const union = new Set(trackedCounts.keys())
  const cutoff = Date.now() - FOLLOWER_TTL_MS
  for (const [id, need] of followers) {
    if (need.at < cutoff) {
      followers.delete(id)
      continue
    }
    for (const name of need.items) union.add(name)
  }
  checkAudioWant()
  const key = JSON.stringify([...union].sort())
  if (!force && key === lastUnionKey) return
  lastUnionKey = key
  tracker.setTracked(union)
}

function anyoneWantsAudio(): boolean {
  if (wantsAudio) return true
  const cutoff = Date.now() - FOLLOWER_TTL_MS
  for (const need of followers.values()) if (need.audio && need.at >= cutoff) return true
  return false
}

const audioWantListeners = new Set<(want: boolean) => void>()
let lastAudioWant = false
function checkAudioWant(): void {
  const want = anyoneWantsAudio()
  if (want === lastAudioWant) return
  lastAudioWant = want
  for (const cb of audioWantListeners) cb(want)
}

function publishNeed(): void {
  link.post({ t: 'need', items: [...trackedCounts.keys()], audio: wantsAudio })
}

function becomeLeader(): void {
  lastUnionKey = ''
  tracker.start()
  recomputeUnion(true)
  link.post({ t: 'lead' }) // followers answer with their needs
  pruneTimer ??= setInterval(() => recomputeUnion(), FOLLOWER_TTL_MS / 2)
}

function becomeFollower(): void {
  tracker.stop()
  followers.clear()
  lastUnionKey = ''
  if (pruneTimer) {
    clearInterval(pruneTimer)
    pruneTimer = null
  }
  publishNeed()
}

export function startItemTracking(): void {
  if (started) return
  started = true

  tracker.onStates((delta: StateMap) => {
    applyStates(delta)
    if (link.isLeader()) link.post({ t: 'states', states: delta })
  })
  tracker.onStatus((live) => {
    liveNow = live
    if (!link.isLeader()) return
    useItemsStore.setState({ connected: live })
    link.post({ t: 'live', live })
  })

  link.onMessage((msg: TabMessage) => {
    switch (msg.t) {
      case 'states':
        if (!link.isLeader()) applyStates(msg.states as StateMap)
        break
      case 'live':
        if (!link.isLeader()) useItemsStore.setState({ connected: msg.live === true })
        break
      case 'need': {
        if (!link.isLeader()) break
        const known = followers.has(msg.from)
        followers.set(msg.from, {
          items: Array.isArray(msg.items) ? (msg.items as string[]) : [],
          audio: msg.audio === true,
          at: Date.now()
        })
        recomputeUnion()
        if (!known) {
          link.post({ t: 'states', states: snapshot })
          link.post({ t: 'live', live: liveNow })
        }
        break
      }
      case 'lead':
        if (!link.isLeader()) publishNeed()
        break
      case 'beat':
        if (!link.isLeader()) publishNeed()
        break
    }
  })

  link.onRole((leader) => (leader ? becomeLeader() : becomeFollower()))
  if (link.isLeader()) becomeLeader()
  else publishNeed()
}

export function subscribeItems(names: string[]): () => void {
  if (names.length === 0) return () => {}
  for (const n of names) trackedCounts.set(n, (trackedCounts.get(n) ?? 0) + 1)
  needChanged()

  return () => {
    for (const n of names) {
      const c = (trackedCounts.get(n) ?? 1) - 1
      if (c <= 0) trackedCounts.delete(n)
      else trackedCounts.set(n, c)
    }
    needChanged()
  }
}

function needChanged(): void {
  if (link.isLeader()) recomputeUnion()
  else publishNeed()
}

export function setWantsAudio(want: boolean): void {
  if (wantsAudio === want) return
  wantsAudio = want
  checkAudioWant()
  needChanged()
}

export function audioWanted(): boolean {
  return anyoneWantsAudio()
}

export function onAudioWanted(cb: (want: boolean) => void): () => void {
  audioWantListeners.add(cb)
  return () => audioWantListeners.delete(cb)
}

// prototype-free like the store's own map, since getItem takes whatever a widget names
export function selectStates(states: StateMap, names: string[]): StateMap {
  const out = emptyMap<ItemState>()
  for (const name of names) out[name] = states[name]
  return out
}

export function useItemState(name: string | undefined): ItemState | undefined {
  return useItemsStore((s) => (name ? s.states[name] : undefined))
}
