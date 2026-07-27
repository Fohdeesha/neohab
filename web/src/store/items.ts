/**
 * Live item-state store. Components read individual item states and re-render only when their
 * item changes.
 *
 * One tab per browser (the {@link TabLink} leader) owns the SSE connection; the rest are
 * followers that open no connection at all. Followers publish the items they need, the leader
 * tracks the union of everyone's items and relays every state it receives. Widgets are unaware
 * of any of this: subscribeItems/useItemState behave the same either way.
 *
 * See api/tabLink.ts for why: event streams are permanent connections, and a browser only has
 * six per origin for all its tabs put together.
 */
import { create } from 'zustand'
import { StatesTracker, type StateMap } from '../api/sse'
import { getTabLink, type TabMessage } from '../api/tabLink'
import type { ItemState } from '../api/types'

interface ItemsState {
  states: StateMap
  /** Item states are flowing (directly, or relayed from the leader tab). */
  connected: boolean
}

const tracker = new StatesTracker()
const link = getTabLink()

/** Item names currently needed by mounted widgets, ref-counted. Kept outside the store:
 * subscription changes shouldn't notify every widget the way a setState would. */
const trackedCounts = new Map<string, number>()

/** Leader only: what each follower tab needs, and when it last said so. */
interface FollowerNeed {
  items: string[]
  audio: boolean
  at: number
}
const followers = new Map<string, FollowerNeed>()
/** A follower that has not repeated itself for this long is gone (closed, crashed, frozen). */
const FOLLOWER_TTL_MS = 6000
let lastUnionKey = ''
/** Everything seen so far, so a tab that joins later can be handed the current picture at once
 * (and so a follower promoted to leader can hand over what it already knows). */
let snapshot: StateMap = {}
let wantsAudio = false
let started = false
let liveNow = false
let pruneTimer: ReturnType<typeof setInterval> | null = null

export const useItemsStore = create<ItemsState>(() => ({
  states: {},
  connected: false,
}))

function applyStates(delta: StateMap): void {
  // Each event carries the complete state of the items it mentions, so replace per item.
  // (The server intentionally omits displayState when it equals the raw state - merging old
  // fields over a new event would keep a stale formatted value around.)
  useItemsStore.setState((s) => ({ states: { ...s.states, ...delta } }))
  snapshot = { ...snapshot, ...delta }
}

/** Union of this tab's items and every live follower's, pushed to the server only when it moves. */
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

/** Follower -> leader: the items this tab needs. Repeated on every heartbeat so that a leader
 * which took over mid-session learns about us, and a tab that died stops being tracked. */
function publishNeed(): void {
  link.post({ t: 'need', items: [...trackedCounts.keys()], audio: wantsAudio })
}

function becomeLeader(): void {
  lastUnionKey = ''
  tracker.start()
  recomputeUnion(true)
  link.post({ t: 'lead' }) // followers answer with their needs
  // Followers repeat their needs on every heartbeat; drop the ones that stopped answering
  // (closed or crashed tabs) so we stop tracking items nobody is showing any more.
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
    // Only the leader has a stream to report on. A follower's own tracker is stopped, so its
    // status is meaningless - its connection is the leader's, reported over the link.
    if (!link.isLeader()) return
    useItemsStore.setState({ connected: live })
    link.post({ t: 'live', live })
  })

  link.onMessage((msg: TabMessage) => {
    switch (msg.t) {
      case 'states':
        // Relayed by the leader. Ignored while we lead: our own stream is the source of truth.
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
          at: Date.now(),
        })
        recomputeUnion()
        // Hand a newly seen tab the whole picture at once; waiting for its items to change
        // would leave it blank even though we already know their states. It also has no way
        // of knowing whether the stream is healthy until we say so.
        if (!known) {
          link.post({ t: 'states', states: snapshot })
          link.post({ t: 'live', live: liveNow })
        }
        break
      }
      case 'lead':
        // A new leader took over: tell it what we need.
        if (!link.isLeader()) publishNeed()
        break
      case 'beat':
        if (!link.isLeader()) publishNeed()
        break
    }
  })

  link.onRole((leader) => (leader ? becomeLeader() : becomeFollower()))
  // The election may already have been decided before the app got this far.
  if (link.isLeader()) becomeLeader()
  else publishNeed()
}

export function stopItemTracking(): void {
  tracker.stop()
  useItemsStore.setState({ connected: false })
}

/** Ref-count item subscriptions so unmounting one widget doesn't drop another's item. */
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

/**
 * Tell the leader whether this tab wants the web-audio stream (see audio/AudioRuntime): the
 * leader holds that connection for everyone, so it has to know if anyone is listening.
 */
export function setWantsAudio(want: boolean): void {
  if (wantsAudio === want) return
  wantsAudio = want
  checkAudioWant()
  needChanged()
}

/** Leader only: does this browser need the web-audio stream open at all? */
export function audioWanted(): boolean {
  return anyoneWantsAudio()
}

/** Fires when that answer changes - a follower unmuting is what opens the leader's stream. */
export function onAudioWanted(cb: (want: boolean) => void): () => void {
  audioWantListeners.add(cb)
  return () => audioWantListeners.delete(cb)
}

/** Selector hook for one item's live state. */
export function useItemState(name: string | undefined): ItemState | undefined {
  return useItemsStore((s) => (name ? s.states[name] : undefined))
}
